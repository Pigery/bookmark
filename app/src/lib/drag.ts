/** 拖动整个体系：拖什么、落在哪儿、松手后调哪个接口。
 *
 *  老版本是给每个 DOM 节点 addEventListener。React 里节点会被复用/重建，
 *  逐个挂钩很容易重复绑定，所以这里改成「事件委托 + 登记表」：
 *  组件把自己的节点登记成某一种落点（reg），document 上只装一套监听，
 *  从最里层往外层依次问「你接不接」，谁先说接就停 —— 跟老版本
 *  里面的 stopPropagation 语义一致（老代码里 item 不接时会冒泡到 zone）。
 */
import { BD_DRAG, DRAG_CLASSES, FOLDER_EDGE, ITEM_EDGE, ZONE_EDGE, ZONE_EDGE_MAX } from './constants';
import { HAS_BOOKMARKS } from './chrome';
import { storeSet } from './chrome';
import { bump, state, toast } from './store';
import { childrenOf, foldersOf, isSelfOrDescendant, modeOf, resolveIconEntry } from './tree';
import { refresh, isPinned } from './actions';
import { setDropHint } from './sync';
import { hexId, looksLikeUrl, withScheme } from './utils';
import type { BmNode } from './types';

type Kind = 'item' | 'tray' | 'folder' | 'zone' | 'zoneHead';

interface Host {
  kind: Kind;
  node: BmNode;
}

const hosts = new WeakMap<Element, Host>();

/** 组件在 ref 里登记「我是一个落点」，重复登记无副作用 */
export function reg(el: Element | null, kind: Kind, node: BmNode): void {
  if (!el) return;
  const old = hosts.get(el);
  if (!old || old.kind !== kind || String(old.node.id) !== String(node.id)) {
    hosts.set(el, { kind, node });
  }
}

/** 从事件目标往外层逐个问，谁先返回 true 谁就吃掉这个事件。
 *  `.zone-head` 只当拖拽把手（没有 dragover/drop 语义），所以它不在 KINDS 里，
 *  落在标题上时会被跳过、继续冒泡到整张卡片 —— 和老版本事件冒泡一致。 */
type Handler = (el: Element, host: Host, e: Event) => boolean;

function askHosts(e: Event, fn: Handler): boolean {
  let cur: Element | null = e.target instanceof Element ? e.target : null;
  while (cur) {
    const host = hosts.get(cur);
    if (host && KINDS.indexOf(host.kind) >= 0) {
      if (fn(cur, host, e)) return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

function hostOf(el: EventTarget | null): { el: Element; host: Host } | null {
  let cur: Element | null = el instanceof Element ? el : null;
  while (cur) {
    const h = hosts.get(cur);
    if (h) return { el: cur, host: h };
    cur = cur.parentElement;
  }
  return null;
}

function beginDrag(e: DragEvent, node: BmNode): void {
  state.dragNode = node;
  try {
    e.dataTransfer?.setData(BD_DRAG, String((node && node.id) || ''));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  } catch {
    /* 少数环境不给 setData */
  }
  document.body.classList.add('is-dragging');
}

export function endDrag(): void {
  state.dragNode = null;
  document.body.classList.remove('is-dragging');
  setDropHint(false);
  clearDragMarks();
}

export function clearDragMarks(root?: Element | Document): void {
  const scope: Document | Element = root || document;
  DRAG_CLASSES.slice(1).forEach((cls) => {
    scope.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
  });
  scope.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
}

/* ---------- 落点左右判定 ---------- */

function itemEdgeOf(el: Element, e: DragEvent | { clientX: number; clientY: number }): 'before' | 'after' {
  const r = el.getBoundingClientRect();
  if (el.classList.contains('tile') || el.classList.contains('tray-app')) {
    return e.clientX < r.left + r.width * ITEM_EDGE ? 'before' : 'after';
  }
  return e.clientY < r.top + r.height * ITEM_EDGE ? 'before' : 'after';
}

function folderEdgeOf(el: Element, e: { clientX: number; clientY: number }): '' | 'before' | 'after' {
  const r = el.getBoundingClientRect();
  const horizontal = el.classList.contains('zoom-folder');
  if (horizontal) {
    if (e.clientX < r.left + r.width * FOLDER_EDGE) return 'before';
    if (e.clientX > r.right - r.width * FOLDER_EDGE) return 'after';
  } else {
    if (e.clientY < r.top + r.height * FOLDER_EDGE) return 'before';
    if (e.clientY > r.bottom - r.height * FOLDER_EDGE) return 'after';
  }
  return '';
}

function zoneEdgeOf(zone: Element, x: number): '' | 'before' | 'after' {
  const r = zone.getBoundingClientRect();
  const edge = Math.min(r.width * ZONE_EDGE, ZONE_EDGE_MAX);
  if (x - r.left <= edge) return 'before';
  if (r.right - x <= edge) return 'after';
  return '';
}

/* ---------- 卡片（.zone）----------- */

function zoneFolderId(node: BmNode | null): string {
  const id = node && node.id ? String(node.id) : '';
  if (!id) return '';
  const LOOSE = '__loose__:';
  return id.startsWith(LOOSE) ? id.slice(LOOSE.length) : id;
}

function canDropInto(src: BmNode | null, zoneNode: BmNode | null): boolean {
  if (!src || !zoneNode) return false;
  const targetId = zoneFolderId(zoneNode);
  if (!targetId || !state.byId.get(targetId)) return false;
  if (isSelfOrDescendant(src, targetId)) return false;
  if (src.parentId && String(src.parentId) === String(targetId)) return false;
  return true;
}

/* ---------- 各落点的 dragover / dragleave / drop ---------- */

function onItemOver(el: Element, node: BmNode, e: DragEvent): boolean {
  const src = state.dragNode;
  if (!src || !src.url) return false;
  if (String(src.id) === String(node.id)) return false;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const edge = itemEdgeOf(el, e);
  el.classList.toggle('insert-before', edge === 'before');
  el.classList.toggle('insert-after', edge === 'after');
  el.classList.remove('drop-active');
  const host = el.closest('.zone');
  if (host) host.classList.remove('drop-active');
  return true;
}

function onTrayOver(el: Element, node: BmNode, e: DragEvent): boolean {
  const src = state.dragNode;
  if (!src || !isPinned(src.id)) return false;
  if (String(src.id) === String(node.id)) return false;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const edge = itemEdgeOf(el, e);
  el.classList.toggle('insert-before', edge === 'before');
  el.classList.toggle('insert-after', edge === 'after');
  return true;
}

function onFolderOver(el: Element, node: BmNode, e: DragEvent): boolean {
  const src = state.dragNode;
  if (!src) return false;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const edge = !src.url && String(src.id) !== String(node.id) ? folderEdgeOf(el, e) : '';
  if (!edge && !canDropInto(src, node)) {
    el.classList.remove('drop-active', 'insert-before', 'insert-after');
    return true;
  }
  el.classList.toggle('insert-before', edge === 'before');
  el.classList.toggle('insert-after', edge === 'after');
  el.classList.toggle('drop-active', !edge);
  return true;
}

function onZoneOver(el: Element, node: BmNode, e: DragEvent): boolean {
  const src = state.dragNode;
  if (!src) return false;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const srcIsFolder = !src.url;
  const edge = srcIsFolder && !el.classList.contains('dragging') ? zoneEdgeOf(el, e.clientX) : '';
  if (!edge && !canDropInto(src, node)) {
    el.classList.remove('drop-active', 'insert-before', 'insert-after');
    return true;
  }
  el.classList.toggle('insert-before', edge === 'before');
  el.classList.toggle('insert-after', edge === 'after');
  el.classList.toggle('drop-active', !edge);
  return true;
}

function onItemDrop(el: Element, node: BmNode, e: DragEvent): void {
  const src = state.dragNode;
  if (!src || !src.url || !node.url) return;
  if (String(src.id) === String(node.id)) return;
  e.preventDefault();
  e.stopPropagation();
  const edge = itemEdgeOf(el, e);
  endDrag();
  void reorderItem(src, node, edge);
}

function onTrayDrop(el: Element, node: BmNode, e: DragEvent): void {
  const src = state.dragNode;
  if (!src || !isPinned(src.id)) return;
  if (String(src.id) === String(node.id)) return;
  e.preventDefault();
  e.stopPropagation();
  const edge = itemEdgeOf(el, e);
  endDrag();
  void reorderTray(src, node, edge);
}

function onFolderDrop(el: Element, node: BmNode, e: DragEvent): void {
  const src = state.dragNode;
  if (!src) return;
  e.preventDefault();
  e.stopPropagation();
  const edge = !src.url && String(src.id) !== String(node.id) ? folderEdgeOf(el, e) : '';
  endDrag();
  if (!edge && !canDropInto(src, node)) return;
  if (edge) {
    void reorderFolder(src, node, edge);
    return;
  }
  void moveInto(src, node.id);
}

function onZoneDrop(el: Element, node: BmNode, e: DragEvent): void {
  const src = state.dragNode;
  if (!src) return;
  e.preventDefault();
  e.stopPropagation();
  const targetId = zoneFolderId(node);
  const edge = !src.url && !el.classList.contains('dragging') ? zoneEdgeOf(el, e.clientX) : '';
  endDrag();
  if (!edge && !canDropInto(src, node)) return;
  if (edge && targetId) {
    void reorderZone(src, node, edge);
    return;
  }
  void moveInto(src, targetId);
}

/* ---------- 动作 ---------- */

async function moveInto(src: BmNode, targetId: string, opts?: { beforeSetup?: boolean }): Promise<void> {
  if (!src) return;
  const node = src.url ? src : state.byId.get(String(src.id)) || src;
  if (!targetId) return;
  const target = state.byId.get(targetId);
  if (!target) return;
  if (isSelfOrDescendant(node, targetId)) {
    toast(node.url ? '已经在这里了' : '不能拖进自己里面');
    return;
  }
  if (!node.url && opts && opts.beforeSetup) return;
  if (!HAS_BOOKMARKS) {
    toast('预览模式不能拖动');
    return;
  }
  try {
    const index = (target.children || []).length;
    await chrome.bookmarks.move(node.id, { parentId: targetId, index });
    toast(`已移到「${target.title || '书签栏'}」`);
    await refresh();
  } catch {
    toast('移动失败');
  }
}

async function reorderZone(src: BmNode, target: BmNode, edge: 'before' | 'after'): Promise<void> {
  if (!src || src.url) return;
  if (src.id === target.id) return;
  if (!HAS_BOOKMARKS) {
    toast('预览模式不能拖动');
    return;
  }
  try {
    const parent = src.parentId ? state.byId.get(String(src.parentId)) : null;
    const siblings = foldersOf(parent || state.bar).map((f) => f.id);
    const from = siblings.indexOf(src.id);
    const to = siblings.indexOf(target.id);
    if (from < 0 || to < 0) return;
    const list = siblings.slice();
    list.splice(from, 1);
    let at = list.indexOf(target.id);
    if (at < 0) return;
    if (edge === 'after') at += 1;
    list.splice(at, 0, src.id);

    for (let i = 0; i < list.length; i += 1) {
      const id = list[i];
      if (childrenOf(parent).findIndex((c) => String(c.id) === String(id)) === i) continue;
      await chrome.bookmarks.move(id, { parentId: parent ? parent.id : undefined, index: i });
    }
    const targetNode = state.byId.get(String(target.id));
    toast(`已调到「${targetNode ? targetNode.title : ''}」${edge === 'before' ? '前面' : '后面'}`);
    await refresh();
  } catch {
    toast('调整顺序失败');
  }
}

async function reorderItem(src: BmNode, target: BmNode, edge: 'before' | 'after'): Promise<void> {
  if (!src || !src.url || !target || !src.url) return;
  if (String(src.id) === String(target.id)) return;
  if (!HAS_BOOKMARKS) {
    toast('预览模式不能拖动');
    return;
  }
  const targetParentId = target.parentId;
  if (!targetParentId) return;
  const parent = state.byId.get(String(targetParentId));
  if (!parent) return;

  const srcMode = modeOf(src);
  const targetMode = modeOf(target);
  const sameKind = srcMode === targetMode;

  try {
    if (!sameKind) await setItemModeQuiet(src, targetMode);
    const mode = sameKind ? srcMode : targetMode;
    const heap = childrenOf(parent).filter((c) => c.url && modeOf(c) === mode);
    let at = heap.findIndex((c) => String(c.id) === String(target.id));
    if (at < 0) at = heap.length;
    if (edge === 'after') at += 1;

    const sameParent = String(src.parentId) === String(targetParentId);
    let index: number;
    if (sameParent) {
      const all = childrenOf(parent);
      const from = all.findIndex((c) => String(c.id) === String(src.id));
      const anchorId = edge === 'after' ? (heap[at] ? heap[at].id : null) : target.id;
      if (anchorId == null) {
        index = all.length;
      } else {
        index = all.findIndex((c) => String(c.id) === String(anchorId));
        if (index < 0) index = all.length;
      }
      if (from >= 0 && from < index) index -= 1;
      if (from === index) return;
    } else {
      index = childrenOf(parent).length;
      const anchorId = edge === 'after' ? (heap[at] ? heap[at].id : null) : target.id;
      if (anchorId != null) {
        const all = childrenOf(parent);
        const i = all.findIndex((c) => String(c.id) === String(anchorId));
        if (i >= 0) index = i;
      }
    }

    await chrome.bookmarks.move(src.id, { parentId: targetParentId, index });
    toast(`已插到「${target.title || target.url}」${edge === 'before' ? '前面' : '后面'}`);
    await refresh();
  } catch {
    toast('调整顺序失败');
  }
}

async function setItemModeQuiet(node: BmNode, mode: 'icon' | 'list'): Promise<void> {
  state.views.items[node.id] = mode;
  await storeSet('views', state.views);
}

async function reorderFolder(src: BmNode, target: BmNode, edge: 'before' | 'after'): Promise<void> {
  if (!src || src.url || !target || target.url) return;
  if (String(src.id) === String(target.id)) return;
  if (!HAS_BOOKMARKS) {
    toast('预览模式不能拖动');
    return;
  }
  const parentId = target.parentId;
  const parent = parentId ? state.byId.get(String(parentId)) : null;
  if (!parent) return;
  if (isSelfOrDescendant(src, target.id)) {
    toast('不能拖到自己里面');
    return;
  }
  try {
    const all = childrenOf(parent);
    let index = all.findIndex((c) => String(c.id) === String(target.id));
    if (index < 0) return;
    if (edge === 'after') index += 1;
    const from = all.findIndex((c) => String(c.id) === String(src.id));
    if (from >= 0 && from < index) index -= 1;
    if (from === index && String(src.parentId) === String(parentId)) return;
    await chrome.bookmarks.move(src.id, { parentId, index });
    toast(`已排到「${target.title || '未命名'}」${edge === 'before' ? '前面' : '后面'}`);
    await refresh();
  } catch {
    toast('调整顺序失败');
  }
}

async function reorderTray(src: BmNode, target: BmNode, edge: 'before' | 'after'): Promise<void> {
  const list = (state.icons || []).map((entry) => {
    const n = resolveIconEntry(entry);
    return n ? String(n.id) : null;
  });
  const f = list.indexOf(String(src.id));
  const t = list.indexOf(String(target.id));
  if (f < 0 || t < 0) return;
  if (edge === 'before' && f === t - 1) return;
  if (edge === 'after' && f === t + 1) return;
  await moveIcon(src.id, edge === 'before' ? t : t + 1);
}

export async function moveIcon(id: string, at: number | null): Promise<void> {
  const list = (state.icons || []).slice();
  const from = list.findIndex((entry) => {
    const n = resolveIconEntry(entry);
    return n && String(n.id) === String(id);
  });
  if (from < 0) return;
  const [item] = list.splice(from, 1);
  let pos = at == null ? list.length : at;
  if (from < pos) pos -= 1;
  pos = Math.max(0, Math.min(list.length, pos));
  list.splice(pos, 0, item);
  state.icons = list;
  await storeSet('icons', state.icons);
  bump();
}

/* ---------- 一套监听 ---------- */

const KINDS: Kind[] = ['item', 'tray', 'folder', 'zone'];
let installed = false;

export function installDrag(): void {
  if (installed) return;
  installed = true;

  document.addEventListener('dragstart', (e) => {
    const hit = hostOf(e.target);
    if (!hit) return;
    const { el, host } = hit;
    if (host.kind === 'zoneHead') {
      const zone = el.closest('.zone');
      if (zone) zone.classList.add('dragging');
      beginDrag(e, host.node);
      e.stopPropagation();
      return;
    }
    if (host.kind === 'item' || host.kind === 'tray' || host.kind === 'folder') {
      el.classList.add('dragging');
      beginDrag(e, host.node);
      e.stopPropagation();
    }
  });

  document.addEventListener('dragover', (e) => {
    /* 页面内部拖拽：谁都不接的位置也要吞掉默认行为，
       否则松手会变成浏览器拿 <a href> 导航（老版本踩过）。 */
    if (state.dragNode) e.preventDefault();
    askHosts(e, (el, host, ev) => {
      const de = ev as DragEvent;
      if (host.kind === 'item') return onItemOver(el, host.node, de);
      if (host.kind === 'tray') return onTrayOver(el, host.node, de);
      if (host.kind === 'folder') return onFolderOver(el, host.node, de);
      return onZoneOver(el, host.node, de);
    });
  });

  document.addEventListener('dragleave', (e) => {
    askHosts(e, (el) => {
      if (el.contains(e.relatedTarget as Node)) return true;
      el.classList.remove('drop-active', 'insert-before', 'insert-after');
      return false;
    });
  });

  document.addEventListener('drop', (e) => {
    askHosts(e, (el, host, ev) => {
      const de = ev as DragEvent;
      const src = state.dragNode;
      if (!src) return true;
      if (host.kind === 'item') {
        onItemDrop(el, host.node, de);
        return true;
      }
      if (host.kind === 'tray') {
        onTrayDrop(el, host.node, de);
        return true;
      }
      if (host.kind === 'folder') {
        onFolderDrop(el, host.node, de);
        return true;
      }
      onZoneDrop(el, host.node, de);
      return true;
    });
  });

  document.addEventListener('dragend', () => endDrag());

  /* 从网页里拖链接进来（老版本 bindUI 末尾那段） */
  document.addEventListener('dragover', (e) => {
    if (state.dragNode) return;
    const types = (e.dataTransfer && e.dataTransfer.types) || [];
    // 文件不再支持导入，但也别让浏览器把 pdf / 图片当成导航打开
    if (Array.prototype.indexOf.call(types, 'Files') >= 0) {
      e.preventDefault();
      return;
    }
    if (!linkOf(e)) return;
    e.preventDefault();
    setDropHint(true);
  });

  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget) return;
    setDropHint(false);
  });

  document.addEventListener('drop', async (e) => {
    if (state.dragNode) return;
    const types = (e.dataTransfer && e.dataTransfer.types) || [];
    if (Array.prototype.indexOf.call(types, 'Files') >= 0) {
      e.preventDefault();
      setDropHint(false);
      toast('这版不收文件了：用「布局同步」面板复制粘贴 JSON');
      return;
    }
    const link = linkOf(e);
    if (!link) return;
    e.preventDefault();
    setDropHint(false);
    await dropLink(link, e.target as Element | null);
  });

  /* 窗口失焦时把拖拽状态收干净，不然回来还挂着 .dragging */
  window.addEventListener('blur', () => endDrag());
}

/** 外部拖进来的链接文本（uri-list 优先，退回 text/plain） */
function linkOf(e: DragEvent): string {
  const dt = e.dataTransfer;
  if (!dt) return '';
  return String(dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n')[0].trim();
}

/** 从网页拖一条链接进来：落点在哪个子文件夹 / 卡片里，就放进哪个文件夹 */
async function dropLink(link: string, targetEl: Element | null): Promise<void> {
  const url = String(link).split('\n')[0].trim();
  if (!/^[a-z]+:\/\//i.test(url) && !looksLikeUrl(url)) {
    toast('这不是一个网址');
    return;
  }
  if (!HAS_BOOKMARKS) {
    toast('预览模式不能新建');
    return;
  }
  let parentId = state.bar ? state.bar.id : null;
  const host = targetEl && targetEl.closest ? targetEl.closest('[data-fid]') : null;
  if (host) {
    const hit = [...state.byId.values()].find((n) => hexId(n.id) === host.getAttribute('data-fid'));
    if (hit) parentId = hit.url ? hit.parentId || parentId : hit.id;
  }
  try {
    await chrome.bookmarks.create({
      parentId: parentId as string,
      title: url.replace(/^[a-z]+:\/\/(www\.)?/i, ''),
      url: withScheme(url),
    });
    await refresh();
    toast('已添加书签');
  } catch {
    toast('添加失败');
  }
}

export { itemEdgeOf, folderEdgeOf, zoneEdgeOf, canDropInto, zoneFolderId, isSelfOrDescendant };
