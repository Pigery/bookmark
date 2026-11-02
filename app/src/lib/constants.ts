/** 常量：壁纸、模糊档位、搜索引擎、显示方式、图标小件。
 *  值一律照抄老版本 newtab.js，改一个像素都会让移植走样。 */
import type { Mode, SearchEngine, WallBlur, WallpaperPreset } from './types';

/** 水印兜底版本号：扩展里优先读 manifest 的 version，预览模式显示这个 */
export const APP_VERSION = '3.0.2';

/* 8 套渐变：深色 5、浅色 3。light:true 会把整页配色切到浅色纸。
   css 直接写进 #bg 的 background，不需要图片、不联网 */
export const WALLPAPERS: WallpaperPreset[] = [
  { id: 'aurora', light: false, css: 'radial-gradient(120% 90% at 18% 8%, #2a3f6b 0%, #151c30 46%, #0b0f1a 100%)' },
  { id: 'dusk', light: false, css: 'linear-gradient(160deg, #4a2f4f 0%, #2a1d33 42%, #120e1a 100%)' },
  { id: 'forest', light: false, css: 'radial-gradient(110% 85% at 82% 12%, #1f4a3f 0%, #13261f 45%, #0a1210 100%)' },
  { id: 'ember', light: false, css: 'radial-gradient(100% 80% at 24% 86%, #6b3a22 0%, #33200f 44%, #140c07 100%)' },
  { id: 'ink', light: false, css: 'linear-gradient(150deg, #1d2027 0%, #101216 48%, #07080a 100%)' },
  { id: 'paper', light: true, css: 'linear-gradient(160deg, #f2ece2 0%, #e6dccd 46%, #d8c9b5 100%)' },
  { id: 'mist', light: true, css: 'linear-gradient(160deg, #eef2f6 0%, #dfe6ee 48%, #cfd8e3 100%)' },
  { id: 'sand', light: true, css: 'linear-gradient(160deg, #f6efe0 0%, #eadfc6 50%, #d9c9a6 100%)' },
];

export const WALL_BLURS: WallBlur[] = [
  { id: 'off', label: '无', px: 0 },
  { id: 'lite', label: '轻', px: 10 },
  { id: 'mid', label: '中', px: 22 },
  { id: 'deep', label: '重', px: 40 },
];

/* v2.1.0：只留三家 —— 必应 / 百度 / Google。
   以前每个引擎还有个「首字当图标」的 logo，现在一律只写名字（下拉菜单同理）。 */
export const ENGINES: SearchEngine[] = [
  { id: 'bing', name: '必应', url: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'baidu', name: '百度', url: (q: string) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { id: 'google', name: 'Google', url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
];

export const MODE_ICON: Mode = 'icon';
export const MODE_LIST: Mode = 'list';
export const isMode = (v: unknown): v is Mode => v === MODE_ICON || v === MODE_LIST;

/** 内部拖拽的私有 MIME：绝不用 text/plain，否则会被当成「从外面拖进来一个链接」 */
export const BD_DRAG = 'application/x-bd-node';

/** 拖拽时用的类名，清理时一次清干净 */
export const DRAG_CLASSES = ['dragging', 'drop-active', 'insert-before', 'insert-after', 'drop-target'];

/** 落点判定阈值 */
export const ITEM_EDGE = 0.5;
export const ZONE_EDGE = 0.28;
export const ZONE_EDGE_MAX = 130;
export const FOLDER_EDGE = 0.3;

/** 布局同步 */
export const LAYOUT_APP = 'bookmark-desktop-layout';
export const LAYOUT_SCHEMA = 1;
export const SHARE_PREFIX_GZ = 'bd1.';
export const SHARE_PREFIX_RAW = 'bd0.';
export const BD_MIME = 'application/x-bookmark-desktop';

/** 必应壁纸 */
export const BING_DAYS = 9;
export const BING_ENDPOINTS = [
  (n: number) => `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${n}&mkt=zh-CN`,
  (n: number) => `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${n}&mkt=en-US`,
];
export const BING_CACHE_MS = 6 * 60 * 60 * 1000;

/** 图标小件（照抄老版本的 SVG 字符串，viewBox / 线宽都别动） */
export const SVG_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const SVG_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const SVG_FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
export const SVG_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const SVG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
export const SVG_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const SVG_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const SVG_HELP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2-2.6 3.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17.1" r="1.05" fill="currentColor"/></svg>';

/** 自动推断显示方式用的三条正则（照抄） */
export const SITE_ICON = /(^|\.)(figma\.com|notion\.so|excalidraw\.com|miro\.com|vercel\.com|netlify\.app|localhost|127\.0\.0\.1|192\.168\.)/i;
export const SITE_LIST = /(^|\.)(zhihu\.com|juejin\.cn|sspai\.com|medium\.com|ycombinator\.com|reddit\.com|news\.|blog\.|weibo\.com|bilibili\.com)/i;
export const LIST_PATH = /(github\.com\/[^/]+\/[^/]+\/(blob|tree|issues|pull)|docs?\.|\.md$|\/(wiki|issue|post|article|p)\/)/i;

/** 输入本身是网址时回车直接打开 */
export const URL_LIKE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([\/?#].*)?$/i;
