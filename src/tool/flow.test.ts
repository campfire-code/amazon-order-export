import { describe, expect, it } from 'vitest';
import { runExport, validateOpts, type ExportOpts, type Io } from './flow';
import { SpApiClient, type Fetcher, type FetchRes } from './api';
import { abortError, type Clock } from './core';
import { inspectXlsx } from './xlsx';
import token from './fixtures/lwa-token.json';
import orders1 from './fixtures/orders-page1.json';
import orders2 from './fixtures/orders-page2.json';
import inv1 from './fixtures/inventory-page1.json';
import inv2 from './fixtures/inventory-page2.json';
import e403 from './fixtures/error-403.json';
import e429 from './fixtures/error-429.json';
import grant from './fixtures/lwa-invalid-grant.json';

const cred = { clientId: 'amzn1.application-oa2-client.TESTID', clientSecret: 'TEST-SECRET-VALUE', refreshToken: 'Atzr|TEST-REFRESH-TOKEN' };
const now = new Date(2026, 9, 23, 15, 30);
const opts: ExportOpts = { marketplaceId: 'ATVPDKIKX0DER', from: '2026-10-01', to: '2026-10-23', statuses: [], fulfilledBy: '', wantOrders: true, wantItems: true, wantInventory: true };

const res = (status: number, body: unknown, headers: Record<string, string> = {}): FetchRes => ({ status, text: async () => JSON.stringify(body), headers: { get: (n) => headers[n] ?? null } });
type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** 假的网络：按地址返回录制响应，并记下每次请求。script 可覆盖某次请求的响应 */
function fake(script: (call: Call, n: number) => FetchRes | undefined = () => undefined) {
  const calls: Call[] = [];
  const f: Fetcher = async (url, init) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const s = script(call, calls.length);
    if (s) return s;
    const u = new URL(url);
    if (u.host === 'api.amazon.com') return res(200, token);
    if (u.pathname.endsWith('/orders')) return res(200, u.searchParams.get('paginationToken') ? orders2 : orders1);
    if (u.pathname.endsWith('/summaries')) return res(200, u.searchParams.get('nextToken') ? inv2 : inv1);
    return res(404, {});
  };
  return { f, calls };
}
const clock = () => { let t = 1_000_000; const sleeps: number[] = []; const c: Clock = { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } }; return { c, sleeps }; };
const memIo = () => { const files = new Map<string, Uint8Array>(); const io: Io = { mkdir: async () => {}, join: async (...p) => p.join('/'), writeFile: async (p, d) => { files.set(p, d); } }; return { io, files }; };
const noop = () => {};

describe('批量流程', () => {
  it('完整导出：翻页拉订单与库存，写出三个表加说明', async () => {
    const { f, calls } = fake();
    const { io, files } = memIo();
    const r = await runExport({ cred, fetcher: f, clock: clock().c, opts, now, io, outDir: '/out', progress: noop });
    expect(r.orders.length).toBe(orders1.orders.length + orders2.orders.length);
    expect(r.inventory.length).toBe(inv1.payload.inventorySummaries.length + inv2.payload.inventorySummaries.length);
    expect(calls.filter((c) => c.url.includes('/orders/2026-01-01/orders')).length).toBe(2);
    expect(calls.filter((c) => c.url.includes('/summaries')).length).toBe(2);
    const [path, bytes] = [...files.entries()][0];
    expect(path).toBe('/out/亚马逊-US-订单库存-20261001至20261023-1530.xlsx');
    const sheets = await inspectXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['订单', '订单明细', 'FBA库存', '说明']);
    expect(sheets[0].rows).toBe(r.orders.length);
    expect(sheets[0].header).toContain('订单号');
    expect(sheets[1].rows).toBe(r.totals.items);
    expect(sheets[2].rows).toBe(r.inventory.length);
  });

  it('请求头：访问令牌放在 x-amz-access-token，无 SigV4；令牌只换一次', async () => {
    const { f, calls } = fake();
    await runExport({ cred, fetcher: f, clock: clock().c, opts, now, io: memIo().io, outDir: '/o', progress: noop });
    const api = calls.filter((c) => !c.url.startsWith('https://api.amazon.com'));
    expect(api.every((c) => c.headers['x-amz-access-token'] === token.access_token && !('Authorization' in c.headers))).toBe(true);
    expect(calls.filter((c) => c.url.startsWith('https://api.amazon.com')).length).toBe(1);
    expect(calls[0].body).toContain('grant_type=refresh_token');
  });

  it('只导出库存时不请求订单，也不要求日期', async () => {
    const { f, calls } = fake();
    const r = await runExport({ cred, fetcher: f, clock: clock().c, opts: { ...opts, from: '', to: '', wantOrders: false, wantItems: false }, now, io: memIo().io, outDir: '/o', progress: noop });
    expect(calls.some((c) => c.url.includes('/orders/'))).toBe(false);
    expect(r.sheets).toEqual(['FBA库存']);
  });

  it('日本站走远东端点', async () => {
    const { f, calls } = fake();
    await runExport({ cred, fetcher: f, clock: clock().c, opts: { ...opts, marketplaceId: 'A1VC38T7YXB528', wantInventory: false }, now, io: memIo().io, outDir: '/o', progress: noop });
    expect(calls[1].url.startsWith('https://sellingpartnerapi-fe.amazon.com/')).toBe(true);
  });

  it('429 限流后等待重试并成功', async () => {
    let hit = false;
    const { f } = fake((c) => (!hit && c.url.includes('/summaries') && (hit = true) ? res(429, e429) : undefined));
    const { c, sleeps } = clock();
    const r = await runExport({ cred, fetcher: f, clock: c, opts: { ...opts, wantOrders: false, wantItems: false }, now, io: memIo().io, outDir: '/o', progress: noop });
    expect(r.inventory.length).toBeGreaterThan(0);
    expect(sleeps.some((ms) => ms >= 2000)).toBe(true);
  });

  it('一直 429 时重试有限次后报中文错误', async () => {
    const { f, calls } = fake((c) => (c.url.includes('/orders/') ? res(429, e429) : undefined));
    await expect(runExport({ cred, fetcher: f, clock: clock().c, opts, now, io: memIo().io, outDir: '/o', progress: noop })).rejects.toThrow('限流');
    expect(calls.filter((c) => c.url.includes('/orders/')).length).toBe(6);
  });

  it('403：提示没有权限，错误信息里没有凭据', async () => {
    const { f } = fake((c) => (c.url.includes('/orders/') ? res(403, e403) : undefined));
    const e = await runExport({ cred, fetcher: f, clock: clock().c, opts, now, io: memIo().io, outDir: '/o', progress: noop }).catch((x: Error) => x);
    expect((e as Error).message).toContain('没有权限');
    for (const v of Object.values(cred)) expect((e as Error).message).not.toContain(v);
  });

  it('Refresh Token 失效', async () => {
    const { f } = fake((c) => (c.url.startsWith('https://api.amazon.com') ? res(400, grant) : undefined));
    await expect(runExport({ cred, fetcher: f, clock: clock().c, opts, now, io: memIo().io, outDir: '/o', progress: noop })).rejects.toThrow('Refresh Token');
  });

  it('401 后重新换令牌再试', async () => {
    let first = true;
    const { f, calls } = fake((c) => (c.url.includes('/summaries') && first && !(first = false) ? res(401, { errors: [{ code: 'Unauthorized', message: 'x' }] }) : undefined));
    await runExport({ cred, fetcher: f, clock: clock().c, opts: { ...opts, wantOrders: false, wantItems: false }, now, io: memIo().io, outDir: '/o', progress: noop });
    expect(calls.filter((c) => c.url.startsWith('https://api.amazon.com')).length).toBe(2);
  });

  it('响应头里的限速额度会更新令牌桶', async () => {
    const { f } = fake((c) => (c.url.includes('/summaries') ? res(200, { payload: { inventorySummaries: [] } }, { 'x-amzn-RateLimit-Limit': '5' }) : undefined));
    const client = new SpApiClient(cred, f, clock().c);
    await client.inventory('ATVPDKIKX0DER', noop, noop);
    expect((client as unknown as { buckets: { inventory: { rate: number } } }).buckets.inventory.rate).toBe(5);
  });

  it('中途停止', async () => {
    const ac = new AbortController();
    const { f } = fake();
    const c: Clock = { now: () => 0, sleep: async () => { throw abortError(); } };
    ac.abort();
    await expect(runExport({ cred, fetcher: f, clock: c, opts, now, io: memIo().io, outDir: '/o', progress: noop, signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('参数检查', () => {
    expect(validateOpts({ clientId: '', clientSecret: '', refreshToken: '' }, opts, false)).toContain('Client ID');
    expect(validateOpts({ clientId: '', clientSecret: '', refreshToken: '' }, opts, true)).toBeNull();
    expect(validateOpts(cred, { ...opts, wantOrders: false, wantItems: false, wantInventory: false }, false)).toContain('至少');
  });
});
