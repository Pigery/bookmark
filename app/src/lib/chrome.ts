/** 浏览器接口的边界层：chrome.storage / chrome.bookmarks / chrome.tabs。
 *  预览模式（直接双击 newtab.html 或跑 vite dev）没有 chrome，这层负责降级，
 *  剩下的代码一律不用再问「我到底在扩展里还是网页里」。 */

export const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
export const HAS_BOOKMARKS = HAS_CHROME && !!(chrome.bookmarks && chrome.bookmarks.getTree);

/* 扩展里走 chrome.storage.local；预览时退到 localStorage，前缀 bd: 免得和别的本地页面打架 */
export async function storeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    if (HAS_CHROME) {
      const o = await chrome.storage.local.get(key);
      return o && Object.prototype.hasOwnProperty.call(o, key) ? (o[key] as T) : fallback;
    }
    const raw = localStorage.getItem('bd:' + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function storeSet(key: string, val: unknown): Promise<void> {
  try {
    if (HAS_CHROME) {
      await chrome.storage.local.set({ [key]: val });
      return;
    }
    localStorage.setItem('bd:' + key, JSON.stringify(val));
  } catch {
    /* 存不进去就算了：界面上已经改过，下次有动静再存 */
  }
}

/** 书签栏根节点：Chrome 的标题是「书签栏 / Bookmarks bar」，兼容一下 */
export function pickBar(roots: { title?: string; children?: unknown[] }[] | undefined): any {
  const list = roots || [];
  return list.find((c: any) => /书签栏|Bookmarks bar|Barre/i.test(String(c.title || ''))) || list[0];
}

/** Chrome 的 _favicon 接口：有就用真 favicon，没有就退字母印章 */
export function faviconOf(url?: string): string {
  if (!HAS_CHROME || !chrome.runtime || !chrome.runtime.getURL) return '';
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', String(url || ''));
    u.searchParams.set('size', '32');
    return u.toString();
  } catch {
    return '';
  }
}

/** 打开网址：新标签 or 当前标签（预览模式下退到 window.open / location） */
export function openUrl(url?: string, newTab = false): void {
  if (!url) return;
  if (newTab) {
    if (HAS_CHROME && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
    else window.open(url, '_blank');
    return;
  }
  if (HAS_CHROME && chrome.tabs && chrome.tabs.update) {
    chrome.tabs.update({ url });
  } else {
    window.location.href = url;
  }
}

/** 版本号水印用：扩展里读 manifest，预览退到兜底值 */
export function buildVersion(fallback: string): string {
  try {
    if (HAS_CHROME && chrome.runtime && chrome.runtime.getManifest) {
      return chrome.runtime.getManifest().version || fallback;
    }
  } catch {
    /* 预览模式没有 manifest */
  }
  return fallback;
}
