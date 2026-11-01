/** 书签树 + 显示方式（图标 / 列表）的判定与读写。
 *  这一层全是纯逻辑，老版本怎么算的，这里就怎么算 —— 连注释里的来由都一起搬。 */
import { HAS_BOOKMARKS, pickBar } from './chrome';
import { storeSet, storeGet } from './chrome';
import {
  LIST_PATH,
  MODE_ICON,
  MODE_LIST,
  SITE_ICON,
  SITE_LIST,
  isMode,
} from './constants';
import { mockTree } from './mock';
import { state, bump } from './store';
import type { BmNode, IconEntry, SearchHit } from './types';

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

/** 只按书签本身打分，不读 state —— 方便单独测。
 *  v2.0.2 修正：原来 score 从 0 起步，而判图标要 >= 1，于是普通网址
 *  （github / google / 百度 / 淘宝 …）永远停在 0 分，全被判成列表。
 *  改成从 +1 起步：**默认就是图标**，只有站点性质 / 路径 / 标题确实像篇文章时才扣到列表。 */
export function inferMode(node: BmNode | null | undefined): 'icon' | 'list' {
  const url = String((node && node.url) || '');
  if (!url) return MODE_ICON;
  let score = 1;
  const host = url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0] || '';
  const rest = url.replace(/^[a-z]+:\/\/([^/?#]+)/i, '');
  // 站点性质
  if (SITE_LIST.test(host)) score -= 2;
  if (SITE_ICON.test(host)) score += 2;
  // 本地地址、内网后台：一律图标
  if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|192\.168\.|10\.)/i.test(url)) score += 3;
  // 路径深度：/a/b 这种多半是具体页面
  if (LIST_PATH.test(rest) || /\.md$/i.test(rest)) score -= 2;
  const depth = rest.split('/').filter(Boolean).length;
  if (depth >= 2) score -= 1;
  if (depth >= 3) score -= 1;
  // 标题长度：长的像文章
  const title = String((node && node.title) || '');
  if (title.length >= 24) score -= 2;
  else if (title.length >= 14) score -= 1;
  // 平局判给列表（score >= 1 才是图标）
  return score >= 1 ? MODE_ICON : MODE_LIST;
}

/** 让「文件夹设成列表后，里面新加的书签也跟着是列表」成立：
 *  往上找最近一个设过的祖先文件夹 */
export function folderModeInherit(node: BmNode | null | undefined): 'icon' | 'list' | null {
  let p = node && node.parentId ? state.byId.get(node.parentId) : null;
  while (p) {
    const m = state.views.folders[p.id];
    if (isMode(m)) return m;
    p = p.parentId ? state.byId.get(p.parentId) : null;
  }
  return null;
}

/** 优先级：单条书签 > 最近的设过显示方式的祖先文件夹 > 自动推断 */
export function modeOf(node: BmNode | null | undefined): 'icon' | 'list' {
  if (!node) return MODE_ICON;
  if (!node.url) {
    const fm = state.views.folders[node.id];
    return isMode(fm) ? fm : MODE_ICON;
  }
  const m = state.views.items[node.id];
  if (isMode(m)) return m;
  const inherited = folderModeInherit(node);
  if (isMode(inherited)) return inherited;
  return inferMode(node);
}

/** 给文件夹改显示方式：文件夹覆盖会连带影响里面没手动设过的书签
 *  （靠 modeOf 往上找祖先实现，这里只负责写库） */
export async function setFolderMode(node: BmNode, mode: 'icon' | 'list'): Promise<void> {
  if (!node || !node.id) return;
  state.views.folders[node.id] = mode;
  await storeSet('views', state.views);
  bump();
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
