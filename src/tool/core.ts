// 纯函数：不依赖界面和本机能力，便于单元测试。
// 接口约定以亚马逊官方为准：
// - 站点与端点：https://developer-docs.amazon.com/sp-api/docs/marketplace-ids 、/docs/sp-api-endpoints
// - 订单：官方模型 amzn/selling-partner-api-models models/orders-api-model/orders_2026-01-01.json（searchOrders）
// - FBA 库存：官方模型 models/fba-inventory-api-model/fbaInventory.json（getInventorySummaries）
// - 换取访问令牌：https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api

export type RegionId = 'na' | 'eu' | 'fe';

export const REGIONS: Record<RegionId, { name: string; endpoint: string }> = {
  na: { name: '北美', endpoint: 'https://sellingpartnerapi-na.amazon.com' },
  eu: { name: '欧洲', endpoint: 'https://sellingpartnerapi-eu.amazon.com' },
  fe: { name: '远东', endpoint: 'https://sellingpartnerapi-fe.amazon.com' },
};

export interface Marketplace { id: string; code: string; name: string; region: RegionId }

/** 站点编号：官方「Marketplace IDs」页 */
export const MARKETPLACES: Marketplace[] = [
  { id: 'ATVPDKIKX0DER', code: 'US', name: '美国', region: 'na' },
  { id: 'A2EUQ1WTGCTBG2', code: 'CA', name: '加拿大', region: 'na' },
  { id: 'A1AM78C64UM0Y8', code: 'MX', name: '墨西哥', region: 'na' },
  { id: 'A2Q3Y263D00KWC', code: 'BR', name: '巴西', region: 'na' },
  { id: 'A1F83G8C2ARO7P', code: 'UK', name: '英国', region: 'eu' },
  { id: 'A1PA6795UKMFR9', code: 'DE', name: '德国', region: 'eu' },
  { id: 'A13V1IB3VIYZZH', code: 'FR', name: '法国', region: 'eu' },
  { id: 'APJ6JRA9NG5V4', code: 'IT', name: '意大利', region: 'eu' },
  { id: 'A1RKKUPIHCS9HS', code: 'ES', name: '西班牙', region: 'eu' },
  { id: 'A1805IZSGTT6HS', code: 'NL', name: '荷兰', region: 'eu' },
  { id: 'AMEN7PMS3EDWL', code: 'BE', name: '比利时', region: 'eu' },
  { id: 'A2NODRKZP88ZB9', code: 'SE', name: '瑞典', region: 'eu' },
  { id: 'A1C3SOZRARQ6R3', code: 'PL', name: '波兰', region: 'eu' },
  { id: 'A28R8C7NBKEWEA', code: 'IE', name: '爱尔兰', region: 'eu' },
  { id: 'A33AVAJ2PDY3EV', code: 'TR', name: '土耳其', region: 'eu' },
  { id: 'A2VIGQ35RCS4UG', code: 'AE', name: '阿联酋', region: 'eu' },
  { id: 'A17E79C6D8DWNP', code: 'SA', name: '沙特阿拉伯', region: 'eu' },
  { id: 'ARBP9OOSHTCHU', code: 'EG', name: '埃及', region: 'eu' },
  { id: 'A21TJRUUN4KGV', code: 'IN', name: '印度', region: 'eu' },
  { id: 'AE08WJ6YKNBMC', code: 'ZA', name: '南非', region: 'eu' },
  { id: 'A1VC38T7YXB528', code: 'JP', name: '日本', region: 'fe' },
  { id: 'A39IBJ37TRP1C6', code: 'AU', name: '澳大利亚', region: 'fe' },
  { id: 'A19VAU5U5O7RUS', code: 'SG', name: '新加坡', region: 'fe' },
];

export const marketplaceById = (id: string) => MARKETPLACES.find((m) => m.id === id);
export const endpointFor = (marketplaceId: string) => REGIONS[marketplaceById(marketplaceId)?.region ?? 'na'].endpoint;

/** searchOrders 的 fulfillmentStatuses 取值（官方模型 FulfillmentStatus 枚举） */
export const STATUSES: [string, string][] = [
  ['PENDING', '待付款确认'],
  ['UNSHIPPED', '待发货'],
  ['PARTIALLY_SHIPPED', '部分发货'],
  ['SHIPPED', '已发货'],
  ['CANCELLED', '已取消'],
  ['UNFULFILLABLE', '无法配送'],
  ['PENDING_AVAILABILITY', '预售待上市'],
];
export const statusName = (s?: string) => (s ? STATUSES.find(([k]) => k === s)?.[1] ?? s : '');

export const FULFILLED_BY: [string, string][] = [['', '全部'], ['AMAZON', '亚马逊物流配送（FBA）'], ['MERCHANT', '卖家自配送']];
export const fulfilledByName = (s?: string) => (s === 'AMAZON' ? 'FBA' : s === 'MERCHANT' ? '自配送' : s ?? '');

// ---------------- 授权 ----------------

export interface Credentials { clientId: string; clientSecret: string; refreshToken: string }
export const credReady = (c: Credentials) => Boolean(c.clientId.trim() && c.clientSecret.trim() && c.refreshToken.trim());

export const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

/** 用 refresh token 换访问令牌的请求体（application/x-www-form-urlencoded） */
export function tokenRequestBody(c: Credentials): string {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: c.refreshToken.trim(),
    client_id: c.clientId.trim(),
    client_secret: c.clientSecret.trim(),
  }).toString();
}

/** 界面上显示凭据：只露出首尾几位 */
export function maskSecret(s: string): string {
  const t = s.trim();
  if (!t) return '';
  if (t.length <= 8) return '•'.repeat(t.length);
  return `${t.slice(0, 4)}${'•'.repeat(6)}${t.slice(-4)}`;
}

// ---------------- 日期区间 ----------------

const pad = (n: number) => String(n).padStart(2, '0');
/** 本地日期 → YYYY-MM-DD */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 快捷区间：近 N 天（含今天），返回本地日期字符串 */
export function presetRange(days: number, now: Date): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return { from: ymd(start), to: ymd(now) };
}

/**
 * 把界面上的本地日期区间换成接口要的 ISO 8601（UTC）时间。
 * 官方要求：createdBefore 不能晚于请求时刻前两分钟，所以结束时间最多取「现在 − 3 分钟」。
 */
export function toApiRange(from: string, to: string, now: Date): { createdAfter: string; createdBefore: string } {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = re.exec(from);
  const b = re.exec(to);
  if (!a || !b) throw new Error('请选择开始和结束日期');
  const start = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const endOfDay = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]) + 1).getTime() - 1000;
  const latest = now.getTime() - 3 * 60_000;
  const end = Math.min(endOfDay, latest);
  if (start.getTime() > end) throw new Error(start.getTime() > latest ? '开始日期不能晚于今天' : '开始日期不能晚于结束日期');
  const iso = (t: number) => new Date(Math.floor(t / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  return { createdAfter: iso(start.getTime()), createdBefore: iso(end) };
}

// ---------------- 请求参数 ----------------

export interface OrderQuery {
  marketplaceId: string;
  createdAfter: string;
  createdBefore: string;
  statuses: string[];
  fulfilledBy: string;
  paginationToken?: string;
}

/** 本工具请求的数据集：金额与配送信息；不请求 BUYER / RECIPIENT（买家姓名、地址等个人信息） */
export const INCLUDED_DATA = ['PROCEEDS', 'FULFILLMENT'];

/** searchOrders 查询串。数组参数按官方模型默认的逗号分隔格式 */
export function searchOrdersQuery(q: OrderQuery): string {
  const p = new URLSearchParams();
  p.set('createdAfter', q.createdAfter);
  p.set('createdBefore', q.createdBefore);
  p.set('marketplaceIds', q.marketplaceId);
  if (q.statuses.length) p.set('fulfillmentStatuses', q.statuses.join(','));
  if (q.fulfilledBy) p.set('fulfilledBy', q.fulfilledBy);
  p.set('includedData', INCLUDED_DATA.join(','));
  p.set('maxResultsPerPage', '100');
  if (q.paginationToken) p.set('paginationToken', q.paginationToken);
  return p.toString();
}

export function inventoryQuery(marketplaceId: string, nextToken?: string): string {
  const p = new URLSearchParams({ details: 'true', granularityType: 'Marketplace', granularityId: marketplaceId, marketplaceIds: marketplaceId });
  if (nextToken) p.set('nextToken', nextToken);
  return p.toString();
}

// ---------------- 响应 → 表格行 ----------------

interface Money { amount?: string; currencyCode?: string }
export interface ApiOrderItem {
  orderItemId: string;
  quantityOrdered: number;
  product?: { asin?: string; title?: string; sellerSku?: string; condition?: { conditionType?: string }; price?: { unitPrice?: Money } };
  proceeds?: { proceedsTotal?: Money };
  fulfillment?: { quantityFulfilled?: number; quantityUnfulfilled?: number };
}
export interface ApiOrder {
  orderId: string;
  createdTime: string;
  lastUpdatedTime: string;
  salesChannel?: { channelName?: string; marketplaceId?: string; marketplaceName?: string };
  orderAliases?: { aliasId: string; aliasType: string }[];
  programs?: string[];
  proceeds?: { grandTotal?: Money };
  fulfillment?: { fulfillmentStatus?: string; fulfilledBy?: string; fulfillmentServiceLevel?: string; shipByWindow?: { latestDateTime?: string } };
  orderItems?: ApiOrderItem[];
}
export interface ApiInventorySummary {
  asin?: string;
  fnSku?: string;
  sellerSku?: string;
  condition?: string;
  productName?: string;
  totalQuantity?: number;
  lastUpdatedTime?: string;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
    researchingQuantity?: { totalResearchingQuantity?: number };
  };
}

export type Row = Record<string, string | number>;

/** 每个表的列：[键, 表头, Excel 列宽] */
export const ORDER_COLS: [string, string, number][] = [
  ['orderId', '订单号', 22], ['sellerOrderId', '卖家订单号', 18], ['created', '下单时间', 19], ['updated', '最后更新', 19],
  ['status', '状态', 10], ['fulfilledBy', '配送方式', 9], ['serviceLevel', '配送时效', 12], ['shipBy', '最晚发货', 19],
  ['units', '件数', 7], ['skuCount', 'SKU 数', 7], ['total', '订单金额', 11], ['currency', '币种', 6], ['marketplace', '站点', 12], ['programs', '标记', 16],
];
export const ITEM_COLS: [string, string, number][] = [
  ['orderId', '订单号', 22], ['created', '下单时间', 19], ['status', '订单状态', 10], ['sku', 'SKU', 20], ['asin', 'ASIN', 13], ['title', '商品标题', 42],
  ['qty', '数量', 6], ['shipped', '已发', 6], ['unitPrice', '单价', 9], ['itemTotal', '小计（到手）', 11], ['currency', '币种', 6], ['condition', '成色', 8],
];
export const INVENTORY_COLS: [string, string, number][] = [
  ['sku', 'SKU', 20], ['asin', 'ASIN', 13], ['fnSku', 'FNSKU', 13], ['name', '商品名称', 40], ['condition', '成色', 12],
  ['fulfillable', '可售', 7], ['reserved', '预留', 7], ['inboundWorking', '入库-已创建', 10], ['inboundShipped', '入库-在途', 9], ['inboundReceiving', '入库-接收中', 10],
  ['unfulfillable', '不可售', 7], ['researching', '调查中', 7], ['total', '总数', 7], ['updated', '更新时间', 19],
];

/** ISO 时间 → 本地「YYYY-MM-DD HH:mm」 */
export function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const num = (m?: Money) => (m?.amount != null && m.amount !== '' && !Number.isNaN(Number(m.amount)) ? Number(m.amount) : '');

export function orderRow(o: ApiOrder): Row {
  const items = o.orderItems ?? [];
  return {
    orderId: o.orderId,
    sellerOrderId: o.orderAliases?.find((a) => a.aliasType === 'SELLER_ORDER_ID')?.aliasId ?? '',
    created: fmtTime(o.createdTime),
    updated: fmtTime(o.lastUpdatedTime),
    status: statusName(o.fulfillment?.fulfillmentStatus),
    fulfilledBy: fulfilledByName(o.fulfillment?.fulfilledBy),
    serviceLevel: o.fulfillment?.fulfillmentServiceLevel ?? '',
    shipBy: fmtTime(o.fulfillment?.shipByWindow?.latestDateTime),
    units: items.reduce((a, it) => a + (it.quantityOrdered || 0), 0),
    skuCount: items.length,
    total: num(o.proceeds?.grandTotal),
    currency: o.proceeds?.grandTotal?.currencyCode ?? items.find((it) => it.product?.price?.unitPrice?.currencyCode)?.product?.price?.unitPrice?.currencyCode ?? '',
    marketplace: o.salesChannel?.marketplaceName ?? marketplaceById(o.salesChannel?.marketplaceId ?? '')?.name ?? '',
    programs: (o.programs ?? []).join(','),
  };
}

export function itemRows(o: ApiOrder): Row[] {
  return (o.orderItems ?? []).map((it) => ({
    orderId: o.orderId,
    created: fmtTime(o.createdTime),
    status: statusName(o.fulfillment?.fulfillmentStatus),
    sku: it.product?.sellerSku ?? '',
    asin: it.product?.asin ?? '',
    title: it.product?.title ?? '',
    qty: it.quantityOrdered ?? 0,
    shipped: it.fulfillment?.quantityFulfilled ?? '',
    unitPrice: num(it.product?.price?.unitPrice),
    itemTotal: num(it.proceeds?.proceedsTotal),
    currency: it.product?.price?.unitPrice?.currencyCode ?? it.proceeds?.proceedsTotal?.currencyCode ?? '',
    condition: it.product?.condition?.conditionType ?? '',
  }));
}

export function inventoryRow(s: ApiInventorySummary): Row {
  const d = s.inventoryDetails ?? {};
  return {
    sku: s.sellerSku ?? '',
    asin: s.asin ?? '',
    fnSku: s.fnSku ?? '',
    name: s.productName ?? '',
    condition: s.condition ?? '',
    fulfillable: d.fulfillableQuantity ?? '',
    reserved: d.reservedQuantity?.totalReservedQuantity ?? '',
    inboundWorking: d.inboundWorkingQuantity ?? '',
    inboundShipped: d.inboundShippedQuantity ?? '',
    inboundReceiving: d.inboundReceivingQuantity ?? '',
    unfulfillable: d.unfulfillableQuantity?.totalUnfulfillableQuantity ?? '',
    researching: d.researchingQuantity?.totalResearchingQuantity ?? '',
    total: s.totalQuantity ?? '',
    updated: fmtTime(s.lastUpdatedTime),
  };
}

/** 分页结果合并：按订单号去重（翻页期间订单有更新时可能重复出现，保留后出现的） */
export function mergeOrders(pages: ApiOrder[][]): ApiOrder[] {
  const map = new Map<string, ApiOrder>();
  for (const page of pages) for (const o of page) map.set(o.orderId, o);
  return [...map.values()].sort((a, b) => (a.createdTime < b.createdTime ? 1 : a.createdTime > b.createdTime ? -1 : 0));
}

export function mergeInventory(pages: ApiInventorySummary[][]): ApiInventorySummary[] {
  const map = new Map<string, ApiInventorySummary>();
  for (const page of pages) for (const s of page) map.set(`${s.sellerSku ?? ''}|${s.fnSku ?? ''}|${s.condition ?? ''}`, s);
  return [...map.values()];
}

export interface Totals { orders: number; units: number; amount: Record<string, number>; items: number; skus: number; fulfillable: number }

export function totals(orders: ApiOrder[], inventory: ApiInventorySummary[]): Totals {
  const amount: Record<string, number> = {};
  let units = 0;
  let items = 0;
  for (const o of orders) {
    const g = o.proceeds?.grandTotal;
    if (g?.currencyCode && g.amount && o.fulfillment?.fulfillmentStatus !== 'CANCELLED') amount[g.currencyCode] = Math.round(((amount[g.currencyCode] ?? 0) + Number(g.amount)) * 100) / 100;
    for (const it of o.orderItems ?? []) { units += it.quantityOrdered || 0; items++; }
  }
  return { orders: orders.length, units, amount, items, skus: inventory.length, fulfillable: inventory.reduce((a, s) => a + (s.inventoryDetails?.fulfillableQuantity ?? 0), 0) };
}

export const amountText = (a: Record<string, number>) => Object.entries(a).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(' · ') || '—';

/** 导出文件名，例如「亚马逊-US-订单库存-20261001至20261023-1530.xlsx」 */
export function exportFileName(code: string, from: string, to: string, now: Date): string {
  return `亚马逊-${code}-订单库存-${from.replace(/-/g, '')}至${to.replace(/-/g, '')}-${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
}

// ---------------- 限速与重试 ----------------

export interface Clock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) => new Promise((ok, fail) => {
    if (signal?.aborted) return fail(abortError());
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); ok(); }, ms);
    const onAbort = () => { clearTimeout(t); fail(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  }),
};

export const abortError = () => Object.assign(new Error('已停止'), { name: 'AbortError' });
export const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

/**
 * 令牌桶限速：与亚马逊的 usage plan 模型一致（rate 次/秒，burst 为桶容量）。
 * take() 返回需要等待的毫秒数并扣掉一个令牌。
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(public rate: number, public burst: number, now: number) {
    this.tokens = burst;
    this.last = now;
  }
  private refill(now: number) {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
  }
  /** 预约一个令牌，返回需等待的毫秒数（0 表示可以立刻发） */
  take(now: number): number {
    this.refill(now);
    this.tokens -= 1;
    return this.tokens >= 0 ? 0 : Math.ceil((-this.tokens / this.rate) * 1000);
  }
  /** 被 429 拒绝后清空桶，下一次要等一个完整周期 */
  drain(now: number) {
    this.refill(now);
    this.tokens = Math.min(this.tokens, 0);
  }
  /** 根据响应头 x-amzn-RateLimit-Limit 更新速率（卖家的实际额度可能高于默认值） */
  setRate(rate: number) {
    if (Number.isFinite(rate) && rate > 0) this.rate = rate;
  }
}

/** 第 n 次重试前的退避时间：2、4、8… 秒，上限 60 秒；若限速器要求更久则取更久 */
export const backoffMs = (attempt: number, bucketWait = 0) => Math.max(Math.min(60_000, 2000 * 2 ** attempt), bucketWait);

/** 官方默认限速（各接口参考文档 Usage Plan 表）；卖家实际额度以响应头为准 */
export const RATE = {
  searchOrders: { rate: 0.0056, burst: 20 },
  inventorySummaries: { rate: 2, burst: 2 },
} as const;

// ---------------- 错误信息 ----------------

/** 把接口错误翻成中文提示（只包含错误码与说明，不含凭据） */
export function explainError(status: number, body: string): string {
  let code = '';
  let message = '';
  try {
    const j = JSON.parse(body) as { errors?: { code?: string; message?: string }[]; error?: string; error_description?: string };
    if (j.errors?.length) { code = j.errors[0].code ?? ''; message = j.errors[0].message ?? ''; }
    else if (j.error) { code = j.error; message = j.error_description ?? ''; }
  } catch { /* 不是 JSON */ }
  const tail = message ? `（${code ? code + '：' : ''}${message.slice(0, 160)}）` : code ? `（${code}）` : '';
  if (code === 'invalid_client') return `Client ID（客户端编号）或 Client Secret（客户端密钥）不正确${tail}`;
  if (code === 'invalid_grant') return `Refresh Token（刷新令牌）无效或已被撤销，请到卖家后台重新授权${tail}`;
  if (status === 401) return `授权失败，请检查凭据${tail}`;
  if (status === 403) return `没有权限：应用可能未申请对应角色，或站点不属于该卖家账户${tail}`;
  if (status === 429) return `请求太频繁，被亚马逊限流${tail}`;
  if (status === 400) return `请求参数不被接受${tail}`;
  if (status >= 500) return `亚马逊服务器暂时出错（HTTP ${status}），稍后重试${tail}`;
  return `请求失败（HTTP ${status}）${tail}`;
}
