import { describe, expect, it } from 'vitest';
import {
  TokenBucket, backoffMs, endpointFor, explainError, exportFileName, fmtTime, inventoryQuery, inventoryRow, itemRows, maskSecret, mergeInventory, mergeOrders, orderRow,
  presetRange, searchOrdersQuery, toApiRange, tokenRequestBody, totals, amountText, credReady, type ApiOrder, type ApiInventorySummary,
} from './core';
import orders1 from './fixtures/orders-page1.json';
import orders2 from './fixtures/orders-page2.json';
import inv1 from './fixtures/inventory-page1.json';
import error403 from './fixtures/error-403.json';
import grant from './fixtures/lwa-invalid-grant.json';

const all = [...orders1.orders, ...orders2.orders] as unknown as ApiOrder[];

describe('请求参数', () => {
  it('searchOrders 查询串含站点、状态、不含买家数据', () => {
    const q = new URLSearchParams(searchOrdersQuery({ marketplaceId: 'ATVPDKIKX0DER', createdAfter: '2026-10-01T00:00:00Z', createdBefore: '2026-10-02T00:00:00Z', statuses: ['UNSHIPPED', 'SHIPPED'], fulfilledBy: 'AMAZON', paginationToken: 'T1' }));
    expect(q.get('marketplaceIds')).toBe('ATVPDKIKX0DER');
    expect(q.get('fulfillmentStatuses')).toBe('UNSHIPPED,SHIPPED');
    expect(q.get('fulfilledBy')).toBe('AMAZON');
    expect(q.get('includedData')).toBe('PROCEEDS,FULFILLMENT');
    expect(q.get('paginationToken')).toBe('T1');
    expect(q.get('maxResultsPerPage')).toBe('100');
  });
  it('库存查询串', () => {
    const q = new URLSearchParams(inventoryQuery('A1VC38T7YXB528', 'N'));
    expect(q.get('granularityType')).toBe('Marketplace');
    expect(q.get('granularityId')).toBe('A1VC38T7YXB528');
    expect(q.get('details')).toBe('true');
    expect(q.get('nextToken')).toBe('N');
  });
  it('站点对应区域端点', () => {
    expect(endpointFor('ATVPDKIKX0DER')).toContain('-na.');
    expect(endpointFor('A1PA6795UKMFR9')).toContain('-eu.');
    expect(endpointFor('A1VC38T7YXB528')).toContain('-fe.');
  });
  it('令牌请求体', () => {
    const b = new URLSearchParams(tokenRequestBody({ clientId: ' id ', clientSecret: 's', refreshToken: 'r' }));
    expect(b.get('grant_type')).toBe('refresh_token');
    expect(b.get('client_id')).toBe('id');
  });
  it('凭据脱敏与完整性', () => {
    expect(maskSecret('Atzr|abcdefghijklmnop')).not.toContain('efghijklmno');
    expect(maskSecret('')).toBe('');
    expect(credReady({ clientId: 'a', clientSecret: '', refreshToken: 'c' })).toBe(false);
  });
});

describe('日期区间', () => {
  const now = new Date(2026, 9, 23, 15, 30);
  it('近 7 天含今天', () => expect(presetRange(7, now)).toEqual({ from: '2026-10-17', to: '2026-10-23' }));
  it('结束时间最多取现在前 3 分钟', () => {
    const r = toApiRange('2026-10-17', '2026-10-23', now);
    expect(new Date(r.createdBefore).getTime()).toBe(Math.floor((now.getTime() - 180_000) / 1000) * 1000);
    expect(new Date(r.createdAfter).getTime()).toBe(new Date(2026, 9, 17).getTime());
  });
  it('过去的日期取当天结束', () => {
    const r = toApiRange('2026-10-01', '2026-10-01', now);
    expect(new Date(r.createdBefore).getTime()).toBe(new Date(2026, 9, 2).getTime() - 1000);
  });
  it('拒绝开始晚于结束、未来日期、空值', () => {
    expect(() => toApiRange('2026-10-05', '2026-10-01', now)).toThrow('不能晚于结束');
    expect(() => toApiRange('2026-10-24', '2026-10-25', now)).toThrow('不能晚于今天');
    expect(() => toApiRange('', '', now)).toThrow('请选择');
  });
  it('文件名', () => expect(exportFileName('US', '2026-10-01', '2026-10-23', now)).toBe('亚马逊-US-订单库存-20261001至20261023-1530.xlsx'));
});

describe('解析订单与库存', () => {
  it('订单行', () => {
    const r = orderRow(all[0]);
    expect(r.orderId).toBe(all[0].orderId);
    expect(r.total).toBe(Number(all[0].proceeds!.grandTotal!.amount));
    expect(r.currency).toBe('USD');
    expect(r.units).toBe(all[0].orderItems!.reduce((a, i) => a + i.quantityOrdered, 0));
  });
  it('明细行：每个商品一行，带标题和单价', () => {
    const rows = all.flatMap(itemRows);
    expect(rows.length).toBe(all.reduce((a, o) => a + (o.orderItems?.length ?? 0), 0));
    expect(rows[0].title).toContain('示例');
    expect(typeof rows[0].unitPrice).toBe('number');
  });
  it('缺字段时给空串而不是报错', () => {
    const r = orderRow({ orderId: 'X', createdTime: '', lastUpdatedTime: '' });
    expect(r.total).toBe('');
    expect(r.units).toBe(0);
    expect(itemRows({ orderId: 'X', createdTime: '', lastUpdatedTime: '' })).toEqual([]);
  });
  it('库存行', () => {
    const s = inv1.payload.inventorySummaries[0] as unknown as ApiInventorySummary;
    const r = inventoryRow(s);
    expect(r.sku).toBe('DEMO-BOTTLE-500');
    expect(r.fulfillable).toBe(s.inventoryDetails!.fulfillableQuantity);
    expect(inventoryRow({}).total).toBe('');
  });
  it('合并去重：订单号重复保留后出现的，按下单时间倒序', () => {
    const a = { orderId: 'A', createdTime: '2026-10-01T00:00:00Z', lastUpdatedTime: '1' } as ApiOrder;
    const a2 = { ...a, lastUpdatedTime: '2' };
    const b = { orderId: 'B', createdTime: '2026-10-02T00:00:00Z', lastUpdatedTime: '1' } as ApiOrder;
    const m = mergeOrders([[a, b], [a2]]);
    expect(m.map((o) => o.orderId)).toEqual(['B', 'A']);
    expect(m[1].lastUpdatedTime).toBe('2');
    expect(mergeInventory([[{ sellerSku: 'S', fnSku: 'F', condition: 'NewItem', totalQuantity: 1 }], [{ sellerSku: 'S', fnSku: 'F', condition: 'NewItem', totalQuantity: 5 }]])).toHaveLength(1);
  });
  it('汇总金额不含已取消订单', () => {
    const t = totals(all, []);
    const expected = all.filter((o) => o.fulfillment?.fulfillmentStatus !== 'CANCELLED').reduce((a, o) => a + Number(o.proceeds?.grandTotal?.amount ?? 0), 0);
    expect(t.amount.USD).toBeCloseTo(expected, 2);
    expect(t.orders).toBe(all.length);
    expect(amountText({})).toBe('—');
  });
  it('时间格式', () => { expect(fmtTime('')).toBe(''); expect(fmtTime('bad')).toBe('bad'); expect(fmtTime('2026-10-22T21:12:00Z')).toMatch(/^2026-10-2[23] \d\d:\d\d$/); });
});

describe('限速与错误提示', () => {
  it('令牌桶：突发用完后需要等待', () => {
    const b = new TokenBucket(2, 2, 0);
    expect(b.take(0)).toBe(0);
    expect(b.take(0)).toBe(0);
    expect(b.take(0)).toBe(500);
    expect(b.take(10_000)).toBe(0);
  });
  it('退避时间翻倍且封顶', () => {
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(2)).toBe(8000);
    expect(backoffMs(10)).toBe(60000);
    expect(backoffMs(0, 5000)).toBe(5000);
  });
  it('错误翻译：不含凭据，能区分授权与权限', () => {
    expect(explainError(400, JSON.stringify(grant))).toContain('Refresh Token');
    expect(explainError(403, JSON.stringify(error403))).toContain('没有权限');
    expect(explainError(429, '')).toContain('限流');
    expect(explainError(503, 'x')).toContain('503');
  });
});
