// 导出 Excel：基于 exceljs（MIT）。订单、订单明细、FBA 库存各一个工作表，加粗表头、冻结首行。
import ExcelJS from 'exceljs';
import { INVENTORY_COLS, ITEM_COLS, ORDER_COLS, type Row } from './core';

export interface ExportData { orders?: Row[]; items?: Row[]; inventory?: Row[]; info: [string, string][] }

function sheet(wb: ExcelJS.Workbook, name: string, cols: [string, string, number][], rows: Row[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(([key, header, width]) => ({ key, header, width }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

export async function writeExport(d: ExportData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '篝火 · 亚马逊订单库存导出';
  if (d.orders) sheet(wb, '订单', ORDER_COLS, d.orders);
  if (d.items) sheet(wb, '订单明细', ITEM_COLS, d.items);
  if (d.inventory) sheet(wb, 'FBA库存', INVENTORY_COLS, d.inventory);
  const info = wb.addWorksheet('说明');
  info.columns = [{ header: '项目', key: 'k', width: 14 }, { header: '内容', key: 'v', width: 60 }];
  info.getRow(1).font = { bold: true };
  for (const [k, v] of d.info) info.addRow({ k, v });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 测试与验收用：读回工作表名和每个表的表头、行数 */
export async function inspectXlsx(bytes: Uint8Array): Promise<{ name: string; header: string[]; rows: number }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb.worksheets.map((ws) => ({ name: ws.name, header: (ws.getRow(1).values as unknown[]).slice(1).map(String), rows: ws.rowCount - 1 }));
}
