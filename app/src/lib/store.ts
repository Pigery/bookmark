/** 全局状态与重绘。
 *
 *  老版本是一个可变的 `state` 对象 + 手工 `draw()` / `paintXxx()` 重绘。
 *  移植成 React 时**故意保留这个形状**：`state` 还是同一个可变对象，
 *  改完字段调 `bump()`，所有订阅者（useApp）就地重渲染。
 *  这样每一条交互逻辑都能 1:1 搬过来，不必先把它翻译成 reducer，
 *  「完美移植、不能改任何行为」才有可操作性。
 *  （真正的 React 状态只用在纯局部的 UI 开合上，比如面板是否展开。）
 */
import { useSyncExternalStore } from 'react';
import type { BmNode, BingDay, IconEntry, Views } from './types';

export interface AppState {
  wallpaper: string;          // 渐变预设 id 或 'bing'
  wallBlur: string;           // 必应照片模糊档位
  engine: string;             // 当前搜索引擎
  wallpaperBing: string;      // 当前生效的必应原图地址
  bingList: BingDay[];        // 必应往期（3×3 九宫格数据）
  bingDay: number;            // 当前选中的天数：0=今天，1=昨天…
  bingTick: number;           // 面板打开时的刷新计时器
  icons: IconEntry[];         // 置顶清单，元素形如 { id, url, title, iconUrl }
  views: Views;               // 显示方式：文件夹 / 书签各自覆盖
  tree: BmNode | null;
  byId: Map<string, BmNode>;  // id → 节点
  bar: BmNode | null;         // 书签栏根节点
  path: BmNode[];             // 下钻路径（面包屑）
  query: string;              // 搜索关键字
  zoom: BmNode | null;        // 放大层当前展示的文件夹
  dragNode: BmNode | null;    // 正在拖的东西

  /* ---- 下面这些是移植时新增的「界面开关」，老版本对应的是 DOM 上的 hidden ---- */
  light: boolean;             // body[data-light]
  toast: string;              // 提示条文案，空串 = 不显示
  toastOn: boolean;
  engineMenu: boolean;        // 引擎下拉
  wpPanel: boolean;           // 壁纸面板
  syncPanel: boolean;         // 布局同步面板
  helpCard: boolean;          // 快捷键卡
  zoomOpen: boolean;          // 放大层
  dropHint: boolean;          // 从外面拖东西进来时的提示
  modal: ModalState | null;   // 通用输入弹窗
  ctx: CtxState | null;       // 右键菜单
  ready: boolean;             // 首次数据是否已就绪
  bootError?: string;         // 启动失败时的原因（老版本写进 .empty 里）
  syncPreview?: string;       // 布局同步面板的预览文本
  syncError?: string;         // 布局同步面板的错误文本
}

export interface CtxItem {
  label: string;
  /** 当前生效的项（显示成高亮态，比如「以图标显示」） */
  on?: boolean;
  danger?: boolean;
  run?: () => void | Promise<void>;
  /** 有子项就变成二级菜单（「添加到 → 某文件夹」） */
  children?: CtxItem[];
}
/** 菜单里的一行：'-' 是分隔线 */
export type CtxEntry = CtxItem | '-';

export interface CtxState {
  x: number;
  y: number;
  items: CtxEntry[];
}

export interface ModalState {
  title: string;
  /** 输入框初值；null 表示这是纯确认框 */
  value: string | null;
  placeholder?: string;
  resolve: (v: string | null) => void;
}

export const state: AppState = {
  wallpaper: 'aurora',
  wallBlur: 'mid',
  engine: 'bing',
  wallpaperBing: '',
  bingList: [],
  bingDay: 0,
  bingTick: 0,
  icons: [],
  views: { v: 1, folders: {}, items: {} },
  tree: null,
  byId: new Map(),
  bar: null,
  path: [],
  query: '',
  zoom: null,
  dragNode: null,

  light: false,
  toast: '',
  toastOn: false,
  engineMenu: false,
  wpPanel: false,
  syncPanel: false,
  helpCard: false,
  zoomOpen: false,
  dropHint: false,
  modal: null,
  ctx: null,
  ready: false,
};

let version = 0;
const subs = new Set<() => void>();

/** 改完 state 的字段调它 —— 等价于老版本的 render() */
export function bump(): void {
  version += 1;
  subs.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function getVersion(): number {
  return version;
}

/** 组件里订阅一次，任何 bump() 都会让它重渲染（读 state 即可拿到最新值） */
export function useApp(): AppState {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

let toastTick = 0;
/** 提示条：1.8 秒后自己收起来（老版本同一套时长） */
export function toast(msg: string): void {
  state.toast = msg;
  state.toastOn = true;
  bump();
  clearTimeout(toastTick);
  toastTick = window.setTimeout(() => {
    state.toastOn = false;
    bump();
  }, 1800);
}
