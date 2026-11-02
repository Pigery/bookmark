/** 书签树 + 显示方式（图标 / 列表）的判定与读写。
 *  这一层全是纯逻辑，老版本怎么算的，这里就怎么算 —— 连注释里的来由都一起搬。 */
import { HAS_BOOKMARKS, pickBar } from './chrome';
import { storeSet, storeGet } from './chrome';
import { MODE_ICON, MODE_LIST, MODE_MIX, isZoneMode } from './constants';
import { mockTree } from './mock';
import { state, bump } from './store';
import type { BmNode, IconEntry, Mode, SearchHit, ZoneMode } from './types';

export function childrenOf(node: BmNode | null | undefined): BmNode[] {
  return (node && node.children) || [];
}
export function linksOf(node: BmNode | null | undefined): BmNode[] {
  return childrenOf(node).filter((c) => c.url);
}
export function foldersOf(node: BmNode | null | undefined): BmNode[] {
  return childrenOf(node).filter((c) => !c.url);
}
/** 当前下钻到哪一层（没下钻就是书签栏） */
export function current(): BmNode | null {
  return state.path.length ? state.path[state.path.length - 1] : state.bar;
}

/** 遍历一遍，补 parentId，建 id → 节点索引 */
export function indexTree(tree: BmNode): BmNode {
  const byId = new Map<string, BmNode>();
  const walk = (node: BmNode, parentId: string | null) => {
    if (parentId != null) node.parentId = parentId;
    byId.set(node.id, node);
    (node.children || []).forEach((c) => walk(c, node.id));
  };
  walk(tree, null);
  state.byId = byId;
  return tree;
}

export async function loadTree(): Promise<BmNode> {
  if (HAS_BOOKMARKS) {
    const [tree] = (await chrome.bookmarks.getTree()) as BmNode[];
    state.bar = pickBar(tree.children) || tree;
    state.tree = indexTree(tree);
    return state.tree;
  }
  const tree = mockTree();
  state.bar = (tree.children || [])[0] || tree;
  state.tree = indexTree(tree);
  return state.tree;
}

/** 「未分组」假卡片的 id 前缀：`__loose__:<父文件夹 id>` */
export const LOOSE_PREFIX = '__loose__:';

/** 假卡片代表的是哪个真文件夹（真文件夹就是它自己） */
export function realFolderId(node: BmNode | null | undefined): string {
  const id = String((node && node.id) || '');
  return id.startsWith(LOOSE_PREFIX) ? id.slice(LOOSE_PREFIX.length) : id;
}

/** 从某个文件夹往上找第一个设过显示方式的人（包含它自己）。
 *  v3.1.0 起不再有「自动推断」，所以「没设过」就一路往上，最后落到默认的列表。 */
function modeUpOf(folderId: string): ZoneMode | null {
  let p = folderId ? state.byId.get(String(folderId)) : null;
  while (p) {
    const m = state.views.folders[p.id];
    if (isZoneMode(m)) return m;
    p = p.parentId ? state.byId.get(String(p.parentId)) : null;
  }
  return null;
}

/** 一张卡片（真文件夹或「未分组」假卡）当前的显示方式：图标 / 列表 / 混搭 */
export function zoneModeOf(node: BmNode | null | undefined): ZoneMode {
  if (!node) return MODE_LIST;
  return modeUpOf(realFolderId(node)) || MODE_LIST;
}

/** 单条书签的显示方式。
 *  卡片是整齐的图标/列表时，听卡片的（这样整卡切换才真的整卡）；
 *  卡片是混搭时，看它自己的记录，没记录就按默认的列表。 */
export function modeOf(node: BmNode | null | undefined): Mode {
  if (!node) return MODE_LIST;
  const parentId = node.parentId ? String(node.parentId) : '';
  const fm = parentId ? modeUpOf(parentId) : null;
  if (fm === MODE_ICON || fm === MODE_LIST) return fm;
  const own = state.views.items[node.id];
  return own === MODE_ICON || own === MODE_LIST ? own : MODE_LIST;
}

/** 给卡片改显示方式。切到整齐的图标/列表时**不删**逐条的记录 ——
 *  删了用户辛苦排的混搭就没了，下次点「混搭」还得重排。 */
export async function setFolderMode(node: BmNode, mode: ZoneMode): Promise<void> {
  if (!node || !node.id) return;
  state.views.folders[realFolderId(node)] = mode;
  await storeSet('views', state.views);
  bump();
}

/** 点「混搭」：照每条记着的来（没记过的按列表）。
 *  这里**不动**逐条记录 —— 用户点了整齐的图标/列表之后，点回「混搭」就该原样回来。 */
export async function restoreMix(node: BmNode | null | undefined): Promise<void> {
  const id = realFolderId(node);
  if (!id) return;
  state.views.folders[id] = MODE_MIX;
  await storeSet('views', state.views);
  bump();
}

/** 卡片现在是整齐的图标/列表，用户要单独改某一条 —— 先把**现在看到的**记成每条的样子
 *  （旧记录一律覆盖，因为现在这一整卡的样子才是用户此刻的意图），再把卡片标成混搭。
 *  不这么做的话，整齐态会把那条新记录盖掉，用户点了等于没点。 */
export async function freezeMix(folderId: string | undefined): Promise<void> {
  const id = String(folderId || '');
  if (!id) return;
  const now = zoneModeOf(state.byId.get(id) || ({ id } as BmNode));
  if (now === MODE_MIX) return;
  childrenOf(state.byId.get(id)).forEach((c) => {
    if (c.url) state.views.items[c.id] = now;
  });
  state.views.folders[id] = MODE_MIX;
  await storeSet('views', state.views);
}

/** 置顶清单里的一格：可能是 id，也可能是抓下来的快照 */
export function resolveIconEntry(entry: IconEntry | string | null | undefined): BmNode | null {
  if (!entry) return null;
  if (typeof entry !== 'string' && entry.url) return entry as BmNode;
  const id = typeof entry === 'string' ? entry : entry.id;
  return (id && state.byId.get(id)) || null;
}

/** 这条书签在哪：书签栏 / 工具 / … */
export function crumbOf(node: BmNode | null | undefined): string {
  const parts: string[] = [];
  let p = node && node.parentId ? state.byId.get(node.parentId) : null;
  while (p && p !== state.bar) {
    parts.unshift(p.title || '未命名');
    p = p.parentId ? state.byId.get(p.parentId) : null;
  }
  return ['书签栏', ...parts].join(' / ');
}

/** 排序：标题开头命中 > 标题包含 > 只有网址命中。
 *  搜 github 时不会被一个域名里带 github 的镜像站抢到第一条 */
export function searchHits(q: string): SearchHit[] {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return [];
  const out: SearchHit[] = [];
  state.byId.forEach((node) => {
    if (!node.url) return;
    const title = String(node.title || '').toLowerCase();
    const url = String(node.url || '').toLowerCase();
    let score = 0;
    if (title.startsWith(query)) score = 3;
    else if (title.includes(query)) score = 2;
    else if (url.includes(query)) score = 1;
    if (!score) return;
    out.push({ node, score, crumb: crumbOf(node) });
  });
  out.sort((a, b) => b.score - a.score || String(a.node.title).localeCompare(String(b.node.title), 'zh'));
  return out;
}

/** 启动时把本地存的东西读回来（老版本 main() 里的那段） */
export async function loadPrefs(): Promise<void> {
  state.engine = await storeGet('engine', 'bing');
  state.wallBlur = await storeGet('wallBlur', 'mid');
  const icons = await storeGet<IconEntry[]>('icons', []);
  state.icons = Array.isArray(icons) ? icons : [];
  const views = await storeGet<typeof state.views | null>('views', null);
  if (views && typeof views === 'object') {
    state.views = {
      v: 1,
      folders: { ...(views.folders || {}) },
      items: { ...(views.items || {}) },
    };
  }
  state.bingDay = Number(await storeGet('bingDay', 0)) || 0;
}

/** 防成环：target 是不是 node 自己或它的子孙 */
export function isSelfOrDescendant(node: BmNode | null | undefined, targetId: string | undefined): boolean {
  if (!node || !targetId) return false;
  if (String(node.id) === String(targetId)) return true;
  let p: BmNode | null | undefined = state.byId.get(String(targetId));
  while (p) {
    if (String(p.id) === String(node.id)) return true;
    p = p.parentId ? state.byId.get(p.parentId) : null;
  }
  return false;
}
