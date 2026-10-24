// 主界面：左侧填授权与导出条件，右侧显示进度、汇总和订单预览。
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, FolderOpen, Loader2, Play, Square, ExternalLink, ShieldCheck } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, httpFetch, openLink, reveal } from '../kit/platform';
import {
  FULFILLED_BY, MARKETPLACES, STATUSES, isAbort, maskSecret, presetRange, itemRows, orderRow, inventoryRow,
  type Credentials,
} from './core';
import { runExport, validateOpts, type ExportOutcome } from './flow';
import type { Fetcher, Progress } from './api';
import { demoClock, demoFetcher } from './demo';
import { DEFAULT_PREFS, EMPTY_CRED, loadCred, loadPrefs, saveCred, savePrefs, type Prefs } from './store';
import { PREVIEW, isPreview } from './preview';
import './tool.css';

type Ctx = Parameters<CustomTool['Main']>[0]['ctx'];
const DOCS = 'https://developer-docs.amazon.com/sp-api/docs/registering-as-a-developer';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const realFetcher: Fetcher = (url, init) => httpFetch(url, init) as ReturnType<Fetcher>;

const STAGE: Record<string, string> = { token: '正在换取访问令牌', orders: '正在拉取订单', inventory: '正在拉取 FBA 库存' };
const CUR: Record<string, string> = { USD: '美元', CAD: '加元', MXN: '墨西哥比索', BRL: '巴西雷亚尔', GBP: '英镑', EUR: '欧元', SEK: '瑞典克朗', PLN: '兹罗提', TRY: '土耳其里拉', AED: '迪拉姆', SAR: '里亚尔', EGP: '埃及镑', INR: '卢比', ZAR: '兰特', JPY: '日元', AUD: '澳元', SGD: '新加坡元' };
const cur = (c: unknown) => CUR[String(c)] ?? String(c ?? '');
const money = (v: unknown, c: unknown) => (v === '' || v == null ? '' : `${Number(v).toFixed(2)} ${cur(c)}`);
const amounts = (a: Record<string, number>) => Object.entries(a).map(([c, v]) => `${v.toFixed(2)} ${cur(c)}`).join(' · ') || '—';

type SheetKey = 'orders' | 'items' | 'inventory';
type Col = [string, string, boolean?];
const SHEETS: Record<SheetKey, { name: string; cols: Col[] }> = {
  orders: { name: '订单', cols: [['orderId', '订单号'], ['createdShort', '下单时间'], ['state', '状态 · 配送'], ['units', '件数', true], ['amount', '订单金额', true]] },
  items: { name: '订单明细', cols: [['orderId', '订单号'], ['title', '商品标题'], ['qty', '数量', true], ['unitPrice', '单价', true], ['itemTotal', '小计（到手）', true]] },
  inventory: { name: 'FBA库存', cols: [['name', '商品名称'], ['fulfillable', '可售', true], ['reserved', '预留', true], ['inboundShipped', '入库-在途', true], ['unfulfillable', '不可售', true], ['total', '总数', true]] },
};
const STEPS: [string, string][] = [['token', '换取令牌'], ['orders', '拉取订单'], ['inventory', '拉取库存'], ['write', '写入 Excel']];


export function Main({ ctx }: { ctx?: Ctx }) {
  const preview = isPreview();
  const [cred, setCred] = useState<Credentials>(EMPTY_CRED);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [range, setRange] = useState(() => presetRange(30, new Date()));
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<Parameters<Progress>[0] | null>(null);
  const [out, setOut] = useState<ExportOutcome | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    void Promise.all([loadCred(), loadPrefs()]).then(([c, p]) => { setCred(c); setPrefs(p); loaded.current = true; });
  }, []);
  const setP = (patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; void savePrefs(n); return n; });

  async function start(demoOverride?: boolean) {
    const demo = demoOverride ?? prefs.demo;
    const opts = { marketplaceId: prefs.marketplaceId, from: range.from, to: range.to, statuses: prefs.statuses, fulfilledBy: prefs.fulfilledBy, wantOrders: prefs.wantOrders, wantItems: prefs.wantItems, wantInventory: prefs.wantInventory };
    const bad = validateOpts(cred, opts, demo);
    if (bad) { setError(bad); return; }
    setError(''); setOut(null); setBusy(true); setProg(null);
    abort.current = new AbortController();
    try {
      if (!demo) await saveCred(cred);
      const outDir = preview ? '/店铺运营/下载/亚马逊订单库存导出' : await defaultOutputDir('亚马逊订单库存导出');
      const io = ctx ?? { mkdir: async () => {}, writeFile: async () => {}, join: async (...p: string[]) => p.join('/') };
      const r = await runExport({
        cred, opts, now: new Date(), outDir, io, demo,
        fetcher: demo ? demoFetcher : realFetcher, clock: demo ? demoClock : undefined,
        progress: setProg, signal: abort.current.signal,
      });
      setOut(r);
    } catch (e) {
      setError(isAbort(e) ? '已停止' : errText(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (preview && PREVIEW.autoRun) { setP({ demo: true }); void start(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleStatus = (k: string) => setP({ statuses: prefs.statuses.includes(k) ? prefs.statuses.filter((s) => s !== k) : [...prefs.statuses, k] });
  const credInput = (key: keyof Credentials, label: string, secret: boolean) => (
    <div className="k-field">
      <label className="k-label" htmlFor={`ao-${key}`}>{label}</label>
      <input id={`ao-${key}`} className="k-input" type={secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} disabled={busy || prefs.demo}
        value={prefs.demo ? '' : cred[key]} placeholder={prefs.demo ? '演示模式不需要' : secret && cred[key] ? maskSecret(cred[key]) : ''} onChange={(e) => setCred({ ...cred, [key]: e.target.value })} />
    </div>
  );
  const sheetsWanted = (['orders', 'items', 'inventory'] as SheetKey[]).filter((k) => (k === 'orders' ? prefs.wantOrders : k === 'items' ? prefs.wantItems : prefs.wantInventory));
  const tables = useMemo(() => {
    if (!out) return null;
    const rows: Record<SheetKey, Record<string, string | number>[]> = {
      orders: out.orders.map((o) => { const r = orderRow(o); return { ...r, createdShort: String(r.created).slice(5), state: `${r.status} · ${r.fulfilledBy}`, amount: money(r.total, r.currency) }; }),
      items: out.orders.flatMap(itemRows).map((r) => ({ ...r, unitPrice: money(r.unitPrice, r.currency), itemTotal: money(r.itemTotal, r.currency) })),
      inventory: out.inventory.map(inventoryRow),
    };
    return rows;
  }, [out]);
  const outKeys = out ? sheetsWanted : [];
  const [tab, setTab] = useState<SheetKey>('orders');
  const shown: SheetKey = outKeys.includes(tab) ? tab : (outKeys[0] ?? sheetsWanted[0] ?? 'orders');
  const pct = prog ? `${STAGE[prog.stage]}：第 ${prog.page || 1} 页，已取 ${prog.count} 条${prog.waitMs ? `（${prog.note}，等待 ${Math.ceil(prog.waitMs / 1000)} 秒）` : ''}` : '';
  const stageIdx = prog ? STEPS.findIndex(([k]) => k === prog.stage) : 0;
  const fileName = out ? out.path.split('/').pop() ?? out.path : '';
  const sheet = SHEETS[shown];
  const rowsOfSheet = tables && out ? tables[shown].slice(0, 12) : [];
  const stat = (n: string | number, label: string, hint?: string) => <div className="ao-stat"><b className="ao-big k-num">{n}</b><span>{label}</span>{hint && <small className="k-muted">{hint}</small>}</div>;

  return (
    <div className="ao-root">
      <aside className="ao-form">
        <h3 className="ao-h"><span>1</span>授权</h3>
        <label className="k-toggle ao-demo"><input type="checkbox" checked={prefs.demo} disabled={busy} onChange={(e) => setP({ demo: e.target.checked })} /><span>演示模式（不联网，用虚构数据体验）</span></label>
        {credInput('clientId', 'LWA Client ID（客户端编号）', false)}
        {credInput('clientSecret', 'LWA Client Secret（客户端密钥）', true)}
        {credInput('refreshToken', 'Refresh Token（刷新令牌）', true)}
        <p className="k-muted ao-note"><ShieldCheck size={14} /> 凭据只保存在本机，只会发给亚马逊官方地址。<button className="k-link" onClick={() => void openLink(DOCS)}>怎么申请<ExternalLink size={12} /></button></p>

        <h3 className="ao-h"><span>2</span>导出条件</h3>
        <div className="k-field">
          <label className="k-label" htmlFor="ao-mp">站点</label>
          <select id="ao-mp" className="k-input" value={prefs.marketplaceId} disabled={busy} onChange={(e) => setP({ marketplaceId: e.target.value })}>
            {MARKETPLACES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="k-field">
          <span className="k-label">下单日期</span>
          <div className="ao-dates">
            <input className="k-input" type="date" aria-label="开始日期" value={range.from} disabled={busy} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <span className="k-muted">至</span>
            <input className="k-input" type="date" aria-label="结束日期" value={range.to} disabled={busy} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <div className="k-presets">
            {[7, 30, 90].map((d) => <button key={d} className="k-btn ghost" disabled={busy} onClick={() => setRange(presetRange(d, new Date()))}>近 {d} 天</button>)}
          </div>
        </div>
        <div className="k-field">
          <span className="k-label">订单状态（不选 = 全部）</span>
          <div className="ao-chips">
            {STATUSES.map(([k, n]) => <label key={k} className="k-toggle"><input type="checkbox" checked={prefs.statuses.includes(k)} disabled={busy} onChange={() => toggleStatus(k)} /><span>{n}</span></label>)}
          </div>
        </div>
        <div className="k-field">
          <label className="k-label" htmlFor="ao-fb">配送方式</label>
          <select id="ao-fb" className="k-input" value={prefs.fulfilledBy} disabled={busy} onChange={(e) => setP({ fulfilledBy: e.target.value })}>
            {FULFILLED_BY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div className="k-field">
          <span className="k-label">写进 Excel 的工作表</span>
          <div className="ao-chips">
            <label className="k-toggle"><input type="checkbox" checked={prefs.wantOrders} disabled={busy} onChange={(e) => setP({ wantOrders: e.target.checked })} /><span>订单</span></label>
            <label className="k-toggle"><input type="checkbox" checked={prefs.wantItems} disabled={busy} onChange={(e) => setP({ wantItems: e.target.checked })} /><span>订单明细</span></label>
            <label className="k-toggle"><input type="checkbox" checked={prefs.wantInventory} disabled={busy} onChange={(e) => setP({ wantInventory: e.target.checked })} /><span>FBA 库存</span></label>
          </div>
        </div>
      </aside>

      <main className="ao-book" aria-live="polite">
        <header className="ao-bar">
          <FileSpreadsheet size={18} />
          <span className="ao-fname k-ellipsis" title={out?.path}>{out ? fileName : '导出结果.xlsx（尚未生成）'}</span>
          {prefs.demo && <span className="ao-badge">演示数据</span>}
          <span className="b-sp" />
          {out && !preview && <button className="k-btn" onClick={() => void reveal(out.path)}><FolderOpen size={14} />在文件夹中显示</button>}
          {busy
            ? <button className="k-btn" onClick={() => abort.current?.abort()}><Square size={14} />停止</button>
            : <button className="k-btn primary" onClick={() => void start()}><Play size={14} />开始导出</button>}
        </header>
        {error && <div className="k-notice err" role="alert">{error}</div>}

        {busy && (
          <div className="ao-run">
            <ol className="ao-steps">
              {STEPS.map(([k, l], i) => (
                <li key={k} className={i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''}>
                  <b>{i < stageIdx ? <Check size={14} /> : i === stageIdx ? <Loader2 size={14} className="k-spin" /> : i + 1}</b>{l}
                </li>
              ))}
            </ol>
            <p className="ao-prog">{pct || '准备中…'}</p>
          </div>
        )}

        {out && (
          <div className="ao-stats">
            {stat(out.totals.orders, '订单')}
            {stat(out.totals.units, '件商品')}
            {stat(amounts(out.totals.amount), '订单金额', '不含已取消订单')}
            {stat(out.totals.skus, '库存 SKU', `可售合计 ${out.totals.fulfillable} 件`)}
          </div>
        )}

        <div className="ao-sheet">
          <div className="ao-tabs" role="tablist" aria-label="工作表">
            {(sheetsWanted.length ? sheetsWanted : ['orders' as SheetKey]).map((k) => (
              <button key={k} role="tab" aria-selected={shown === k} className={`ao-tab${shown === k ? ' on' : ''}`} onClick={() => setTab(k)}>
                {SHEETS[k].name}{tables && <span className="k-num">{tables[k].length}</span>}
              </button>
            ))}
            {out && <span className="ao-tab ghost">说明</span>}
          </div>
          <div className="ao-grid k-scroll">
            <table>
              <thead><tr><th className="ao-rn" />{sheet.cols.map(([k, l, r]) => <th key={k} className={r ? 'r' : ''}>{l}</th>)}</tr></thead>
              <tbody>
                {out ? rowsOfSheet.map((r, i) => (
                  <tr key={i}><td className="ao-rn">{i + 2}</td>{sheet.cols.map(([k, , rr]) => <td key={k} className={rr ? 'r k-num' : k === 'orderId' ? 'k-num' : ''}>{String(r[k] ?? '')}</td>)}</tr>
                )) : Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="ao-ghost"><td className="ao-rn">{i + 2}</td>{sheet.cols.map(([k]) => <td key={k}><i style={{ width: `${40 + ((i * 17 + k.length * 11) % 45)}%` }} /></td>)}</tr>
                ))}
              </tbody>
            </table>
            {!out && !busy && !error && (
              <div className="ao-hint">
                <div className="ao-flow"><span>亚马逊卖家账号</span><ArrowRight size={16} /><span>官方接口</span><ArrowRight size={16} /><span>本机 Excel</span></div>
                <b>填好授权和条件，点「开始导出」</b>
                <span className="k-muted">订单、订单明细和 FBA 库存会按左边勾选的工作表写进同一个 Excel。没有店铺也可以先打开「演示模式」看完整流程。</span>
              </div>
            )}
          </div>
          {out && tables && tables[shown].length > rowsOfSheet.length && <div className="ao-more k-muted">表里共 {tables[shown].length} 行，这里只预览前 {rowsOfSheet.length} 行，完整内容在导出的文件里。</div>}
        </div>
        {out && <p className="k-muted ao-note">已写入工作表：{out.sheets.join('、')}、说明{prefs.demo ? '。当前是演示数据，不是真实店铺。' : ''}</p>}
      </main>
    </div>
  );
}
