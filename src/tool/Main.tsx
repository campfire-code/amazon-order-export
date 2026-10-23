// 主界面：左侧填授权与导出条件，右侧显示进度、汇总和订单预览。
import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Play, Square, ExternalLink, ShieldCheck } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, httpFetch, openLink, reveal } from '../kit/platform';
import {
  FULFILLED_BY, MARKETPLACES, STATUSES, amountText, fulfilledByName, isAbort, maskSecret, presetRange, statusName, itemRows, orderRow,
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
      const outDir = preview ? '/示例/下载/亚马逊订单库存导出' : await defaultOutputDir('亚马逊订单库存导出');
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
  const sample = out?.orders.slice(0, 8) ?? [];
  const pct = prog ? `${STAGE[prog.stage]}：第 ${prog.page || 1} 页，已取 ${prog.count} 条${prog.waitMs ? `（${prog.note}，等待 ${Math.ceil(prog.waitMs / 1000)} 秒）` : ''}` : '';

  return (
    <div className="ao-root">
      <section className="k-panel ao-side">
        <h3 className="k-section">1. 授权</h3>
        <label className="k-toggle"><input type="checkbox" checked={prefs.demo} disabled={busy} onChange={(e) => setP({ demo: e.target.checked })} /><span>演示模式（不联网，用虚构数据体验）</span></label>
        {credInput('clientId', 'LWA Client ID', false)}
        {credInput('clientSecret', 'LWA Client Secret', true)}
        {credInput('refreshToken', 'Refresh Token', true)}
        <p className="k-muted ao-note"><ShieldCheck size={13} /> 凭据只保存在本机，只会发给亚马逊官方地址。<button className="k-link" onClick={() => void openLink(DOCS)}>怎么申请<ExternalLink size={12} /></button></p>

        <h3 className="k-section">2. 导出条件</h3>
        <div className="k-field">
          <label className="k-label" htmlFor="ao-mp">站点</label>
          <select id="ao-mp" className="k-input" value={prefs.marketplaceId} disabled={busy} onChange={(e) => setP({ marketplaceId: e.target.value })}>
            {MARKETPLACES.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.code}）</option>)}
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
          <span className="k-label">导出内容</span>
          <div className="ao-chips">
            <label className="k-toggle"><input type="checkbox" checked={prefs.wantOrders} disabled={busy} onChange={(e) => setP({ wantOrders: e.target.checked })} /><span>订单</span></label>
            <label className="k-toggle"><input type="checkbox" checked={prefs.wantItems} disabled={busy} onChange={(e) => setP({ wantItems: e.target.checked })} /><span>订单明细</span></label>
            <label className="k-toggle"><input type="checkbox" checked={prefs.wantInventory} disabled={busy} onChange={(e) => setP({ wantInventory: e.target.checked })} /><span>FBA 库存</span></label>
          </div>
        </div>
        <div className="ao-actions">
          {busy
            ? <button className="k-btn" onClick={() => abort.current?.abort()}><Square size={14} />停止</button>
            : <button className="k-btn primary" onClick={() => void start()}><Play size={14} />开始导出</button>}
        </div>
      </section>

      <section className="k-panel ao-main">
        {error && <div className="k-notice err" role="alert">{error}</div>}
        {busy && <div className="ao-busy"><span className="k-spin" /> {pct || '准备中…'}</div>}
        {!busy && !out && !error && <div className="k-empty"><p>填好授权和条件后点「开始导出」。</p><p className="k-muted">没有店铺也可以先打开「演示模式」看完整流程。</p></div>}
        {out && (
          <>
            <div className="ao-sum">
              <div><b className="k-num">{out.totals.orders}</b><span className="k-muted">订单</span></div>
              <div><b className="k-num">{out.totals.units}</b><span className="k-muted">件</span></div>
              <div><b className="k-num">{amountText(out.totals.amount)}</b><span className="k-muted">订单金额（不含已取消）</span></div>
              <div><b className="k-num">{out.totals.skus}</b><span className="k-muted">库存 SKU</span></div>
            </div>
            <div className="ao-file">
              <Download size={15} /> <span className="k-ellipsis" title={out.path}>{out.path}</span>
              {!preview && <button className="k-link" onClick={() => void reveal(out.path)}><FolderOpen size={14} />在文件夹中显示</button>}
            </div>
            <p className="k-muted ao-note">已写入工作表：{out.sheets.join('、')}、说明{prefs.demo ? '。当前是演示数据，不是真实店铺。' : ''}</p>
            {sample.length > 0 && (
              <div className="k-table-wrap k-scroll ao-table">
                <table className="k-table">
                  <thead><tr><th>订单号</th><th>状态</th><th>件数</th><th>金额</th><th>商品</th></tr></thead>
                  <tbody>{sample.map((o) => {
                    const r = orderRow(o);
                    return <tr key={o.orderId}><td className="k-num">{r.orderId}</td><td>{statusName(o.fulfillment?.fulfillmentStatus)} · {fulfilledByName(o.fulfillment?.fulfilledBy)}</td><td className="k-num">{r.units}</td><td className="k-num">{r.total} {r.currency}</td><td><div className="ao-prod">{itemRows(o).map((i) => i.title).join(' / ')}</div></td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
