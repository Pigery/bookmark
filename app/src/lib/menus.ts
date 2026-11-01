/** 右键菜单的内容：每一层、每一类节点该出现哪些项。
 *  顺序、文案、分隔线位置照抄老版本 showItemMenu / showFolderMenu /
 *  showZoneBlankMenu / showStageMenu / showTrayMenu。 */
import { MODE_ICON, MODE_LIST, isMode } from './constants';
import { openUrl } from './chrome';
import { storeSet } from './chrome';
import { bump, state, toast, type CtxItem } from './store';
import { current, childrenOf, foldersOf, modeOf, setFolderMode } from './tree';
import { crumbOf, isSelfOrDescendant } from './tree';
import {
  createBookmark,
  createFolder,
  isPinned,
  openCtx,
  pinIcon,
  removeNode,
  renameNode,
  resetItemMode,
  setItemMode,
  sortFolder,
  toggleSyncPanel,
  toggleWallpaperPanel,
  unpinIcon,
} from './actions';
import { enter, goBack } from './nav';
import { moveIcon } from './drag';
import type { BmNode } from './types';

type Entry = CtxItem | '-';

/** 「添加到」选单里能当目标的文件夹（按树的先后），排除当前所在层 */
function folderChoices(excludeId?: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const root = state.bar;
  if (root && String(root.id) !== String(excludeId)) out.push({ id: root.id, label: '书签栏' });
  const walk = (node: BmNode, prefix: string) => {
    childrenOf(node).forEach((c) => {
      if (c.url) return;
      const label = prefix ? `${prefix} / ${c.title || '未命名'}` : c.title || '未命名';
      if (String(c.id) !== String(excludeId)) out.push({ id: String(c.id), label });
      walk(c, label);
    });
  };
  if (root) walk(root, '');
  return out;
}

/** 复制文本：扩展里能用 clipboard API 就用，权限被拒时退回 textarea + execCommand */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function setFolderModeThen(node: BmNode, mode: 'icon' | 'list'): Promise<void> {
  await setFolderMode(node, mode);
  bump();
}

/* ---------------- 各类节点的菜单 ---------------- */

export function showTrayMenu(node: BmNode, x: number, y: number): void {
  openCtx(x, y, [
    { label: '打开', run: () => openUrl(node.url || '', false) },
    { label: '在新标签页打开', run: () => openUrl(node.url || '', true) },
    '-',
    { label: '取消置顶', run: () => unpinIcon(node) },
  ]);
}

export function showItemMenu(node: BmNode, x: number, y: number): void {
  const mode = modeOf(node);
  const explicit = isMode(state.views.items[node.id]);
  const targets = folderChoices(node.parentId ? String(node.parentId) : undefined);
  const items: Entry[] = [
    { label: '打开', run: () => openUrl(node.url || '', false) },
    { label: '在新标签页打开', run: () => openUrl(node.url || '', true) },
    '-',
    { label: '以图标显示', on: mode === MODE_ICON, run: () => setItemMode(node, MODE_ICON) },
    { label: '以列表显示', on: mode === MODE_LIST, run: () => setItemMode(node, MODE_LIST) },
  ];
  if (explicit) items.push({ label: '恢复自动显示', run: () => resetItemMode(node) });
  items.push(
    '-',
    { label: isPinned(node.id) ? '已在桌面上' : '置顶到桌面图标', run: () => pinIcon(node) },
    {
      label: '复制地址',
      run: async () => {
        const ok = await copyText(node.url || '');
        toast(ok ? '地址已复制' : '复制失败');
      },
    },
  );
  if (targets.length) {
    items.push({
      label: '添加到',
      children: targets.map((f) => ({ label: f.label, run: () => moveTo(node, f.id) })),
    });
  }
  items.push('-', { label: '重命名', run: () => renameNode(node) }, { label: '删除', danger: true, run: () => removeNode(node) });
  openCtx(x, y, items);
}

export function showFolderMenu(node: BmNode, x: number, y: number): void {
  const mode = modeOf(node);
  const isReal = state.byId.has(String(node.id));
  const items: Entry[] = [{ label: '打开', run: () => enter(node) }];
  if (isReal) {
    items.push(
      '-',
      { label: '新建书签', run: () => createBookmark(node) },
      { label: '新建子文件夹', run: () => createFolder(node) },
      '-',
      { label: '图标显示', on: mode === MODE_ICON, run: () => setFolderModeThen(node, MODE_ICON) },
      { label: '列表显示', on: mode === MODE_LIST, run: () => setFolderModeThen(node, MODE_LIST) },
      { label: '按名称排序', run: () => sortFolder(node) },
      '-',
      { label: '重命名', run: () => renameNode(node) },
      { label: '删除', danger: true, run: () => removeNode(node) },
    );
  }
  openCtx(x, y, items);
}

export function showZoneBlankMenu(node: BmNode, x: number, y: number): void {
  const loose = node && node.id && String(node.id).startsWith('__loose__');
  const target = loose ? current() || state.bar : node;
  if (!target) return;
  const isRoot = !!(state.bar && String(target.id) === String(state.bar.id));
  const isReal = state.byId.has(String(target.id)) && !isRoot;
  const mode = modeOf(target);
  const items: Entry[] = [
    { label: '新建书签', run: () => createBookmark(target) },
    { label: '新建子文件夹', run: () => createFolder(target) },
    '-',
    { label: '图标显示', on: mode === MODE_ICON, run: () => setFolderModeThen(target, MODE_ICON) },
    { label: '列表显示', on: mode === MODE_LIST, run: () => setFolderModeThen(target, MODE_LIST) },
    { label: '按名称排序', run: () => sortFolder(target) },
  ];
  if (isReal) {
    items.push('-', { label: '重命名', run: () => renameNode(target) }, { label: '删除', danger: true, run: () => removeNode(target) });
  }
  openCtx(x, y, items);
}

export function showStageMenu(x: number, y: number): void {
  const bar = state.bar;
  openCtx(x, y, [
    { label: '新建书签', run: () => createBookmark(bar) },
    { label: '新建分组', run: () => createFolder(bar) },
    { label: '按名称排序', run: () => sortFolder(bar) },
    '-',
    { label: '更换壁纸', run: () => toggleWallpaperPanel(true) },
    { label: '布局同步', run: () => toggleSyncPanel(true) },
  ]);
}

/* 「添加到 → 某文件夹」：拖拽用的是同一套 moveInto，这里包一层把提示换成移动语义 */
async function moveTo(node: BmNode, targetId: string): Promise<void> {
  if (isSelfOrDescendant(node, targetId)) {
    toast(node.url ? '已经在这里了' : '不能拖进自己里面');
    return;
  }
  const target = state.byId.get(String(targetId));
  if (!target) return;
  const { HAS_BOOKMARKS } = await import('./chrome');
  if (!HAS_BOOKMARKS) {
    toast('预览模式不能拖动');
    return;
  }
  try {
    const index = childrenOf(target).length;
    await chrome.bookmarks.move(node.id, { parentId: String(targetId), index });
    toast(`已移到「${target.title || '书签栏'}」`);
    const { refresh } = await import('./actions');
    await refresh();
  } catch {
    toast('移动失败');
  }
}

/* 让“打开文件夹”的行为统一：卡片标题、子文件夹行、右键「打开」都走 enter() */
export function openFolder(node: BmNode): void {
  enter(node);
}

export { folderChoices, crumbOf, foldersOf, moveIcon, storeSet, goBack };
