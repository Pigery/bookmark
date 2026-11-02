/** 布局同步：导出 / 导入（老 newtab.js 第 720~1092 行搬过来，传输方式改成纯 JSON 文本）。
 *
 *  只搬「怎么展示」：置顶图标顺序、图标 / 列表方式、壁纸、引擎、模糊档位。
 *  书签本身由浏览器自己同步，这里一根指头都不碰它。
 *
 *  全程只有文本：面板里给出这份 JSON，另一边粘进去点「检查并导入」。
 *  不落文件、不压缩、不走链接 —— 文本能进的地方（聊天框、备忘录、邮件）都能传。
 *
 *  关键点：chrome.bookmarks 的 id 是每台设备本地分配的，同一份书签在
 *  A 机和 B 机上 id 完全不同，直接搬 id 会全部错位。所以导出时先把 id
 *  翻译成跨设备稳定的键 —— 书签用规范化 URL，文件夹用「书签栏/工具/前端」
 *  这样的标题路径 —— 导入时再翻回本机的 id。JSON 里不出现任何 bookmark id。
 *
 *  移植说明：老版本直接改 DOM 的地方（$('syncPreview').innerHTML = …、
 *  $('syncInput').value）全部换成写 state.syncPreview / state.syncError，
 *  再 bump() 让 SyncPanel 重画；「上一次预览解析出来的计划」这种面板内部
 *  的临时数据不进全局 state，就放在本文件的模块级变量 pendingLayout 里。 */
import { fetchBingWallpaper } from './bing';
import { storeSet } from './chrome';
import {
  ENGINES,
  LAYOUT_APP,
  LAYOUT_SCHEMA,
  WALL_BLURS,
  WALLPAPERS,
  isMode,
  isZoneMode,
} from './constants';
import { bump, state, toast } from './store';
import type { BmNode, Mode, ZoneMode } from './types';
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
  views: { items: Record<string, Mode>; folders: Record<string, ZoneMode> };
}

/** 布局翻译回本机 id 之后的计划：还没写库，先给人看一眼 */
export interface LayoutPlan {
  icons: string[];
  items: Record<string, Mode>;
  folders: Record<string, ZoneMode>;
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
  const folders: Record<string, ZoneMode> = {};
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
    if (!id || !isZoneMode(v)) { plan.missViews += 1; return; }
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

/* ---------- 文本进出 ---------- */

/** 面板上「导出」那格显示的内容：给人看的缩进 JSON */
export function layoutJsonText(): string {
  return JSON.stringify(buildLayout(), null, 2);
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

export function isLayoutObject(data: any): boolean {
  return !!(data && data.app === LAYOUT_APP);
}

/** 从外面拖东西进来时把那句「松手…」挂上 */
export function setDropHint(on: boolean): void {
  const next = !!on;
  // 老版本靠 body 上这个类把子文件夹 / 放大层压暗，拖东西时才像「要收下了」
  document.body.classList.toggle('is-dragging', next && !state.dragNode);
  // dragover 一秒能触发几十次：状态没变就别 bump，否则整棵树跟着白画几十遍
  if (state.dropHint === next) return;
  state.dropHint = next;
  bump();
}

/* 先把待导入的布局读出来给人看一眼，点「确认覆盖」才真的写 */
export async function startPreview(text: string): Promise<void> {
  const raw = String(text || '').trim();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    renderSyncError(
      /^bd[01]\./.test(raw) ? '这是老版本的分享文本，这版只认 JSON' : '这份内容读不出来，可能不是布局文本',
    );
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

/* ---------- 面板上的按钮：老版本是 bindUI 里的一串内联回调 ---------- */

/** #syncCopy「复制 JSON」 */
export async function copyLayoutJson(): Promise<void> {
  const ok = await copyText(layoutJsonText());
  toast(ok ? '布局 JSON 已复制' : '复制失败');
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
