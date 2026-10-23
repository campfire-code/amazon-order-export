// 凭据与偏好保存在本机应用数据目录的 settings.json（kit 的 settingsStore），键名 cred.e14 / prefs.e14。不上传、不写日志。
import { settingsStore } from '../kit/platform';
import type { Credentials } from './core';

const CRED_KEY = 'cred.e14';
const PREFS_KEY = 'prefs.e14';

export const EMPTY_CRED: Credentials = { clientId: '', clientSecret: '', refreshToken: '' };

export interface Prefs { marketplaceId: string; statuses: string[]; fulfilledBy: string; wantOrders: boolean; wantItems: boolean; wantInventory: boolean; demo: boolean }
export const DEFAULT_PREFS: Prefs = { marketplaceId: 'ATVPDKIKX0DER', statuses: [], fulfilledBy: '', wantOrders: true, wantItems: true, wantInventory: true, demo: true };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function loadCred(): Promise<Credentials> {
  try {
    const v = (await (await settingsStore()).get<Partial<Credentials>>(CRED_KEY)) ?? {};
    return { clientId: str(v.clientId), clientSecret: str(v.clientSecret), refreshToken: str(v.refreshToken) };
  } catch {
    return EMPTY_CRED;
  }
}

export async function saveCred(c: Credentials): Promise<boolean> {
  try {
    const st = await settingsStore();
    await st.set(CRED_KEY, c);
    await st.save();
    return true;
  } catch {
    return false;
  }
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const v = (await (await settingsStore()).get<Partial<Prefs>>(PREFS_KEY)) ?? {};
    return { ...DEFAULT_PREFS, ...v, statuses: Array.isArray(v.statuses) ? v.statuses.filter((s) => typeof s === 'string') : [] };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(p: Prefs) {
  try { await (await settingsStore()).set(PREFS_KEY, p); } catch { /* 忽略 */ }
}
