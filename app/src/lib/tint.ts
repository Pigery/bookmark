/** 纸取色：拿必应壁纸那张照片，算出卡片那张「纸」该染什么色。
 *
 *  整段从老 newtab.js 第 167~405 行搬过来 —— 48px 缩略图取样、上沿 / 下沿的
 *  色相混合、明度与透明度的映射、以及三条回退（图片加载失败 / canvas 被污染 /
 *  壁纸太黑太亮）都逐行照抄，改一个数都会让纸的颜色走样。
 *
 *  只碰 --paper-warm / --paper-deep / --paper-solid / --paper / --paper-alpha
 *  这五个变量，绝不碰 --ink / --text / --accent：字和身份不跟着壁纸漂。
 *  storage 的读写：refreshPaperTint 自己存；restorePaperTint 由调用方先
 *  storeGet('paperTint', null) 再传进来（老版本 init() 就是这么写的）。 */

import { storeSet } from './chrome';
import { state } from './store';

const TINT_SIZE = 48;            // 取样用的缩略图边长
const TINT_S_REF = 0.55;         // s=0.55 就视为「很热闹的壁纸」，不再往上加
const TINT_S_MIN = 0.2;          // 灰壁纸的纸彩度（再低就雪盲）
const TINT_S_MAX = 0.5;          // 最彩的纸（再高就成彩色卡）
const TINT_A_MIN = 0.42;         // 渐层透明度下限
const TINT_A_MAX = 0.62;         // 渐层透明度上限
const TINT_L_FLOOR = 0.895;      // 纸明度下限：白纸染了色还是纸

type RGB = [number, number, number];

/** 取色的「软」形状：字段可以缺 —— 从 storage 读回来的旧记录可能残缺，
 *  老代码靠「缺字段就让比较全部落空」自己退掉，这里保留同一条路。 */
export interface PaperTintInput {
  h?: number | null;
  s?: number | null;
  l?: number | null;
  /** 整张的平均色：只有 analyzeThumb 的产出才有，restore 那条路上会缺 */
  r?: number | null;
  g?: number | null;
  b?: number | null;
  topLum?: number | null;
  botLum?: number | null;
  topRGB?: RGB | null;
  botRGB?: RGB | null;
}

/** 算出来的完整取色结果（analyzeThumb 产出，字段一定齐） */
export interface PaperTintInfo extends PaperTintInput {
  h: number;
  s: number;
  l: number;
  topLum: number;
  botLum: number;
  topRGB: RGB;
  botRGB: RGB;
}

/** 缩略图统计：整张 + 上下沿的平均色，外加推导出的 HSL */
interface ThumbStats extends PaperTintInfo {
  r: number;
  g: number;
  b: number;
}

/** storeSet('paperTint', …) 存进 storage 的那个形状（top / bot 是简写） */
interface SavedPaperTint {
  h?: number | null;
  s?: number | null;
  l?: number | null;
  top?: number | null;
  bot?: number | null;
  topRGB?: RGB | null;
  botRGB?: RGB | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hsl2rgb(h: number, s: number, l: number): RGB {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s <= 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(hn + 1 / 3) * 255, f(hn) * 255, f(hn - 1 / 3) * 255];
}

const rgbStr = (rgb: number[]) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255))
  .toString(16).padStart(2, '0')).join('');

const rgbaStr = (rgb: number[], a: number) => `rgba(${rgb.map((v) => Math.round(clamp(v, 0, 255))).join(', ')}, ${a.toFixed(3)})`;

/* #rrggbb + alpha → rgba() */
function rgbToRgba(hex: string, alpha: number): string {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* 从 RGBA 像素里算：整张平均色 + 上沿 / 下沿各自的平均色。
   取平均而不是取某几个点 —— 免得恰好点在太阳或黑水上 */
function analyzeThumb(data: ArrayLike<number>, size = TINT_SIZE): ThumbStats {
  const n = size || TINT_SIZE;
  const cnt = n * n;

  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < cnt; i += 1) {
    const p = i * 4;
    r += data[p]; g += data[p + 1]; b += data[p + 2];
  }
  r /= cnt; g /= cnt; b /= cnt;

  const band = Math.max(1, Math.round(n * 0.2));
  let topLum = 0; let botLum = 0;
  let tr = 0; let tg = 0; let tb = 0;
  let br = 0; let bg = 0; let bb = 0;
  let tn = 0;
  for (let y = 0; y < n; y += 1) {
    const isTop = y < band;
    const isBot = y >= n - band;
    if (!isTop && !isBot) continue;
    for (let x = 0; x < n; x += 1) {
      const p = (y * n + x) * 4;
      const lum = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
      if (isTop) { topLum += lum; tr += data[p]; tg += data[p + 1]; tb += data[p + 2]; }
      if (isBot) { botLum += lum; br += data[p]; bg += data[p + 1]; bb += data[p + 2]; }
      tn += 1;
    }
  }
  topLum /= tn; botLum /= tn;
  tr /= tn; tg /= tn; tb /= tn;
  br /= tn; bg /= tn; bb /= tn;

  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let s = 0;
  let h = 0;
  if (d > 0.0001) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r / 255) h = ((g - b) / 255) / d + (g < b ? 6 : 0);
    else if (mx === g / 255) h = ((b - r) / 255) / d + 2;
    else h = ((r - g) / 255) / d + 4;
    h *= 60;
  }

  return { r, g, b, h, s, l, topLum, botLum, topRGB: [tr, tg, tb], botRGB: [br, bg, bb] };
}

/* 纯灰没有色相，返回 null，别硬塞一个 */
function hueOf(rgb: RGB): number | null {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
  const mn = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
  const d = mx - mn;
  if (d < 0.0001) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  let h: number;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return h * 60;
}

/* 最短角差：350° 和 10° 只差 20°，不是 340° */
function blendHue(a: number | null | undefined, b: number | null | undefined, w: number): number | null {
  if (a == null) return b == null ? null : b;
  if (b == null) return a;
  const d = ((b - a + 540) % 360) - 180;
  return (((a + d * w) % 360) + 360) % 360;
}

/* 算要写进 body 的变量。返回 null 表示这张壁纸不适合取色
   （太黑 / 太亮 / 跨域读不到），交回 CSS 里写死的默认纸 */
function paperTintVars(info: PaperTintInput | null): Record<string, string> | null {
  if (!info) return null;
  // 缺字段时 Number(undefined) = NaN：后面每个比较都落空，和老代码一样退掉；
  // Number(null) = 0，也和老代码里 null 参与数值比较的结果一致
  const s = Number(info.s);
  const l = Number(info.l);
  const h = Number(info.h);
  if (!(l > 0.08 && l < 0.74)) return null;

  const hueTop = hueOf(info.topRGB || [128, 128, 128]);
  const hueBot = hueOf(info.botRGB || [128, 128, 128]);
  const hueMid = hueOf([Number(info.r), Number(info.g), Number(info.b)]);

  const warmH = blendHue(hueMid, hueTop, 0.65);
  const deepH = blendHue(hueMid, hueBot, 0.65);

  const grayish = s < 0.05;
  const sat = grayish ? 0 : clamp(s * 1.6 / TINT_S_REF, 0, 1);
  const cs = grayish ? 0 : TINT_S_MIN + (TINT_S_MAX - TINT_S_MIN) * sat;

  const topLum = info.topLum == null ? 0.5 : info.topLum;
  const botLum = info.botLum == null ? 0.5 : info.botLum;
  const warmL = clamp(0.966 - (1 - topLum) * 0.055 - sat * 0.035, TINT_L_FLOOR, 0.966);
  const deepL = clamp(0.936 - (1 - botLum) * 0.06 - sat * 0.03, TINT_L_FLOOR, 0.95);
  const de = Math.min(deepL, warmL - 0.012);

  const solidL = clamp(warmL - 0.004, TINT_L_FLOOR, 0.97);
  const hueW = grayish ? 0 : (warmH == null ? h : warmH);
  const hueD = grayish ? 0 : (deepH == null ? h : deepH);
  const hueS = grayish ? 0 : (hueMid == null ? h : hueMid);

  const warm = hsl2rgb(hueW, cs, warmL);
  const deep = hsl2rgb(hueD, cs, de);
  const solid = hsl2rgb(hueS, cs * 0.9, solidL);
  const alpha = TINT_A_MIN + (TINT_A_MAX - TINT_A_MIN) * sat;

  return {
    '--paper-warm': rgbaStr(warm, 0.62),
    '--paper-deep': rgbaStr(deep, 0.34),
    '--paper-solid': rgbStr(solid),
    '--paper': rgbToRgba(rgbStr(solid), alpha),
    '--paper-alpha': alpha.toFixed(3),
  };
}

const TINT_KEYS = ['--paper-warm', '--paper-deep', '--paper-solid', '--paper', '--paper-alpha'] as const;

/** 把取色结果写进 CSS 变量（老版本 paintPaperTint）。
 *  写的是 document.body 的内联变量 —— legacy.css 里那几条默认纸也在 :root 上，
 *  body 内联一层刚好盖住它、又不碰 :root。info 为 null 时把这几个变量删掉，
 *  纸就退回 CSS 里的默认值。 */
export function paintPaperTint(info: PaperTintInput | null): boolean {
  const vars = paperTintVars(info);
  const b = document.body;
  if (!b) return false;
  if (!vars) {
    TINT_KEYS.forEach((k) => b.style.removeProperty(k));
    return false;
  }
  TINT_KEYS.forEach((k) => b.style.setProperty(k, vars[k]));
  return true;
}

/* 取壁纸的像：缩到 48×48 读像素。跨域画到 canvas 会污染，
   读不出像素时返回 null，交给 paintPaperTint(null) 回默认纸 */
function sampleWallpaper(url?: string): Promise<ThumbStats | null> {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false;
    const finish = (v: ThumbStats | null): void => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), 4000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const w = TINT_SIZE;
        const h = TINT_SIZE;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        // 拿不到 2d 上下文就等于读不出像素（老代码里这时会抛，被下面的 catch 收走）
        if (!ctx) { finish(null); return; }
        // 4:3 居中裁切再画，和实际取景一致
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        let sw = nw;
        let sh = nh;
        if (nw / nh > 1.33) sw = nh * 1.33; else sh = nw / 1.33;
        ctx.drawImage(img, (nw - sw) / 2, (nh - sh) / 2, sw, sh, 0, 0, w, h);
        finish(analyzeThumb(ctx.getImageData(0, 0, w, h).data, w));
      } catch {
        finish(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); finish(null); };
    img.src = url;
  });
}

/** 上次算过的色先上纸，再异步重算一次 —— 避免每次闪一下白纸再变色。
 *  调用方：restorePaperTint(await storeGet('paperTint', null)) */
export function restorePaperTint(saved: unknown): void {
  const prev = saved && typeof saved === 'object' ? (saved as SavedPaperTint) : null;
  if (prev && prev.h != null) {
    const ok = paintPaperTint({
      h: prev.h, s: prev.s, l: prev.l,
      topLum: prev.top == null ? 0.5 : prev.top,
      botLum: prev.bot == null ? 0.5 : prev.bot,
      topRGB: prev.topRGB || [128, 128, 128],
      botRGB: prev.botRGB || [128, 128, 128],
    });
    if (!ok) paintPaperTint(null);
    return;
  }
  paintPaperTint(null);
}

/** 换壁纸 / 换模糊后重新取色（老版本 refreshPaperTint）。
 *  老版本这里只改写 CSS 变量、不调 render()，所以这里也不 bump()。 */
export async function refreshPaperTint(): Promise<void> {
  if (state.wallpaper !== 'bing' || !state.wallpaperBing) {
    paintPaperTint(null);
    await storeSet('paperTint', null);
    return;
  }
  const info = await sampleWallpaper(state.wallpaperBing);
  if (!info || !paintPaperTint(info)) {
    paintPaperTint(null);
    await storeSet('paperTint', null);
    return;
  }
  await storeSet('paperTint', {
    h: info.h, s: info.s, l: info.l,
    top: info.topLum, bot: info.botLum,
    topRGB: info.topRGB, botRGB: info.botRGB,
  });
}
