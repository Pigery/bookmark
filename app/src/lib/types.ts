/** 全书签桌面共用的类型。老版本是纯 JS，这些形状都是从 newtab.js 里逐条读出来的。 */

/** 一条书签或一个文件夹。chrome.bookmarks 给的就是这个形状，这里只补我们额外挂的字段。 */
export interface BmNode {
  id: string;
  title?: string;
  url?: string;
  /** indexTree() 遍历时补上的父级 id */
  parentId?: string;
  children?: BmNode[];
  /** chrome.bookmarks 的图标（预览模式的假树里有） */
  iconUrl?: string;
  dateAdded?: number;
  index?: number;
  /** 「未分组」虚拟卡：id 形如 `__loose__:<父文件夹 id>`，不是真节点 */
  loose?: boolean;
}

/** 显示方式 */
export type Mode = 'icon' | 'list';

/** 显示方式的覆盖表：文件夹一份、书签一份 */
export interface Views {
  v: number;
  folders: Record<string, Mode>;
  items: Record<string, Mode>;
}

/** 置顶清单里的一格。可能是 id（回头去 byId 里查），也可能是抓下来的快照 */
export interface IconEntry {
  id?: string;
  url?: string;
  title?: string;
  iconUrl?: string;
}

export interface WallpaperPreset {
  id: string;
  light: boolean;
  css: string;
}

export interface WallBlur {
  id: string;
  label: string;
  px: number;
}

export interface SearchEngine {
  id: string;
  name: string;
  url: (q: string) => string;
}

/** 必应壁纸往期：idx 0 = 今天，1 = 昨天… */
export interface BingDay {
  idx: number;
  url: string;
  /** 画廊缩略图（320 宽）；老版本只在取回时算一次 */
  thumb?: string;
  title?: string;
  copyright?: string;
  /** 必应给的日子 YYYYMMDD，用来写「M 月 D 日」 */
  day?: string;
}

export interface BingCache {
  at: number;
  ts?: number;
  /** 这份缓存是「要查几天」时取的：天数变了要重取 */
  for_?: number;
  url?: string;
  thumb?: string;
  title?: string;
  copyright?: string;
  list: BingDay[];
}

export interface SearchHit {
  node: BmNode;
  score: number;
  crumb: string;
}

/** 取色结果（analyzeThumb → paperTintVars） */
export interface TintInfo {
  h: number;
  s: number;
  l: number;
}

export interface PaperTint {
  h: number;
  s: number;
  l: number;
}
