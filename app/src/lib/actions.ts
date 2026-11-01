/** 各种「动作」：新建 / 改名 / 删除 / 置顶 / 面板开合 / 刷新。
 *  老版本这些都在 bindUI 里以事件回调的形式散着，这里收成一个个函数，
 *  组件只管调用 —— 行为、文案、提示时长一个字没改。 */
import { BING_CACHE_MS } from './constants';
import { HAS_BOOKMARKS, storeSet } from './chrome';
import { loadBingPanel } from './bing';
import { bump, state, toast, type CtxState } from './store';
import { current, loadTree, resolveIconEntry } from './tree';
import { hideSyncPanel as syncHide, toggleSyncPanel as syncToggle } from './sync';
import type { BmNode, Mode } from './types';
import { withScheme } from './utils';

/* ---------- 刷新：书签变了以后重新读树，并尽量把焦点留在原处 ---------- */
function focusToken(): string {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body) return '';
  const host = a.closest ? (a.closest('[data-fid]') as HTMLElement | null) : null;
  if (host && host.dataset.fid) return host.dataset.fid;
  return a.id ? `#${a.id}` : '';
}

function restoreFocus(token: string): void {
  if (!token) return;
  requestAnimationFrame(() => {
    if (token[0] === '#') {
      const el = document.getElementById(token.slice(1));
      if (el) el.focus();
      return;
    }
    const el = document.querySelector(`[data-fid="${token}"]`) as HTMLElement | null;
    if (el) el.focus();
  });
}

export async function refresh(): Promise<void> {
  const token = focusToken();
  await loadTree();
  state.path = state.path.map((n) => state.byId.get(n.id)).filter(Boolean) as BmNode[];
  if (state.zoom) {
    state.zoom = state.byId.get(state.zoom.id) || null;
    if (!state.zoom) state.zoomOpen = false;
  }
  bump();
  restoreFocus(token);
}

/* ---------- 输入弹窗：老版本 promptText 的 Promise 接口原样保留 ---------- */
export function promptText(title: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => {
    state.modal = {
      title,
      value,
      resolve: (v) => {
        state.modal = null;
        bump();
        resolve(v);
      },
    };
    bump();
  });
}

export function closeCtx(): void {
  if (!state.ctx) return;
  state.ctx = null;
  bump();
}

export function openCtx(x: number, y: number, items: CtxState['items']): void {
  state.ctx = { x, y, items };
  bump();
}

/* ---------- 书签的增删改 ---------- */
export async function createFolder(parent?: BmNode | null): Promise<void> {
  if (!HAS_BOOKMARKS) { toast('预览模式不能新建'); return; }
  const here = parent || current() || state.bar;
  if (!here) return;
  const name = await promptText('新文件夹的名字', '');
  if (!name) return;
  try {
    await chrome.bookmarks.create({ parentId: here.id, title: name });
    await refresh();
    toast(`已新建「${name}」`);
  } catch {
    toast('新建失败');
  }
}

export async function createBookmark(parent?: BmNode | null): Promise<void> {
  if (!HAS_BOOKMARKS) { toast('预览模式不能新建'); return; }
  const here = parent || current() || state.bar;
  if (!here) return;
  const title = await promptText('书签名字', '');
  if (title == null) return;
  const url = await promptText('书签地址', 'https://');
  if (!url) return;
  try {
    await chrome.bookmarks.create({ parentId: here.id, title: title || url, url: withScheme(url) });
    await refresh();
    toast('已新建书签');
  } catch {
    toast('新建失败，地址是不是写错了');
  }
}

export async function renameNode(node?: BmNode | null): Promise<void> {
  if (!node) return;
  if (!HAS_BOOKMARKS) { toast('预览模式不能改名'); return; }
  const name = await promptText('改成什么名字', node.title || '');
  if (name == null) return;
  try {
    await chrome.bookmarks.update(node.id, { title: name });
    await refresh();
  } catch {
    toast('改名失败');
  }
}

export async function removeNode(node?: BmNode | null): Promise<void> {
  if (!node) return;
  if (!HAS_BOOKMARKS) { toast('预览模式不能删除'); return; }
  const what = node.url ? '书签' : '文件夹（连同里面的东西）';
  if (!window.confirm(`删除这个${what}？删了就找不回来了。`)) return;
  try {
    await chrome.bookmarks.removeTree(node.id);
    await refresh();
    toast('已删除');
  } catch {
    toast('删除失败');
  }
}

export async function sortFolder(node?: BmNode | null): Promise<void> {
  if (!node) return;
  if (!HAS_BOOKMARKS) { toast('预览模式不能排序'); return; }
  try {
    const kids = (await chrome.bookmarks.getChildren(node.id)) || [];
    const sorted = (kids as BmNode[]).slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'));
    for (let i = 0; i < sorted.length; i += 1) {
      await chrome.bookmarks.move(sorted[i].id, { parentId: node.id, index: i });
    }
    await refresh();
    toast('已按名称排序');
  } catch {
    toast('排序失败');
  }
}

/* ---------- 置顶 ---------- */
export function isPinned(id?: string): boolean {
  return (state.icons || []).some((entry) => {
    const n = resolveIconEntry(entry);
    return n && String(n.id) === String(id);
  });
}

export async function pinIcon(node?: BmNode | null): Promise<void> {
  if (!node) return;
  if (isPinned(node.id)) { toast('已经在桌面上了'); return; }
  state.icons = (state.icons || []).concat([{
    id: node.id, url: node.url, title: node.title, iconUrl: node.iconUrl || '',
  }]);
  await storeSet('icons', state.icons);
  bump();
  toast('已置顶');
}

export async function unpinIcon(node?: BmNode | null): Promise<void> {
  if (!node) return;
  const before = (state.icons || []).length;
  state.icons = (state.icons || []).filter((entry) => {
    if (!entry) return false;
    if (entry.url) return String(entry.url) !== String(node.url);
    return String(entry.id) !== String(node.id);
  });
  if (state.icons.length === before) return;
  await storeSet('icons', state.icons);
  bump();
  toast('已取消置顶');
}

/* ---------- 单条书签的显示方式 ---------- */
export async function setItemMode(node: BmNode, mode: Mode): Promise<void> {
  state.views.items[node.id] = mode;
  await storeSet('views', state.views);
  bump();
}

export async function resetItemMode(node: BmNode): Promise<void> {
  delete state.views.items[node.id];
  await storeSet('views', state.views);
  bump();
}

/* ---------- 浮层开合 ---------- */
export async function toggleWallpaperPanel(force?: boolean): Promise<void> {
  const open = force == null ? !state.wpPanel : !!force;
  state.wpPanel = open;
  bump();
  clearInterval(state.bingTick);
  if (open) {
    await loadBingPanel();
    state.bingTick = setInterval(() => {
      if (state.wpPanel) loadBingPanel();
    }, BING_CACHE_MS) as unknown as number;
  }
}

export function hideWallpaper(): void {
  state.wpPanel = false;
  clearInterval(state.bingTick);
  state.bingTick = 0;
  bump();
}

/* 布局同步面板的开关在 sync.ts 里（那边还管着「待确认的导入计划」，关面板要一起清） */
export function toggleSyncPanel(force?: boolean): void {
  syncToggle(force);
}

export function hideSyncPanel(): void {
  syncHide();
}

export function toggleKeyHint(force?: boolean): void {
  state.helpCard = force == null ? !state.helpCard : !!force;
  bump();
}

export function setDropHint(on: boolean): void {
  state.dropHint = on;
  bump();
}

/* Chrome 里书签被别处改动（装了新扩展、手机上收藏、别的窗口拖过）时跟着刷新。
   老版本是在 bindUI() 里注册五个事件 + 120ms 防抖，这里照做。 */
let watchInstalled = false;
export function watchBookmarks(): void {
  if (watchInstalled || !HAS_BOOKMARKS) return;
  watchInstalled = true;
  let timer = 0;
  const kick = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void refresh();
    }, 120);
  };
  chrome.bookmarks.onCreated.addListener(kick);
  chrome.bookmarks.onRemoved.addListener(kick);
  chrome.bookmarks.onChanged.addListener(kick);
  chrome.bookmarks.onMoved.addListener(kick);
  chrome.bookmarks.onChildrenReordered.addListener(kick);
}
