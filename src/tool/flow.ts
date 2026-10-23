// 导出流程：换令牌 → 翻页拉订单 / 库存 → 汇总 → 写出 Excel。网络与文件读写都由外部注入，便于测试。
import {
  amountText, endpointFor, exportFileName, fulfilledByName, inventoryRow, itemRows, marketplaceById, mergeInventory, mergeOrders, orderRow, statusName, toApiRange, totals,
  credReady, type ApiInventorySummary, type ApiOrder, type Clock, type Credentials, type Totals,
} from './core';
import { SpApiClient, type Fetcher, type Progress } from './api';
import { writeExport } from './xlsx';

export interface ExportOpts {
  marketplaceId: string;
  from: string;
  to: string;
  statuses: string[];
  fulfilledBy: string;
  wantOrders: boolean;
  wantItems: boolean;
  wantInventory: boolean;
}

export interface Io {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  join(...parts: string[]): Promise<string>;
}

export interface ExportOutcome { path: string; orders: ApiOrder[]; inventory: ApiInventorySummary[]; totals: Totals; sheets: string[] }

export function validateOpts(cred: Credentials, o: ExportOpts, demo: boolean): string | null {
  if (!demo && !credReady(cred)) return '请先填写 Client ID、Client Secret 和 Refresh Token（见「怎么申请」）';
  if (!marketplaceById(o.marketplaceId)) return '请选择站点';
  if (!o.wantOrders && !o.wantItems && !o.wantInventory) return '至少选一项要导出的内容';
  return null;
}

export async function runExport(a: {
  cred: Credentials; fetcher: Fetcher; clock?: Clock; opts: ExportOpts; now: Date; io: Io; outDir: string; progress: Progress; signal?: AbortSignal; demo?: boolean;
}): Promise<ExportOutcome> {
  const { opts: o } = a;
  const err = validateOpts(a.cred, o, !!a.demo);
  if (err) throw new Error(err);
  const needOrders = o.wantOrders || o.wantItems;
  const range = needOrders ? toApiRange(o.from, o.to, a.now) : null;
  const client = new SpApiClient(a.cred, a.fetcher, a.clock);
  a.progress({ stage: 'token', page: 0, count: 0 });
  await client.accessToken(a.signal);

  const orderPages: ApiOrder[][] = [];
  if (range) {
    await client.searchOrders({ marketplaceId: o.marketplaceId, ...range, statuses: o.statuses, fulfilledBy: o.fulfilledBy }, (p) => orderPages.push(p), a.progress, a.signal);
  }
  const invPages: ApiInventorySummary[][] = [];
  if (o.wantInventory) await client.inventory(o.marketplaceId, (p) => invPages.push(p), a.progress, a.signal);

  const orders = mergeOrders(orderPages);
  const inventory = mergeInventory(invPages);
  const t = totals(orders, inventory);
  const mp = marketplaceById(o.marketplaceId)!;
  const info: [string, string][] = [
    ['导出时间', a.now.toLocaleString('zh-CN')],
    ['站点', `${mp.name}（${mp.code}，${o.marketplaceId}）· ${endpointFor(o.marketplaceId)}`],
  ];
  if (needOrders) {
    info.push(['下单日期', `${o.from} 至 ${o.to}`]);
    info.push(['订单状态', o.statuses.length ? o.statuses.map(statusName).join('、') : '全部']);
    info.push(['配送方式', o.fulfilledBy ? fulfilledByName(o.fulfilledBy) : '全部']);
    info.push(['订单数 / 件数', `${t.orders} 单 / ${t.units} 件`]);
    info.push(['订单金额合计', amountText(t.amount) + '（不含已取消订单；取自接口 proceeds.grandTotal）']);
  }
  if (o.wantInventory) info.push(['FBA 库存', `${t.skus} 个 SKU，可售合计 ${t.fulfillable} 件`]);
  info.push(['数据来源', '亚马逊 SP-API（Orders 2026-01-01 searchOrders、FBA Inventory getInventorySummaries）']);
  info.push(['隐私', '未请求买家姓名、地址等个人信息']);
  if (a.demo) info.push(['注意', '演示数据，非真实店铺']);

  const bytes = await writeExport({
    orders: o.wantOrders ? orders.map(orderRow) : undefined,
    items: o.wantItems ? orders.flatMap(itemRows) : undefined,
    inventory: o.wantInventory ? inventory.map(inventoryRow) : undefined,
    info,
  });
  await a.io.mkdir(a.outDir);
  const path = await a.io.join(a.outDir, exportFileName(a.demo ? 'DEMO' : mp.code, o.from, o.to, a.now));
  await a.io.writeFile(path, bytes);
  const sheets = [o.wantOrders && '订单', o.wantItems && '订单明细', o.wantInventory && 'FBA库存'].filter(Boolean) as string[];
  return { path, orders, inventory, totals: t, sheets };
}

