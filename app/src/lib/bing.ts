/** 必应每日壁纸：取最近 9 天，画廊里排 3×3。
 *  这一段是从老 newtab.js 第 526~728 行整段搬过来的，连注释保留。
 *  唯一的变化：原来直接改 DOM 的地方（paintBingGallery）交给壁纸面板组件，
 *  这里只管「数据 + state」。 */
import { BING_CACHE_MS, BING_DAYS, BING_ENDPOINTS } from './constants';
import { storeGet, storeSet } from './chrome';
import { bump, state, toast } from './store';
import type { BingCache, BingDay } from './types';
import { applyWallpaper } from './wallpaper';

/** 缩略图参数：原图动辄 3~8MB，画廊里只要 320 宽就够看 */
export function bingThumb(url: string, w = 320): string {
  return url.replace(/&w=\d+/, '').replace(/&h=\d+/, '') + `&w=${w}&h=${Math.round(w * 0.5625)}&rs=1`;
}

/* 一次请求要回 want 天。必应有时只认 idx 不认 n、有时反过来，
   所以「要 8 天却只给 1 天」就当这次没成功，换下一套参数再试 */
async function bingOnce(makeUrl: (want: number, idx: number) => string, want: number, idx = 0): Promise<BingDay[]> {
  const res = await fetch(makeUrl(want, idx));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const imgs: any[] = ((data && data.images) || []).filter((img: any) => img && img.url);
  if (!imgs.length) throw new Error('无数据');
  return imgs.map((img, i) => {
    const full = img.url.startsWith('http') ? img.url : 'https://www.bing.com' + img.url;
    return {
      idx: idx + i,
      url: full,
      thumb: bingThumb(full),
      title: img.title || '',
      copyright: img.copyright || '',
      day: img.enddate || '',
    };
  });
}

/* 一天一天地要：第 0 天、第 1 天……直到拿到重复的。
   单次请求的 n 在某些地区最多只给 8 条，按天问不受这个限制 */
async function bingByDays(makeUrl: (want: number, idx: number) => string): Promise<BingDay[]> {
  const out: BingDay[] = [];
  for (let i = 0; i < BING_DAYS; i += 1) {
    let got: BingDay[] = [];
    try {
      got = await bingOnce(makeUrl, 1, i);
    } catch {
      break;
    }
    const first = got[0];
    if (!first) break;
    if (out.some((d) => d.url === first.url)) break;
    out.push({ ...first, idx: i });
  }
  return out;
}

/* 往期去重用「URL 的查询串」而不是整条 URL：
   缓存里存的可能是缩略图地址，只差 w/h 参数，整串比会认成两张 */
function bingKey(url?: string): string {
  const s = String(url || '');
  const q = s.split('?')[1];
  if (!q) return s;
  return q.replace(/&(w|h|rs)=[^&]*/g, '');
}

export async function fetchBingWallpaper(force = false): Promise<BingCache & { thumb?: string }> {
  const cached = await storeGet<(BingCache & { url?: string; thumb?: string; title?: string; copyright?: string; for_?: number; ts?: number }) | null>('bing', null);
  // 缓存里记着「这份是按几天取的」（for_）。天数一改旧缓存直接作废，
  // 否则升级完打开看见的还是老画廊，得干等 6 小时缓存过期
  const fresh = !!cached && !!cached.ts && Date.now() - (cached.ts || 0) < BING_CACHE_MS
    && !!cached.url && !!cached.list && cached.list.length > 0
    && cached.for_ === BING_DAYS;
  if (!force && fresh && cached) return cached as BingCache & { thumb?: string };
  const prev: BingDay[] = cached && cached.list ? cached.list : [];

  let list: BingDay[] = [];
  for (const makeUrl of BING_ENDPOINTS) {
    try {
      list = await bingOnce(makeUrl, BING_DAYS);
      if (list.length > 1) break;
    } catch { /* 换下一套参数 */ }
  }
  // 不够 9 张就走逐天兜底：必应把 n 的上限卡在 8，差的那一张得自己补
  if (list.length < BING_DAYS) {
    for (const makeUrl of BING_ENDPOINTS) {
      try {
        const viaDays = await bingByDays(makeUrl);
        if (viaDays.length > list.length) { list = viaDays; break; }
      } catch { /* 继续试 */ }
    }
  }
  // 只拿到今天：把之前存过的往期拼在后面，画廊不会凭空蒸发
  if (list.length <= 1) {
    const today = list[0];
    const seen = new Set(today ? [bingKey(today.url)] : []);
    const rest = prev.filter((d) => {
      const k = bingKey(d.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    list = [...(today ? [today] : []), ...rest].map((d, i) => ({ ...d, idx: i }));
  }
  if (!list.length) {
    if (cached && cached.url) return cached as BingCache & { thumb?: string };
    throw new Error('必应壁纸无数据');
  }

  const out = {
    url: list[0].url,
    thumb: list[0].thumb,
    title: list[0].title,
    copyright: list[0].copyright,
    list,
    for_: BING_DAYS,
    ts: Date.now(),
  };
  await storeSet('bing', out);
  return out as unknown as BingCache & { thumb?: string };
}

export function bingDayLabel(day?: BingDay | null): string {
  if (!day || !day.day || day.day.length !== 8) return '那天';
  return `${Number(day.day.slice(4, 6))} 月 ${Number(day.day.slice(6, 8))} 日`;
}

/** 启动时：存的是必应壁纸，就把当天那张找回来（老版本 init() 里的那一段） */
export async function ensureBingWallpaper(): Promise<void> {
  const b = await fetchBingWallpaper();
  state.bingList = (b.list && b.list.length)
    ? b.list
    : [{ idx: 0, url: b.url!, thumb: b.thumb, title: b.title, copyright: b.copyright }];
  const cur = state.bingList.find((d) => d.idx === state.bingDay) || state.bingList[0];
  state.wallpaperBing = cur ? cur.url : b.url || '';
  state.wallpaper = 'bing';
}

/** 打开壁纸面板时拉一次（老版本 loadBingPanel） */
export async function loadBingPanel(): Promise<void> {
  try {
    const b = await fetchBingWallpaper();
    state.bingList = (b.list && b.list.length)
      ? b.list
      : [{ idx: 0, url: b.url!, thumb: b.thumb, title: b.title, copyright: b.copyright }];
    if (state.bingDay == null) state.bingDay = 0;
    // 选的那天滚出 9 天窗口了（停了半个月没开），退回今天
    if (!state.bingList.some((d) => d.idx === state.bingDay)) state.bingDay = 0;
    const cur = state.bingList.find((d) => d.idx === state.bingDay) || state.bingList[0];
    if (state.wallpaper === 'bing' && cur) state.wallpaperBing = cur.url;
  } catch {
    state.bingList = [];
  }
  bump();
}

/** 画廊里点一张：立刻换上去，但不动「跟随每日」这个意图本身 */
export async function pickBingDay(day?: BingDay | null): Promise<void> {
  if (!day || !day.url) return;
  state.wallpaperBing = day.url;
  state.bingDay = day.idx;
  /* v3.0.1 修：这里原来漏了 applyWallpaper('bing')，于是照片只写进 state 的
     wallpaperBing、wallpaper 还停在渐变上 —— 背景不换、模糊档位那行也一直藏着。
     老版本 newtab.js 的 pickBingDay 里有这一句。 */
  await applyWallpaper('bing');
  await storeSet('wallpaper', 'bing');
  await storeSet('bingDay', day.idx);
  toast(day.idx === 0 ? '已启用今天的必应壁纸' : `已切换到 ${bingDayLabel(day)} 的壁纸`);
}

export async function useTodayBing(): Promise<void> {
  if (!state.bingList || !state.bingList.length) { toast('还没有取到今天的壁纸'); return; }
  const today = state.bingList.find((d) => d.idx === 0) || state.bingList[0];
  await pickBingDay(today);
}
