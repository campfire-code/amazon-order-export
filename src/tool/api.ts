// SP-API 客户端：换访问令牌、翻页拉订单、翻页拉 FBA 库存。网络请求函数由外部注入，测试时用模拟响应。
// 自 2023-10-02 起 SP-API 不再要求 AWS SigV4 签名，只需在请求头 x-amz-access-token 带 LWA 访问令牌（官方变更公告）。
import {
  LWA_TOKEN_URL, RATE, TokenBucket, backoffMs, endpointFor, explainError, inventoryQuery, isAbort, realClock, searchOrdersQuery, tokenRequestBody,
  type ApiInventorySummary, type ApiOrder, type Clock, type Credentials, type OrderQuery,
} from './core';

export interface FetchRes { status: number; text(): Promise<string>; headers: { get(name: string): string | null } }
export type Fetcher = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<FetchRes>;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Progress = (p: { stage: 'token' | 'orders' | 'inventory'; page: number; count: number; waitMs?: number; note?: string }) => void;

const MAX_RETRY = 5;

export class SpApiClient {
  private token: { value: string; until: number } | null = null;
  private buckets: { orders: TokenBucket; inventory: TokenBucket };

  constructor(private cred: Credentials, private fetcher: Fetcher, private clock: Clock = realClock) {
    const now = clock.now();
    this.buckets = {
      orders: new TokenBucket(RATE.searchOrders.rate, RATE.searchOrders.burst, now),
      inventory: new TokenBucket(RATE.inventorySummaries.rate, RATE.inventorySummaries.burst, now),
    };
  }

  /** 用 refresh token 换访问令牌（有效期见返回的 expires_in，官方说明为 1 小时），提前 1 分钟刷新 */
  async accessToken(signal?: AbortSignal): Promise<string> {
    const now = this.clock.now();
    if (this.token && this.token.until > now) return this.token.value;
    const res = await this.fetcher(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: tokenRequestBody(this.cred),
      signal,
    });
    const text = await res.text();
    if (res.status !== 200) throw new ApiError(res.status, explainError(res.status, text));
    const j = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new ApiError(res.status, '授权服务器没有返回访问令牌');
    this.token = { value: j.access_token, until: now + Math.max(60, (j.expires_in ?? 3600) - 60) * 1000 };
    return j.access_token;
  }

  /** 带限速、429 / 5xx 退避重试的 GET */
  private async get(url: string, bucket: TokenBucket, signal: AbortSignal | undefined, onWait: (ms: number, note: string) => void): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw Object.assign(new Error('已停止'), { name: 'AbortError' });
      const wait = bucket.take(this.clock.now());
      if (wait > 0) { onWait(wait, '按亚马逊限速排队'); await this.clock.sleep(wait, signal); }
      const token = await this.accessToken(signal);
      const res = await this.fetcher(url, { method: 'GET', headers: { 'x-amz-access-token': token, Accept: 'application/json' }, signal });
      const limit = Number(res.headers.get('x-amzn-RateLimit-Limit'));
      if (limit > 0) bucket.setRate(limit);
      const text = await res.text();
      if (res.status === 200) return JSON.parse(text);
      if (res.status === 401) this.token = null;
      const retryable = (res.status === 401 && attempt === 0) || res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_RETRY) throw new ApiError(res.status, explainError(res.status, text));
      bucket.drain(this.clock.now());
      const ms = backoffMs(attempt, res.status === 429 ? Math.ceil(1000 / bucket.rate) : 0);
      onWait(ms, res.status === 429 ? '被限流，等待后重试' : '服务器出错，等待后重试');
      await this.clock.sleep(ms, signal);
    }
  }

  /** 翻页拉取订单（searchOrders，订单明细随订单一起返回） */
  async searchOrders(q: Omit<OrderQuery, 'paginationToken'>, onPage: (orders: ApiOrder[]) => void, progress: Progress, signal?: AbortSignal): Promise<void> {
    const base = endpointFor(q.marketplaceId) + '/orders/2026-01-01/orders?';
    let token: string | undefined;
    let page = 0;
    let count = 0;
    do {
      const data = await this.get(base + searchOrdersQuery({ ...q, paginationToken: token }), this.buckets.orders, signal, (waitMs, note) => progress({ stage: 'orders', page: page + 1, count, waitMs, note }));
      const d = data as { orders?: ApiOrder[]; pagination?: { nextToken?: string } };
      const orders = d.orders ?? [];
      page++;
      count += orders.length;
      onPage(orders);
      progress({ stage: 'orders', page, count });
      token = d.pagination?.nextToken || undefined;
    } while (token);
  }

  /** 翻页拉取 FBA 库存（getInventorySummaries，details=true）。官方说明 nextToken 30 秒内有效，所以拉完一页立刻拉下一页 */
  async inventory(marketplaceId: string, onPage: (rows: ApiInventorySummary[]) => void, progress: Progress, signal?: AbortSignal): Promise<void> {
    const base = endpointFor(marketplaceId) + '/fba/inventory/v1/summaries?';
    let token: string | undefined;
    let page = 0;
    let count = 0;
    do {
      const data = await this.get(base + inventoryQuery(marketplaceId, token), this.buckets.inventory, signal, (waitMs, note) => progress({ stage: 'inventory', page: page + 1, count, waitMs, note }));
      const d = data as { payload?: { inventorySummaries?: ApiInventorySummary[] }; pagination?: { nextToken?: string } };
      const rows = d.payload?.inventorySummaries ?? [];
      page++;
      count += rows.length;
      onPage(rows);
      progress({ stage: 'inventory', page, count });
      token = d.pagination?.nextToken || undefined;
    } while (token);
  }
}

export { isAbort };
