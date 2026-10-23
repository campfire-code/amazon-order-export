// 演示模式：不联网，用 fixtures 里的模拟响应（结构按官方模型，数据为虚构示例）回答请求，让没有店铺的人也能走完整流程。
import type { Clock } from './core';
import type { Fetcher, FetchRes } from './api';
import token from './fixtures/lwa-token.json';
import orders1 from './fixtures/orders-page1.json';
import orders2 from './fixtures/orders-page2.json';
import inv1 from './fixtures/inventory-page1.json';
import inv2 from './fixtures/inventory-page2.json';

const res = (status: number, body: unknown): FetchRes => ({ status, text: async () => JSON.stringify(body), headers: { get: () => null } });

/** 按请求地址返回对应的模拟响应；订单按状态与配送方式过滤，模拟接口的筛选效果 */
export const demoFetcher: Fetcher = async (url) => {
  const u = new URL(url);
  if (u.host === 'api.amazon.com') return res(200, token);
  if (u.pathname === '/orders/2026-01-01/orders') {
    const page = u.searchParams.get('paginationToken') === 'DEMO-PAGE-2' ? orders2 : orders1;
    const st = u.searchParams.get('fulfillmentStatuses')?.split(',');
    const fb = u.searchParams.get('fulfilledBy');
    const list = page.orders.filter((o) => (!st || st.includes(o.fulfillment.fulfillmentStatus)) && (!fb || o.fulfillment.fulfilledBy === fb));
    return res(200, { ...page, orders: list });
  }
  if (u.pathname === '/fba/inventory/v1/summaries') return res(200, u.searchParams.get('nextToken') === 'DEMO-INV-2' ? inv2 : inv1);
  return res(404, { errors: [{ code: 'NotFound', message: 'demo' }] });
};

/** 演示用时钟：每次「等待」只停很短时间，让进度看得见但不拖沓 */
export const demoClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) => new Promise((ok, fail) => {
    const t = setTimeout(ok, Math.min(ms, 400));
    signal?.addEventListener('abort', () => { clearTimeout(t); fail(Object.assign(new Error('已停止'), { name: 'AbortError' })); }, { once: true });
  }),
};
