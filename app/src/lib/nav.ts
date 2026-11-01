/** 导航与搜索：老版本里散落在 7.7 放大层、8.2 搜索那几段的东西。
 *  全部只改 `state` 然后 `bump()` —— 画界面是组件的事。 */
import { ENGINES } from './constants';
import { openUrl, storeSet } from './chrome';
import { bump, state } from './store';
import { searchHits } from './tree';
import type { BmNode } from './types';
import { looksLikeUrl, withScheme } from './utils';

export function engineNow() {
  return ENGINES.find((x) => x.id === state.engine) || ENGINES[0];
}

/** 点文件夹 = 打开放大层（桌面上双击才进去，单点不打扰） */
export function openZoom(node: BmNode): void {
  if (!node) return;
  state.zoom = node;
  state.zoomOpen = true;
  bump();
}

export function closeZoom(): void {
  state.zoom = null;
  state.zoomOpen = false;
  bump();
}

export function enter(node: BmNode): void {
  openZoom(node);
}

export function goBack(): void {
  const node = state.zoom;
  if (!node) return;
  const parent = node.parentId ? state.byId.get(node.parentId) : null;
  if (parent && parent !== state.bar) openZoom(parent);
  else closeZoom();
}

/** 回车：网址直接打开，否则交给搜索引擎 */
export function runSearch(raw: string): void {
  const q = String(raw || '').trim();
  if (!q) return;
  // 唯一例外：输入本身就是网址，直接打开
  if (looksLikeUrl(q)) {
    openUrl(withScheme(q), false);
    return;
  }
  openUrl(engineNow().url(q), false);
}

/** 输入框每次变化：只在关键字真的变了时重排结果 */
export function applyQuery(raw: string): void {
  const q = String(raw || '').trim();
  if (q === state.query) return;
  state.query = q;
  bump();
}

export function clearSearch(): void {
  state.query = '';
  bump();
}

export async function pickEngine(id: string): Promise<void> {
  state.engine = id;
  state.engineMenu = false;
  bump();
  await storeSet('engine', id);
}

/** 占位文字跟着结果走（v1.18.0）：有命中就写「回车打开「XXX」· 其余 N 个」 */
export function placeholderFor(raw: string): string {
  const e = engineNow();
  const q = String(raw || '').trim();
  if (!q) return `搜索书签，回车用${e.name}搜索`;
  const hits = searchHits(q);
  if (!hits.length) return `没有匹配，回车用${e.name}搜索`;
  const first = hits[0].node.title || hits[0].node.url;
  return hits.length > 1
    ? `回车打开「${first}」 · 其余 ${hits.length - 1} 个`
    : `回车打开「${first}」`;
}
