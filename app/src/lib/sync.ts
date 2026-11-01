/** 布局同步：导出 / 导入 / 分享文本（老 newtab.js 第 720~1092 行整段搬过来）。
 *
 *  只搬「怎么展示」：置顶图标顺序、图标 / 列表方式、壁纸、引擎、模糊档位。
 *  书签本身由浏览器自己同步，这里一根指头都不碰它。
 *
 *  关键点：chrome.bookmarks 的 id 是每台设备本地分配的，同一份书签在
 *  A 机和 B 机上 id 完全不同，直接搬 id 会全部错位。所以导出时先把 id
 *  翻译成跨设备稳定的键 —— 书签用规范化 URL，文件夹用「书签栏/工具/前端」
 *  这样的标题路径 —— 导入时再翻回本机的 id。文件里不出现任何 bookmark id。
 *
 *  移植说明：老版本直接改 DOM 的地方（$('syncPreview').innerHTML = …、
 *  $('syncInput').value）全部换成写 state.syncPreview / state.syncError，
 *  再 bump() 让 SyncPanel 重画；「上一次预览解析出来的计划」这种面板内部
 *  的临时数据不进全局 state，就放在本文件的模块级变量 pendingLayout 里。 */
import { fetchBingWallpaper } from './bing';
import { storeSet } from './chrome';
import {
  BD_MIME,
  ENGINES,
  LAYOUT_APP,
  LAYOUT_SCHEMA,
  SHARE_PREFIX_GZ,
  SHARE_PREFIX_RAW,
  WALL_BLURS,
  WALLPAPERS,
  isMode,
} from './constants';
import { bump, state, toast } from './store';
import type { BmNode, Mode } from './types';
import { applyWallpaper } from './wallpaper';

/** 布局文件里的偏好：只认这三个键，别的字段一律不管 */
export interface LayoutPrefs {
  wallpaper?: string;
  wallBlur?: string;
  engine?: string;
}

/** 导出的布局文件长这样。键全是跨设备稳定的，没有任何 bookmark id */
export interface Layout {
  app: string;
  schema: number;
  exportedAt: string;
  prefs: { wallpaper: string; wallBlur: string; engine: string };
  icons: string[];
  views: { items: Record<string, Mode>; folders: Record<string, Mode> };
}

/** 布局翻译回本机 id 之后的计划：还没写库，先给人看一眼 */
export interface LayoutPlan {
  icons: string[];
  items: Record<string, Mode>;
  folders: Record<string, Mode>;
  missIcons: number;
  missViews: number;
  prefs: LayoutPrefs;
}

/** 待确认的导入计划。老版本同名的模块级变量，不进 state */
let pendingLayout: LayoutPlan | null = null;

/* 规范化 URL：去 hash、去跟踪参数、参数排序、去尾斜杠 */
export function normUrl(u: string | undefined): string {
  try {
    const url = new URL(String(u));
    url.hash = '';
    url.searchParams.sort();
    [...url.searchParams.keys()].forEach((k) => {
      if (/^(utm_|spm|scm|from|share|ref|referrer|_t$)/i.test(k)) url.searchParams.delete(k);
    });
    // 尾斜杠要在 pathname 上去，不然带查询串的地址（/a/?id=7）会被漏掉
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    }
    return url.toString();
  } catch {
    return String(u || '').trim();
  }
}

/* 文件夹的标题路径：从书签栏往下数着拼 */
export function layoutFolderPaths(): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (node: BmNode, prefix: string): void => {
    (node.children || []).forEach((c) => {
      if (c.url) return;
      // 标题缺失时老版本存进去的是 undefined，下游一律只判真假，效果一样
      const path: string = prefix ? `${prefix}/${c.title}` : (c.title as string);
      map.set(c.id, path);
      walk(c, path);
    });
  };
  if (state.bar) walk(state.bar, '');
  return map;
}

/* 本机：规范化 URL → id（同一个 URL 只认第一个） */
export function layoutUrlIndex(): Map<string, string> {
  const map = new Map<string, string>();
  state.byId.forEach((node) => {
    if (!node.url) return;
    const k = normUrl(node.url);
    if (k && !map.has(k)) map.set(k, node.id);
  });
  return map;
}

/* 本机：标题路径 → id */
export function layoutFolderIndex(): Map<string, string> {
  const map = new Map<string, string>();
  layoutFolderPaths().forEach((path, id) => {
    if (path && !map.has(path)) map.set(path, id);
  });
  return map;
}

/* 导出：把本机 id 全部换成稳定键 */
export function buildLayout(): Layout {
  const paths = layoutFolderPaths();
  const icons: string[] = [];
  (state.icons || []).forEach((entry) => {
    const node = (entry && entry.id ? state.byId.get(entry.id) : null) || entry;
    const url = node && node.url;
    if (!url) return;
    const k = normUrl(url);
    if (k && !icons.includes(k)) icons.push(k);
  });

  const items: Record<string, Mode> = {};
  Object.keys(state.views.items).forEach((id) => {
    const node = state.byId.get(id);
    if (node && node.url) items[normUrl(node.url)] = state.views.items[id];
  });
  const folders: Record<string, Mode> = {};
  Object.keys(state.views.folders).forEach((id) => {
    const path = paths.get(id);
    if (path) folders[path] = state.views.folders[id];
  });

  return {
    app: LAYOUT_APP,
    schema: LAYOUT_SCHEMA,
    exportedAt: new Date().toISOString(),
    prefs: {
      wallpaper: state.wallpaper,
      wallBlur: state.wallBlur,
      engine: state.engine,
    },
    icons,
    views: { items, folders },
  };
}

/* 把布局翻译回本机 id；对不上的条目跳过，不让它变成错误设置 */
export function resolveLayout(data: any): LayoutPlan {
  const plan: LayoutPlan = { icons: [], items: {}, folders: {}, missIcons: 0, missViews: 0, prefs: {} };
  const urlIndex = layoutUrlIndex();
  const folderIndex = layoutFolderIndex();

  ((data && data.icons) || []).forEach((u: string) => {
    const id = urlIndex.get(normUrl(u));
    if (!id) { plan.missIcons += 1; return; }
    if (!plan.icons.includes(id)) plan.icons.push(id);
  });

  const views = (data && data.views) || {};
  const items = views.items || {};
  Object.keys(items).forEach((u) => {
    const id = urlIndex.get(normUrl(u));
    const v = items[u];
    if (!id || !isMode(v)) { plan.missViews += 1; return; }
    plan.items[id] = v;
  });
  const folders = views.folders || {};
  Object.keys(folders).forEach((p) => {
    const id = folderIndex.get(p);
    const v = folders[p];
    if (!id || !isMode(v)) { plan.missViews += 1; return; }
    plan.folders[id] = v;
  });

  const prefs = (data && data.prefs) || {};
  if (typeof prefs.engine === 'string' && ENGINES.some((e) => e.id === prefs.engine)) plan.prefs.engine = prefs.engine;
  if (typeof prefs.wallpaper === 'string' && (prefs.wallpaper === 'bing' || WALLPAPERS.some((w) => w.id === prefs.wallpaper))) {
    plan.prefs.wallpaper = prefs.wallpaper;
  }
  if (typeof prefs.wallBlur === 'string' && WALL_BLURS.some((b) => b.id === prefs.wallBlur)) {
    plan.prefs.wallBlur = prefs.wallBlur;
  }
  return plan;
}

export function countViews(plan: LayoutPlan): number {
  return Object.keys(plan.items).length + Object.keys(plan.folders).length;
}

/** 关面板 / 开新一份之前：把待确认的计划和预览一起清干净。
 *  只管清字段，不 bump —— 调用方本来就要重画 */
export function syncResetPending(): void {
  pendingLayout = null;
  state.syncPreview = undefined;
  state.syncError = undefined;
}

export function syncLines(plan: LayoutPlan): string[] {
  const lines: string[] = [];
  lines.push(`置顶图标 ${plan.icons.length} 个${plan.missIcons ? `（${plan.missIcons} 个本机没有）` : ''}`);
  lines.push(`显示方式 ${countViews(plan)} 项${plan.missViews ? `（${plan.missViews} 项对不上）` : ''}`);
  const bits: string[] = [];
  if (plan.prefs.wallpaper) bits.push(`壁纸 ${plan.prefs.wallpaper}`);
  if (plan.prefs.wallBlur) bits.push(`模糊 ${plan.prefs.wallBlur}`);
  if (plan.prefs.engine) bits.push(`搜索引擎 ${plan.prefs.engine}`);
  if (bits.length) lines.push(`偏好 ${bits.join(' · ')}`);
  return lines;
}

/** 老版本往 #syncPreview 里塞 div，这里只写文本，行由组件拆开画 */
export function renderSyncPreview(plan: LayoutPlan): void {
  state.syncError = undefined;
  state.syncPreview = syncLines(plan).join('\n');
}

export function renderSyncError(msg: string): void {
  state.syncPreview = undefined;
  state.syncError = msg;
}

/* 落盘：先写存储，再重画。写一半失败也不会把界面改乱 */
export async function applyResolvedLayout(plan: LayoutPlan): Promise<void> {
  state.icons = plan.icons.map((id) => ({ id }));
  state.views = { v: 1, folders: { ...plan.folders }, items: { ...plan.items } };
  await storeSet('icons', state.icons);
  await storeSet('views', state.views);

  if (plan.prefs.engine) {
    state.engine = plan.prefs.engine;
    await storeSet('engine', state.engine);
  }
  // 模糊档位要在套壁纸之前落定，否则会先按旧档位画一遍
  if (plan.prefs.wallBlur) {
    state.wallBlur = plan.prefs.wallBlur;
    await storeSet('wallBlur', state.wallBlur);
  }
  if (plan.prefs.wallpaper) {
    let wp = plan.prefs.wallpaper;
    if (wp === 'bing' && !state.wallpaperBing) {
      try {
        // 老版本 applyWallpaper 是同步的，必应那张要先联网取回来
        state.wallpaperBing = ((await fetchBingWallpaper()) as { url?: string }).url || '';
      } catch {
        wp = 'aurora';
      }
    }
    // 老版本这里是不 await 的：state.wallpaper 同步就设好了，取色慢不该拖着面板不收
    void applyWallpaper(wp);
    await storeSet('wallpaper', state.wallpaper);
  }
  // 老版本这里还有 draw() / paintTray() / paintEngine() / paintWallBlur()：
  // 移植后统一由 bump() 让组件重画
  bump();
  toast(`已导入：置顶 ${state.icons.length} · 显示方式 ${countViews(plan)}`);
}

/* ---------- 分享文本：gzip + base64url ----------
   bd1. 表示 gzip 过的，bd0. 表示没压的原文 */
export function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

export async function packLayout(layout: unknown): Promise<string> {
  const json = JSON.stringify(layout);
  if (typeof CompressionStream === 'undefined') return SHARE_PREFIX_RAW + bytesToB64url(new TextEncoder().encode(json));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const packed = SHARE_PREFIX_GZ + bytesToB64url(new Uint8Array(buf));
  // 只有几个置顶图标的小布局，gzip 头比省下来的还多，退回不压缩，不让它变大
  if (packed.length >= SHARE_PREFIX_RAW.length + bytesToB64url(new TextEncoder().encode(json)).length) {
    return SHARE_PREFIX_RAW + bytesToB64url(new TextEncoder().encode(json));
  }
  return packed;
}

export async function unpackLayout(text: string): Promise<any> {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('空文本');
  if (raw.startsWith(SHARE_PREFIX_GZ)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('这个浏览器不支持解压');
    const stream = new Blob([b64urlToBytes(raw.slice(4))]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  if (raw.startsWith(SHARE_PREFIX_RAW)) {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(raw.slice(4))));
  }
  return JSON.parse(raw);
}

/** 复制文本：先试 clipboard API，被拒时退回 textarea + execCommand（老版本同款） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function downloadLayout(layout: unknown): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookmark-desktop-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 面板开合：关掉的时候把待确认的那份布局一起丢掉（老版本靠 p.hidden 判当前状态） */
export function toggleSyncPanel(force?: boolean): void {
  const open = force == null ? !state.syncPanel : !!force;
  state.syncPanel = open;
  if (!open) syncResetPending();
  bump();
}

export function hideSyncPanel(): void {
  if (!state.syncPanel && !pendingLayout) return;
  toggleSyncPanel(false);
}

/** 判断一段文本是不是布局：先试 JSON，再看 app 标记 */
export function looksLikeLayout(text: string): boolean {
  const raw = String(text || '').trim();
  if (/^bd[01]\./.test(raw)) return true;
  try {
    const o = JSON.parse(raw);
    return !!(o && o.app === LAYOUT_APP);
  } catch {
    return false;
  }
}

export function isLayoutObject(data: any): boolean {
  return !!(data && data.app === LAYOUT_APP);
}

export function checkLayoutFile(file: File | null | undefined): boolean {
  if (!file) return false;
  if (/\.(json|txt)$/i.test(file.name || '')) return true;
  return file.type === 'application/json' || file.type === 'text/plain';
}

/** 拖文件进来时把那句「松手，把这个布局文件导进来」挂上 */
export function setDropHint(on: boolean): void {
  state.dropHint = !!on;
  // 老版本靠 body 上这个类把子文件夹 / 放大层压暗，拖文件时才像「要导入了」
  document.body.classList.toggle('is-dragging', !!on && !state.dragNode);
  bump();
}

/* 拖进来的是文件而不是页面里的元素？ */
export function isFilesDrag(e: DragEvent): boolean {
  if (state.dragNode) return false;           // 内部拖拽一律不参与导入
  const types = (e.dataTransfer && e.dataTransfer.types) || [];
  if (types.indexOf(BD_MIME) >= 0) return false;
  return types.indexOf('Files') >= 0;
}

/* 先把待导入的布局读出来给人看一眼，点「确认覆盖」才真的写 */
export async function startPreview(text: string): Promise<void> {
  let data: any;
  try {
    data = await unpackLayout(text);
  } catch {
    renderSyncError('这份内容读不出来，可能不是布局文本');
    toggleSyncPanel(true);
    return;
  }
  if (!isLayoutObject(data)) { renderSyncError('不是书签桌面的布局文件'); toggleSyncPanel(true); return; }
  if (Number(data.schema) > LAYOUT_SCHEMA) { renderSyncError('这份布局比当前版本新，先升级扩展'); toggleSyncPanel(true); return; }
  const plan = resolveLayout(data);
  const total = plan.icons.length + countViews(plan);
  const hasPrefs = !!(plan.prefs.wallpaper || plan.prefs.engine || plan.prefs.wallBlur);
  if (!total && !hasPrefs) {
    renderSyncError('这份布局里没有本机对得上的内容');
    toggleSyncPanel(true);
    return;
  }
  pendingLayout = plan;
  toggleSyncPanel(true);
  renderSyncPreview(plan);
  bump();
}

export async function importLayoutFile(file: File): Promise<void> {
  if (!checkLayoutFile(file)) { toast('只认 .json / .txt 布局文件'); return; }
  const text = await file.text();
  await startPreview(text);
}

/* ---------- 面板上的按钮：老版本是 bindUI 里的一串内联回调 ---------- */

/** #syncCopy「复制 JSON」 */
export async function copyLayoutJson(): Promise<void> {
  const ok = await copyText(JSON.stringify(buildLayout(), null, 2));
  toast(ok ? '布局 JSON 已复制' : '复制失败');
}

/** #syncDownload「存成文件」 */
export function saveLayoutFile(): void {
  downloadLayout(buildLayout());
  toast('已存成文件');
}

/** #syncShare「复制分享文本」 */
export async function copyShareText(): Promise<void> {
  try {
    const text = await packLayout(buildLayout());
    const ok = await copyText(text);
    toast(ok ? `分享文本已复制（${text.length} 字）` : '复制失败');
  } catch {
    toast('生成分享文本失败');
  }
}

/** #syncApply「检查并导入」：老版本读 $('syncInput').value，移植后由组件把内容传进来 */
export async function syncApply(text: string): Promise<void> {
  const raw = String(text || '').trim();
  if (!raw) { toast('先粘一段布局进来'); return; }
  await startPreview(raw);
}

/** 预览面板里的「确认覆盖」：到这一步才真的写库，写完把面板收起来 */
export async function confirmLayout(): Promise<void> {
  if (!pendingLayout) return;
  const plan = pendingLayout;
  pendingLayout = null;
  await applyResolvedLayout(plan);
  toggleSyncPanel(false);
}

/** 有没有待确认的导入计划（SyncPanel 用它决定要不要画「确认覆盖」） */
export function hasPendingLayout(): boolean {
  return !!pendingLayout;
}
