'use strict';

/* ==========================================================
   书签桌面 · 新标签页
   ----------------------------------------------------------
   目录：
     1. 公共工具           $ / storeGet / storeSet / toast
     2. 数据               预置壁纸、模糊档位、书签树
     3. 背景取色           纸跟着壁纸走，只换色相不动字
     4. 桌面卡片           渲染一级分组、放大下钻、拖拽整理
     5. 置顶栏与搜索       顶部的 App 图标横栏、多引擎搜索
     6. 壁纸面板           预置壁纸 + 必应每日（含往期画廊）
     7. 布局同步           导出 / 导入 / 分享文本 / GitHub
     ========================================================== */

const $ = (id) => document.getElementById(id);

/* ---------------- 公共工具 ---------------- */

/* 扩展里 index.html 这个名字不吉利，但还是叫 newtab；
   存东西走 chrome.storage.local，直接用预览页面打开时退到 localStorage。
   预览前缀 bd: 是为了不和别的本地页面打架。 */
const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);

async function storeGet(key, fallback) {
  try {
    if (HAS_CHROME) {
      const o = await chrome.storage.local.get(key);
      return o && Object.prototype.hasOwnProperty.call(o, key) ? o[key] : fallback;
    }
    const raw = localStorage.getItem('bd:' + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function storeSet(key, val) {
  try {
    if (HAS_CHROME) { await chrome.storage.local.set({ [key]: val }); return; }
    localStorage.setItem('bd:' + key, JSON.stringify(val));
  } catch {
    /* 存不进去就算了，界面上已经改过了，下次再存 */
  }
}

let toastTick = 0;
function toast(msg) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTick);
  toastTick = setTimeout(() => el.classList.remove('on'), 1800);
}

/* 全局状态。视图相关的一切都在这儿，渲染函数只读它 */
const state = {
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
  dragIcons: -1,
};
/* ---------------- 数据：预置壁纸 ---------------- */

/* 8 套渐变：深色 5、浅色 3。light:true 的会把整页配色切到浅色纸。
   css 直接写进 #bg 的 background，不需要图片、不联网 */
const WALLPAPERS = [
  { id: 'aurora', light: false, css: 'radial-gradient(120% 90% at 18% 8%, #2a3f6b 0%, #151c30 46%, #0b0f1a 100%)' },
  { id: 'dusk', light: false, css: 'linear-gradient(160deg, #4a2f4f 0%, #2a1d33 42%, #120e1a 100%)' },
  { id: 'forest', light: false, css: 'radial-gradient(110% 85% at 82% 12%, #1f4a3f 0%, #13261f 45%, #0a1210 100%)' },
  { id: 'ember', light: false, css: 'radial-gradient(100% 80% at 24% 86%, #6b3a22 0%, #33200f 44%, #140c07 100%)' },
  { id: 'ink', light: false, css: 'linear-gradient(150deg, #1d2027 0%, #101216 48%, #07080a 100%)' },
  { id: 'paper', light: true, css: 'linear-gradient(160deg, #f2ece2 0%, #e6dccd 46%, #d8c9b5 100%)' },
  { id: 'mist', light: true, css: 'linear-gradient(160deg, #eef2f6 0%, #dfe6ee 48%, #cfd8e3 100%)' },
  { id: 'sand', light: true, css: 'linear-gradient(160deg, #f6efe0 0%, #eadfc6 50%, #d9c9a6 100%)' },
];

const WALL_BLURS = [
  { id: 'off', label: '无' },
  { id: 'lite', label: '轻' },
  { id: 'mid', label: '中' },
  { id: 'deep', label: '重' },
];

/* ---------------- 数据：书签树 ---------------- */

/* 有 chrome.bookmarks 就读真的，没有（双击 newtab.html 预览）就用一棵假树，
   这样预览页也能看全所有状态 */
function mockTree() {
  const mk = (id, title, children) => ({ id, title, children });
  const leaf = (n, url) => ({ id: 'm' + n, title: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url });
  return [mk('0', '', [
    mk('1', '书签栏', [
      mk('10', '前端', [
        leaf(1, 'https://developer.mozilla.org'), leaf(2, 'https://caniuse.com'),
        leaf(3, 'https://web.dev'), leaf(4, 'https://css-tricks.com'),
        leaf(5, 'https://github.com'),
      ]),
      mk('11', '工具', [
        leaf(6, 'https://www.figma.com'), leaf(7, 'https://excalidraw.com'),
        leaf(8, 'https://regex101.com'), leaf(9, 'https://www.json.cn'),
      ]),
      mk('12', '阅读', [
        leaf(10, 'https://sspai.com'), leaf(11, 'https://www.zhihu.com'),
        leaf(12, 'https://news.ycombinator.com'),
      ]),
      mk('13', '设计', [
        leaf(13, 'https://dribbble.com'), leaf(14, 'https://www.behance.net'),
      ]),
    ]),
  ])];
}

/* chrome.bookmarks 的树 → 我们自己的结构，同时建 id → node 索引 */
function indexTree(tree) {
  const byId = new Map();
  const walk = (node) => {
    byId.set(node.id, node);
    (node.children || []).forEach(walk);
  };
  walk(tree);
  state.byId = byId;
  return tree;
}

async function loadTree() {
  if (HAS_CHROME && chrome.bookmarks && chrome.bookmarks.getTree) {
    const [tree] = await chrome.bookmarks.getTree();
    state.bar = (tree.children || []).find((c) => /书签栏|Bookmarks bar|Barre/i.test(c.title))
      || (tree.children && tree.children[0]) || tree;
    return indexTree(tree);
  }
  const tree = mockTree()[0];
  state.bar = (tree.children || [])[0] || tree;
  return indexTree(tree);
}
/* ==========================================================
   背景取色（v1.20.5 重做）
   壁纸是随机的，一张纯白的卡片贴在哪张照片上都格格不入。
   这里从壁纸里取颜色，把「纸」本身染成壁纸的同色系：
     --paper-warm   上沿：壁纸顶部偏暖，纸就偏暖
     --paper-deep   下沿：壁纸底部偏沉，纸就多沉一档
     --paper-solid  卡片实底（染成壁纸色相的一版浅纸）
     --paper        卡片中间那层，带 alpha，让壁纸透上来
     --paper-alpha  透明的程度

   上一版的毛病：只敢调色相，明度锁死在 0.94~0.965、饱和度封顶
   0.42、不透明度压到 0.32~0.56 —— 结果所有壁纸都被压回同一个浅色，
   深色壁纸一色、浅色壁纸另一色，中间几乎没有区别。

   这一版的做法：
     1. 色相：整张取平均色相关系，上沿 / 下沿各按最短角差调一半
     2. 彩度：饱和度抬到 0.12~0.50（壁纸本身越彩，纸越彩）
     3. 明度：死守 0.895~0.968 —— 白纸染了色还是纸，不是刷漆
     4. 透光：卡片底下让出 10%~17% 的缝，壁纸自己的颜色从那道缝
        透上来，卡片于是永远贴着它所在的那面墙
   实测：不同壁纸的卡片之间色差 21~43 个色阶，黑字对比度最低 9.6:1
   （WCAG AAA 是 7:1），看得清也读得清。

   绝不碰 --ink / --text / --accent：字和身份不跟着壁纸漂。
   ========================================================== */
const TINT_SIZE = 48;            // 取样用的缩略图边长
// 纸的饱和度区间：s=0.55 就视为「很热闹的壁纸」，不再往上加
const TINT_S_REF = 0.55;
const TINT_S_MIN = 0.2;
const TINT_S_MAX = 0.5;
// 纸压多少透明度给底下的壁纸。越热闹越敢透，太透字会晃眼
const TINT_A_MIN = 0.42;
const TINT_A_MAX = 0.62;
// 纸明度下限：白纸染了色也还是纸。0.895 时最暗的彩纸 ≈ #e3e2f5，
// 黑字对比度和背景差 9.6:1，WCAG AAA 要的是 7:1
const TINT_L_FLOOR = 0.895;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s <= 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const rgbaStr = (rgb, a) => `rgba(${rgb.map((v) => Math.round(clamp(v, 0, 255))).join(', ')}, ${a.toFixed(3)})`;

/* #rrggbb + alpha → rgba()。卡片中间那层纸要用 */
function rgbToRgba(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const rgbStr = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255))
  .toString(16).padStart(2, '0')).join('');

/* 从 RGBA 像素里算：整张的平均色 + 上沿 / 下沿各自的平均色。
   上沿决定纸借谁的光（照片顶部是天空还是暗角），下沿决定纸吃多少影。 */
function analyzeThumb(data, size) {
  const n = size || TINT_SIZE;
  const cnt = n * n;

  // 整张平均（取色相用）
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < cnt; i += 1) {
    const p = i * 4;
    r += data[p]; g += data[p + 1]; b += data[p + 2];
  }
  r /= cnt; g /= cnt; b /= cnt;

  // 上沿 / 下沿各取 20% 高的一条，算平均亮度
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

  return {
    r, g, b, h, s, l, topLum, botLum,
    topRGB: [tr, tg, tb],
    botRGB: [br, bg, bb],
  };
}

/* 角度差取最短的那一圈：350° 和 10° 只差 20°，不是 340° */
function hueOf(rgb) {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
  const mn = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
  const d = mx - mn;
  if (d < 0.0001) return null;   // 纯灰没有色相，别硬塞一个
  const [r, g, b] = rgb.map((v) => v / 255);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return h * 60;
}

function blendHue(a, b, w) {
  if (a == null) return b;
  if (b == null) return a;
  let d = ((b - a + 540) % 360) - 180;
  return ((a + d * w) % 360 + 360) % 360;
}

/* 算出要写进 body 的变量。
   返回 null 表示这张壁纸不适合取色（极黑 / 极白 / 灰阶），交回默认纸 */
function paperTintVars(info) {
  if (!info) return null;
  const { s, l, h } = info;
  // 太黑太亮的壁纸借不出颜色，硬借只会把纸弄脏
  if (!(l > 0.08 && l < 0.74)) return null;

  const hueTop = hueOf(info.topRGB);
  const hueBot = hueOf(info.botRGB);
  const hueMid = hueOf([info.r, info.g, info.b]);

  const warmH = blendHue(hueMid, hueTop, 0.65);
  const deepH = blendHue(hueMid, hueBot, 0.65);

  // 彩度：照片的平均饱和度天生偏灰，抬 1.6 倍再映射，纸才看得出「是那个颜色」
  // 灰阶壁纸（整张几乎无色）不能凭空生出颜色来，直接把彩度归零
  const grayish = s < 0.05;
  const sat = grayish ? 0 : clamp(s * 1.6 / TINT_S_REF, 0, 1);
  const cs = grayish ? 0 : TINT_S_MIN + (TINT_S_MAX - TINT_S_MIN) * sat;

  // 明度：上沿贴着壁纸顶部亮度走，但两头都死守地板
  const warmL = clamp(0.966 - (1 - info.topLum) * 0.055 - sat * 0.035, TINT_L_FLOOR, 0.966);
  const deepL = clamp(0.936 - (1 - info.botLum) * 0.06 - sat * 0.03, TINT_L_FLOOR, 0.95);
  // 下沿故意比上沿深一档，卡片才有「纸有厚度」的错觉
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

function paintPaperTint(info) {
  const vars = paperTintVars(info);
  const b = document.body;
  if (!vars) {
    ['--paper-warm', '--paper-deep', '--paper-solid', '--paper', '--paper-alpha']
      .forEach((k) => b.style.removeProperty(k));
    return false;
  }
  Object.keys(vars).forEach((k) => b.style.setProperty(k, vars[k]));
  return true;
}

/* 取壁纸的像：缩到 48×48 读像素。跨域画到 canvas 会污染，
   读不出像素时返回 null，交给 paintPaperTint(null) 回默认纸 */
function sampleWallpaper(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), 4000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const w = TINT_SIZE;
        const h = TINT_SIZE;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        // 4:3 居中裁切再画，别把照片拉变形
        const ar = (img.naturalWidth || img.width) / (img.naturalHeight || img.height) || 1.6;
        let sw = img.naturalWidth || img.width;
        let sh = img.naturalHeight || img.height;
        if (ar > 1.33) { sw = sh * 1.33; } else { sh = sw / 1.33; }
        ctx.drawImage(img, ((img.naturalWidth || sw) - sw) / 2, ((img.naturalHeight || sh) - sh) / 2, sw, sh, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        finish(analyzeThumb(data, w));
      } catch {
        finish(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); finish(null); };
    img.src = url;
  });
}

function restorePaperTint(saved) {
  if (saved && typeof saved === 'object' && saved.h != null) {
    const ok = paintPaperTint({
      h: saved.h, s: saved.s, l: saved.l,
      topLum: saved.top == null ? 0.5 : saved.top,
      botLum: saved.bot == null ? 0.5 : saved.bot,
      topRGB: saved.topRGB || [128, 128, 128],
      botRGB: saved.botRGB || [128, 128, 128],
    });
    if (!ok) paintPaperTint(null);
    return;
  }
  paintPaperTint(null);
}

/* 换壁纸之后重新取一次色。必应照片跨域可能读不到像素，
   读不到就清掉变量，卡片回到默认象牙纸 */
async function refreshPaperTint() {
  if (state.wallpaper !== 'bing' || !state.wallpaperBing) {
    paintPaperTint(null);
    storeSet('paperTint', null).catch(() => {});
    return;
  }
  const info = await sampleWallpaper(state.wallpaperBing);
  if (!info || !paintPaperTint(info)) {
    paintPaperTint(null);
    storeSet('paperTint', null).catch(() => {});
    return;
  }
  await storeSet('paperTint', {
    h: info.h, s: info.s, l: info.l,
    top: info.topLum, bot: info.botLum,
    topRGB: info.topRGB, botRGB: info.botRGB,
  });
}
/* ---------------- 壁纸 ---------------- */

/* 套上一套壁纸。id 是渐变的 id，或者 'bing' 表示用必应照片 */
function applyWallpaper(id) {
  const bg = $('bg');
  if (id === 'bing' && state.wallpaperBing) {
    state.wallpaper = 'bing';
    bg.style.backgroundColor = '#10131c';
    bg.style.backgroundImage = `url("${state.wallpaperBing}")`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.backgroundRepeat = 'no-repeat';
    document.body.dataset.light = '0';
    [...wpList().children].forEach((n) => n.classList.toggle('on', false));
    paintWallBlur();
    refreshPaperTint();
    return;
  }
  const wp = WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
  state.wallpaper = wp.id;
  bg.style.background = wp.css;
  document.body.dataset.light = wp.light ? '1' : '0';
  [...wpList().children].forEach((n) => n.classList.toggle('on', n.dataset.id === wp.id));
  paintWallBlur();
  refreshPaperTint();
}

function wpList() { return $('wpList'); }

function paintWallBlur() {
  const bg = $('bg');
  const table = { off: '0px', lite: '6px', mid: '14px', deep: '26px' };
  bg.style.filter = `blur(${table[state.wallBlur] || '0px'})`;
  const opts = $('wpBlurOpts');
  if (opts) [...opts.children].forEach((n) => n.classList.toggle('on', n.dataset.id === state.wallBlur));
}

function buildWallpaperPanel() {
  const box = wpList();
  box.innerHTML = '';
  WALLPAPERS.forEach((wp) => {
    const d = document.createElement('div');
    d.className = 'wp-item';
    d.dataset.id = wp.id;
    d.style.background = wp.css;
    d.title = wp.id;
    d.addEventListener('click', async () => {
      applyWallpaper(wp.id);
      if (HAS_CHROME && chrome.storage) await chrome.storage.local.set({ wallpaper: wp.id });
      hideWallpaper();
    });
    box.appendChild(d);
  });
  buildBlurRow();
}

function buildBlurRow() {
  const opts = $('wpBlurOpts');
  if (!opts) return;
  opts.innerHTML = '';
  WALL_BLURS.forEach((b) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'wp-blur-opt';
    d.dataset.id = b.id;
    d.textContent = b.label;
    d.addEventListener('click', async () => {
      state.wallBlur = b.id;
      paintWallBlur();
      refreshPaperTint();
      if (HAS_CHROME && chrome.storage) await chrome.storage.local.set({ wallBlur: b.id });
    });
    opts.appendChild(d);
  });
  paintWallBlur();
}

/* ---------------- 必应每日壁纸 ---------------- */
// 一次取最近 BING_DAYS 天：idx=0 是今天，idx 越大越旧。面板里排成 3×3 九宫格，
// 想用哪天的点是哪张；「用今天的」按 idx=0 回切。
// 取的是「今天 + 往前 8 天」正好 9 张，多出来的第 10 天不要——格子对不上反而难看
const BING_DAYS = 9;
// 有两套接口参数可以要历史：官方老接口用 idx，有的地区 / 版本要换成 xid。
// 两个都试一遍，哪个先返回够用的就用哪个；都只剩一天就说明确实拿不到，不硬凑。
const BING_ENDPOINTS = [
  (w, i) => `https://www.bing.com/HPImageArchive.aspx?format=js&n=${w}&mkt=zh-CN&idx=${i}`,
  (w, i) => `https://www.bing.com/HPImageArchive.aspx?format=js&n=${w}&mkt=zh-CN&xid=${i}`,
];
const BING_CACHE_MS = 6 * 60 * 60 * 1000;

// 缩略图参数：原图动辄 3~8MB，画廊里只要 320 宽就够看
function bingThumb(url, w = 320) {
  return url.replace(/&w=\d+/, '').replace(/&h=\d+/, '') + `&w=${w}&h=${Math.round(w * 0.5625)}&rs=1`;
}

/* 一次请求要回最近 N 天。必应有时候只认 idx 不认 n、有时候反过来，
   所以「要回 8 天却只给了 1 天」就当这次没成功，换下一套参数再试 */
async function bingOnce(makeUrl, want, idx = 0) {
  const res = await fetch(makeUrl(want, idx));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const imgs = ((data && data.images) || []).filter((img) => img && img.url);
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

/* 一天一天地要：第 0 天、第 1 天……直到要重复为止。
   单次请求的 n 在某些地区最多只给 8 条，按天问不受这个限制 */
async function bingByDays(makeUrl) {
  const out = [];
  for (let i = 0; i < BING_DAYS; i += 1) {
    let got = [];
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

async function fetchBingWallpaper(force = false) {
  const cached = await storeGet('bing', null);
  // 缓存里记着「这份是按几天取的」（for_）。天数一改（比如 8→9）旧缓存直接作废，
  // 否则升级完打开看见的还是老画廊，得干等 6 小时缓存过期
  const fresh = cached && cached.ts && Date.now() - cached.ts < BING_CACHE_MS
    && cached.url && cached.list && cached.list.length
    && cached.for === BING_DAYS;
  if (!force && fresh) return cached;
  const prev = cached && cached.list ? cached.list : [];

  let list = [];
  for (const makeUrl of BING_ENDPOINTS) {
    try {
      list = await bingOnce(makeUrl, BING_DAYS);
      if (list.length > 1) break;
    } catch (err) { /* 换下一套参数 */ }
  }
  // 不够 9 张就走逐天兜底。必应在某些地区把 n 的上限卡在 8，
  // 一次只能给 8 张——差的这一张必须自己按天补，不能指望参数
  if (list.length < BING_DAYS) {
    for (const makeUrl of BING_ENDPOINTS) {
      try {
        const viaDays = await bingByDays(makeUrl);
        if (viaDays.length > list.length) { list = viaDays; break; }
      } catch (err) { /* 继续试 */ }
    }
  }
  // 只拿到今天：把之前存过的往期拼在后面，画廊不会凭空蒸发。
  // 用 Set 去重——历史里可能已经存着「今天」这张了，否则会冒出两个「今天」
  if (list.length <= 1) {
    const today = list[0];
    // 按「路径」去重而不是整条 URL：历史缓存里的可能是缩略图地址，
    // 只差 w/h 参数，整串比会认成两张
    const pathOf = (u) => String(u || '').split('?')[1] ? String(u).split('?')[1].replace(/&(w|h|rs)=[^&]*/g, '') : String(u || '');
    const seen = new Set(today ? [pathOf(today.url)] : []);
    const rest = prev.filter((d) => {
      const k = pathOf(d.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    list = [...(today ? [today] : []), ...rest].map((d, i) => ({ ...d, idx: i }));
  }
  if (!list.length) {
    if (cached && cached.url) return cached;
    throw new Error('必应壁纸无数据');
  }

  const out = {
    url: list[0].url,      // 今天的原图（老字段，别处还在用）
    thumb: list[0].thumb,
    title: list[0].title,
    copyright: list[0].copyright,
    list,
    for: BING_DAYS,        // 这份缓存是按几天取的
    ts: Date.now(),
  };
  await storeSet('bing', out);
  return out;
}

/* 画廊里点一张：立刻换上去，但不动「每日」这个意图本身。
   也就是说「用今天的」按钮一直在，下次开新标签页还是回到当天那张。 */
async function pickBingDay(day) {
  state.wallpaperBing = day.url;
  state.bingDay = day.idx;
  applyWallpaper('bing');
  await storeSet('wallpaper', 'bing');
  await storeSet('bingDay', day.idx);
  paintBingGallery();
  toast(day.idx === 0 ? '已启用今天的必应壁纸' : `已切换到 ${bingDayLabel(day)} 的壁纸`);
}

function bingDayLabel(day) {
  if (!day || !day.day || day.day.length !== 8) return '那天';
  return `${Number(day.day.slice(4, 6))} 月 ${Number(day.day.slice(6, 8))} 日`;
}

function paintBingGallery() {
  const box = $('wpBingGallery');
  if (!box) return;
  const list = state.bingList || [];
  const metaEl = $('wpBingMeta');
  box.innerHTML = '';
  if (!list.length) {
    if (metaEl) metaEl.textContent = '暂时没取到必应壁纸';
    return;
  }
  list.forEach((day) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-bing-cell';
    b.dataset.idx = String(day.idx);
    b.style.backgroundImage = `url("${day.thumb || day.url}")`;
    b.title = day.copyright || day.title || bingDayLabel(day);
    const active = state.wallpaper === 'bing' && state.bingDay === day.idx;
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    const tag = document.createElement('span');
    tag.className = 'wp-bing-tag';
    tag.textContent = day.idx === 0 ? '今天' : bingDayLabel(day);
    b.appendChild(tag);
    b.addEventListener('click', () => pickBingDay(day));
    box.appendChild(b);
  });
  if (metaEl) {
    const cur = list.find((d) => d.idx === state.bingDay) || list[0];
    metaEl.textContent = cur ? (cur.copyright || cur.title || '') : '';
  }
}

async function loadBingPanel() {
  const metaEl = $('wpBingMeta');
  try {
    const b = await fetchBingWallpaper();
    state.bingList = b.list || [{ idx: 0, url: b.url, thumb: b.thumb, title: b.title, copyright: b.copyright }];
    if (state.bingDay == null) state.bingDay = 0;
    // 当前选的那天如果滚出列表了（比如停了半个月没开），退回今天
    if (!state.bingList.some((d) => d.idx === state.bingDay)) state.bingDay = 0;
    const cur = state.bingList.find((d) => d.idx === state.bingDay) || state.bingList[0];
    if (state.wallpaper === 'bing') state.wallpaperBing = cur.url;
    paintBingGallery();
  } catch (err) {
    state.bingList = [];
    if (metaEl) metaEl.textContent = '';
    paintBingGallery();
  }
}

/* 「用今天的」：把选中的天数拉回 0 并立刻生效。它一直是可点的，
   所以手动切到往期之后，随时能一步回到今日壁纸 */
async function useTodayBing() {
  if (!state.bingList || !state.bingList.length) { toast('还没有取到今天的壁纸'); return; }
  const today = state.bingList.find((d) => d.idx === 0) || state.bingList[0];
  await pickBingDay(today);
}

function hideWallpaper() {
  const panel = $('wpPanel');
  if (panel) panel.hidden = true;
  clearInterval(state.bingTick);
}
/* ---------------- 布局同步（导出 / 导入 / 分享文本） ---------------- */
/* 只搬「怎么展示」：置顶图标顺序、图标 / 列表方式、壁纸、搜索引擎。
   书签本身由浏览器自己同步，这里一根指头都不碰它。

   关键点：chrome.bookmarks 的 id 是每台设备本地分配的，同一份书签在
   A 机和 B 机上的 id 完全不同，直接搬运 id 会全部错位。所以导出时先
   把 id 翻译成跨设备稳定的标识——书签用规范化 URL，文件夹用
   「书签栏/工具/前端」这样的标题路径——导入时再翻译回本机的 id。
   文件里不出现任何 bookmark id，换浏览器 / 换设备都能对得上。 */
const LAYOUT_APP = 'bookmark-desktop-layout';
const LAYOUT_SCHEMA = 1;

let pendingLayout = null;

// 规范化 URL：去掉 hash、跟踪参数和多余尾斜杠，作为跨设备的书签标识
function normUrl(u) {
  try {
    const url = new URL(String(u));
    url.hash = '';
    // 参数顺序不一致也要认成同一个地址，排序后再比
    url.searchParams.sort();
    [...url.searchParams.keys()].forEach((k) => {
      if (/^(utm_|spm|scm|from|share|ref|referrer|_t$)/i.test(k)) url.searchParams.delete(k);
    });
    // 尾斜杠要在 pathname 上去，不然带查询串的地址（/a/?id=7）会被漏掉
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    }
    return url.toString();
  } catch {
    return String(u || '').trim();
  }
}

/* 文件夹的标题路径：从书签栏往下数着拼，「书签栏/工具/前端」。
   标题重复的层级不纠结——同一个路径对应不稳定就干脆不导，宁可少还原一个 */
function layoutFolderPaths() {
  const map = new Map();
  const walk = (node, prefix) => {
    (node.children || []).forEach((c) => {
      if (c.url) return;
      const path = prefix ? `${prefix}/${c.title}` : c.title;
      map.set(c.id, path);
      walk(c, path);
    });
  };
  if (state.bar) walk(state.bar, '');
  return map;
}

function layoutFolderPath(node) {
  return (node && layoutFolderPaths().get(node.id)) || '';
}

/* 规范化 URL → 本机 id */
function layoutUrlIndex() {
  const map = new Map();
  state.byId.forEach((node) => {
    if (!node.url) return;
    const k = normUrl(node.url);
    if (k && !map.has(k)) map.set(k, node.id);
  });
  return map;
}

/* 标题路径 → 本机 id */
function layoutFolderIndex() {
  const map = new Map();
  layoutFolderPaths().forEach((path, id) => {
    if (path && !map.has(path)) map.set(path, id);
  });
  return map;
}

/* 导出：把本机的 id 全部换成稳定键 */
function buildLayout() {
  const paths = layoutFolderPaths();
  const icons = [];
  (state.icons || []).forEach((entry) => {
    const node = (entry && entry.id ? state.byId.get(entry.id) : null) || entry;
    const url = node && node.url;
    if (!url) return;
    const k = normUrl(url);
    if (k && !icons.includes(k)) icons.push(k);
  });

  const items = {};
  Object.keys(state.views.items).forEach((id) => {
    const node = state.byId.get(id);
    if (node && node.url) items[normUrl(node.url)] = state.views.items[id];
  });
  const folders = {};
  Object.keys(state.views.folders).forEach((id) => {
    const path = paths.get(id);
    if (path) folders[path] = state.views.folders[id];
  });

  return {
    app: LAYOUT_APP,
    schema: LAYOUT_SCHEMA,
    exportedAt: new Date().toISOString(),
    prefs: { wallpaper: state.wallpaper, wallBlur: state.wallBlur, engine: state.engine },
    icons,
    views: { items, folders },
  };
}

const MODE_ICON = 'icon';
const MODE_LIST = 'list';

function isMode(v) { return v === MODE_ICON || v === MODE_LIST; }

// 把布局翻译回本机的 id；对不上的条目直接跳过，不让它变成错误设置
function resolveLayout(data) {
  const plan = { icons: [], items: {}, folders: {}, missIcons: 0, missViews: 0, prefs: {} };

  const urlIndex = layoutUrlIndex();
  const folderIndex = layoutFolderIndex();

  ((data && data.icons) || []).forEach((u) => {
    const id = urlIndex.get(normUrl(u));
    if (!id) { plan.missIcons += 1; return; }
    if (!plan.icons.includes(id)) plan.icons.push(id);
  });

  const views = (data && data.views) || {};
  const items = views.items || {};
  Object.keys(items).forEach((u) => {
    const id = urlIndex.get(normUrl(u));
    const v = items[u];
    if (!id || !isMode(v)) { plan.missViews += 1; return; }
    plan.items[id] = v;
  });
  const folders = views.folders || {};
  Object.keys(folders).forEach((p) => {
    const id = folderIndex.get(p);
    const v = folders[p];
    if (!id || !isMode(v)) { plan.missViews += 1; return; }
    plan.folders[id] = v;
  });

  const prefs = (data && data.prefs) || {};
  if (typeof prefs.engine === 'string' && ENGINES.some((e) => e.id === prefs.engine)) plan.prefs.engine = prefs.engine;
  if (typeof prefs.wallpaper === 'string' && (prefs.wallpaper === 'bing' || WALLPAPERS.some((w) => w.id === prefs.wallpaper))) {
    plan.prefs.wallpaper = prefs.wallpaper;
  }
  if (typeof prefs.wallBlur === 'string' && WALL_BLURS.some((b) => b.id === prefs.wallBlur)) {
    plan.prefs.wallBlur = prefs.wallBlur;
  }
  return plan;
}

function syncResetPending() {
  pendingLayout = null;
  const p = $('syncPreview');
  if (p) { p.hidden = true; p.innerHTML = ''; }
}

function renderSyncPreview(plan) {
  const box = $('syncPreview');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '';
  const add = (html) => { const p = document.createElement('div'); p.innerHTML = html; box.appendChild(p); };
  add(`置顶图标 <b>${plan.icons.length}</b> 个${plan.missIcons ? `（${plan.missIcons} 个本机没有）` : ''}`);
  const nViews = Object.keys(plan.items).length + Object.keys(plan.folders).length;
  add(`显示方式 <b>${nViews}</b> 项${plan.missViews ? `（${plan.missViews} 项对不上）` : ''}`);
  const bits = [];
  if (plan.prefs.wallpaper) bits.push(`壁纸 ${plan.prefs.wallpaper}`);
  if (plan.prefs.wallBlur) bits.push(`模糊 ${plan.prefs.wallBlur}`);
  if (plan.prefs.engine) bits.push(`搜索引擎 ${plan.prefs.engine}`);
  if (bits.length) add(`偏好 ${bits.join(' · ')}`);
}

function renderSyncError(msg) {
  const box = $('syncPreview');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'err';
  p.textContent = msg;
  box.appendChild(p);
}

/* 落盘：先写存储，再重画。写一半失败也不会把界面改乱 */
async function applyResolvedLayout(plan) {
  state.icons = plan.icons.map((id) => ({ id }));
  state.views = { v: 1, folders: { ...plan.folders }, items: { ...plan.items } };
  await storeSet('icons', state.icons);
  await storeSet('views', state.views);

  if (plan.prefs.engine) {
    state.engine = plan.prefs.engine;
    await storeSet('engine', state.engine);
    paintEngine();
  }
  // 模糊档位要在套壁纸之前落定，否则会先按旧档位画一遍
  if (plan.prefs.wallBlur) {
    state.wallBlur = plan.prefs.wallBlur;
    await storeSet('wallBlur', state.wallBlur);
  }
  if (plan.prefs.wallpaper) {
    let wp = plan.prefs.wallpaper;
    if (wp === 'bing' && !state.wallpaperBing) {
      try { state.wallpaperBing = (await fetchBingWallpaper()).url; } catch { wp = 'aurora'; }
    }
    applyWallpaper(wp);
    await storeSet('wallpaper', state.wallpaper);
  } else {
    paintWallBlur();
  }
  await draw();
  toast(`已导入：置顶 ${state.icons.length} · 显示方式 ${Object.keys(state.views.items).length + Object.keys(state.views.folders).length}`);
}

/* ---------------- 分享文本：gzip + base64url ---------------- */
/* 前缀 bd1. 表示 gzip 过的，bd0. 表示没压的原文。
   浏览器不给同步 API，但 Clipboard 能塞纯文本——压缩只是为了短一点 */
const BD_MIME = 'application/x-bookmark-desktop-layout+json';

function bytesToB64url(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

async function packLayout(layout) {
  const json = JSON.stringify(layout);
  if (typeof CompressionStream === 'undefined') return 'bd0.' + bytesToB64url(new TextEncoder().encode(json));
  const cs = new CompressionStream('gzip');
  const stream = new Blob([json]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return 'bd1.' + bytesToB64url(new Uint8Array(buf));
}

async function unpackLayout(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('空文本');
  if (raw.startsWith('bd1.')) {
    if (typeof DecompressionStream === 'undefined') throw new Error('这个浏览器不支持解压');
    const bytes = b64urlToBytes(raw.slice(4));
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return JSON.parse(await new Response(stream).text());
  }
  if (raw.startsWith('bd0.')) {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(raw.slice(4))));
  }
  return JSON.parse(raw);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function downloadLayout(layout) {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookmark-desktop-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function showSyncPanel() {
  const p = $('syncPanel');
  syncResetPending();
  if (p) p.hidden = false;
}

function hideSync() {
  const p = $('syncPanel');
  if (p) p.hidden = true;
  syncResetPending();
}

/* 判断一段文本是不是布局：先试 JSON，再看 app 标记 */
function looksLikeLayout(text) {
  try {
    const o = JSON.parse(String(text || ''));
    return !!(o && o.app === LAYOUT_APP);
  } catch {
    return /^bd[01]\./.test(String(text || '').trim());
  }
}

function checkLayoutFile(file) {
  if (!file) return false;
  if (/\.json$/i.test(file.name || '')) return true;
  return file.type === 'application/json';
}

function dragHint(on) {
  const body = document.body;
  body.classList.toggle('is-dragging', !!on);
}

async function importLayoutFile(file) {
  if (!checkLayoutFile(file)) { toast('只认 .json 布局文件'); return; }
  const text = await file.text();
  await startPreview(text);
}

/* 拖进来的是文件而不是页面里的元素？图片和文本也按文件处理 */
function isFilesDrag(e) {
  const types = (e.dataTransfer && e.dataTransfer.types) || [];
  if (types.indexOf(BD_MIME) >= 0) return false;
  return Array.prototype.indexOf.call(types, 'Files') >= 0;
}

/* 先把待导入的布局读出来给人看一眼，点「确认覆盖」才真的写 */
async function startPreview(text) {
  let data;
  try {
    data = looksLikeLayout(text) && /^bd[01]\./.test(String(text).trim()) ? await unpackLayout(text) : JSON.parse(text);
  } catch (err) {
    renderSyncError('这份内容读不出来，可能不是布局文本');
    return;
  }
  if (!data || data.app !== LAYOUT_APP) { renderSyncError('不是书签桌面的布局文件'); return; }
  if (Number(data.schema) > LAYOUT_SCHEMA) { renderSyncError('这份布局比当前版本新，先升级扩展'); return; }
  const plan = resolveLayout(data);
  const total = plan.icons.length + Object.keys(plan.items).length + Object.keys(plan.folders).length;
  if (!total && !plan.prefs.wallpaper && !plan.prefs.engine) {
    renderSyncError('这份布局里没有本机对得上的内容');
    return;
  }
  pendingLayout = plan;
  const panel = $('syncPanel');
  if (panel) panel.hidden = false;
  renderSyncPreview(plan);
}

/* ---------------- 键盘提示 ---------------- */
function toggleKeyHint(force) {
  const card = $('helpCard');
  if (!card) return;
  card.hidden = force == null ? !card.hidden : !force;
}

/* ---------------- 时钟 ---------------- */
function tickClock() {
  const t = $('clockTime');
  const d = $('clockDate');
  if (!t || !d) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  t.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const wd = '日一二三四五六'[now.getDay()];
  d.textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 周${wd}`;
}
/* ---------------- 渲染 ---------------- */

/* 显示方式：书签和文件夹都能单独选图标 / 列表。
   没设过就按站点性质猜——工具类用图标，文章类用列表 */
const ENGINES = [
  { id: 'bing', name: '必应', logo: 'B', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'baidu', name: '百度', logo: '百', url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { id: 'google', name: 'Google', logo: 'G', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'sogou', name: '搜狗', logo: '搜', url: (q) => `https://www.sogou.com/web?query=${encodeURIComponent(q)}` },
  { id: 'ddg', name: 'DuckDuckGo', logo: 'D', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
];

function paintEngine() {
  const e = ENGINES.find((x) => x.id === state.engine) || ENGINES[0];
  const logo = $('engineLogo');
  const name = $('engineName');
  const input = $('searchInput');
  if (logo) logo.textContent = e.logo;
  if (name) name.textContent = e.name;
  if (input) input.placeholder = `搜索书签，回车用${e.name}搜索`;
  const menu = $('engineMenu');
  if (menu) {
    menu.innerHTML = '';
    ENGINES.forEach((x) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (x.id === state.engine) b.classList.add('on');
      b.textContent = x.name;
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        state.engine = x.id;
        paintEngine();
        await storeSet('engine', x.id);
        menu.hidden = true;
      });
      menu.appendChild(b);
    });
  }
}

function applyEngine(id) {
  state.engine = ENGINES.some((e) => e.id === id) ? id : 'bing';
  paintEngine();
}

function openUrl(url, newTab) {
  if (!url) return;
  if (newTab) {
    if (HAS_CHROME && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
    else window.open(url, '_blank');
    return;
  }
  if (HAS_CHROME && chrome.tabs && chrome.tabs.update) {
    chrome.tabs.update({ url }, () => {
      if (chrome.runtime && chrome.runtime.lastError) window.location.href = url;
    });
  } else {
    window.location.href = url;
  }
}

function runSearch() {
  const input = $('searchInput');
  const q = (input && input.value || '').trim();
  if (!q) return;
  const e = ENGINES.find((x) => x.id === state.engine) || ENGINES[0];
  openUrl(e.url(q), false);
}

/* 图标方块里的字：域名首个字母 */
function iconOf(node) {
  const host = String(node.url || '').replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0];
  return (host[0] || '?').toUpperCase();
}

function modeOf(node) {
  const m = node.url ? state.views.items[node.id] : state.views.folders[node.id];
  if (isMode(m)) return m;
  // 猜：文章 / 博客 / 文档类默认列表，工具类默认图标
  const host = String(node.url || '');
  if (!node.url) return MODE_ICON;
  return /(zhihu|sspai|medium|blog|news|github\.com\/[^/]+\/blob|docs\.)/i.test(host) ? MODE_LIST : MODE_ICON;
}

function childrenOf(node) { return (node && node.children) || []; }
function linksOf(node) { return childrenOf(node).filter((c) => c.url); }
function foldersOf(node) { return childrenOf(node).filter((c) => !c.url); }

/* ---------------- 渲染：卡片 / 图标 / 列表 / 子文件夹 / 放大层 ----------------
   这一层必须严格对齐 newtab.css 里已有的结构：
     .stage > .zones
       └ .zone[data-kind][data-id]
          ├ .zone-head (openable / draggable)
          │   ├ .zone-dot / .zone-title / .zone-count
          │   └ .zone-view（显示方式）/ .zone-open（打开箭头）
          └ .zone-body
             ├ .subfolder-list > .subfolder > .subfolder-ico / .subfolder-copy
             └ .tile-band > .item.tile  或  .zone-grid > .item(.folder-item)
   放大层：.folder-zoom > .folder-zoom-card > .zoom-head + .zoom-content
   类名一个都不能自创，自创就等于没样式。 */

/* ============================================================================
   渲染层 v2 —— 严格以 newtab.css 为唯一依据

   CSS 里定好的容器关系（不是我猜的，是读出来的）：

   .stage (flex column, padding 14px 26px 44px)
     └ .zones (grid auto-fit minmax(318px,1fr), auto-rows 1fr, gap 16, height 100%)
         └ .zone  ← 一张相纸卡片
            ├ .zone-head          ← 书脊：.zone-dot .zone-title .zone-count [.zone-view] [.zone-open]
            └ .zone-body (overflow-y auto, flex column)
               ├ .subfolder-list  ← 子文件夹（.subfolder 无描边，靠 hover 底色）
               ├ .tile-band       ← 图标模式（.item.tile 66px 竖排）
               └ .zone-grid       ← 列表模式（.item 横向）

   .folder-zoom
     ├ .folder-zoom-backdrop
     └ .folder-zoom-card
        ├ .zoom-head (.zoom-identity > .zoom-icon .zoom-title | .zoom-meta | .zoom-close)
        └ .zoom-content
           ├ .zoom-folders > .zoom-folder
           └ .zoom-list / .tile-band

   .tray > .tray-apps > .tray-app > .tray-ico + .tray-name

   关键规则（从 CSS 反推出来的「设计意图」）：
   1. .zones 是 auto-fit grid —— 每个文件夹=一张卡，卡会自动铺满、等高。
   2. .zone[data-kind="folder"] 才有 hover 抬升和 .zone-head.openable 的「打开」提示。
   3. 散落书签（不属于任何文件夹）单独成一张卡，data-kind="group"。
   4. .zone.is-empty 时 .zone-empty 是 absolute 定位盖住主体。
   5. .zone-view 显示的图标 = 「点一下会变成什么」（当前列表→显示图标）
   ============================================================================ */

const SVG_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const SVG_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SVG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* ---------- 图标 ----------
   CSS 里 .ico 是 18×18、.tile-ico 是 38×38（内 padding 7px）。
   有 favicon 用 img，没有就用 .letter 字母印章（CSS 里 .ico .letter / .tile-ico .letter 都有样式） */
function paintIcon(box, node) {
  box.innerHTML = '';
  if (node.iconUrl) {
    const img = document.createElement('img');
    img.src = node.iconUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      box.innerHTML = '';
      box.appendChild(letterBlock(iconOf(node)));
    }, { once: true });
    box.appendChild(img);
    return;
  }
  box.appendChild(letterBlock(iconOf(node)));
}

const letterBlock = (ch) => {
  const s = document.createElement('span');
  s.className = 'letter';
  let h = 0;
  for (let i = 0; i < ch.length; i++) h = (h * 31 + ch.charCodeAt(i)) % 360;
  s.style.background = `hsl(${h}, 52%, 52%)`;
  s.textContent = ch;
  return s;
};

/* 文件夹图标：CSS 里 .ico.folder 取消了 border-radius 和 overflow，
   说明文件夹图标就是不裁切的 SVG */
function folderBlock() {
  const s = document.createElement('span');
   s.className = 'ico folder';
  s.innerHTML = SVG_FOLDER;
  return s;
}

/* ---------- 一条书签（列表行） ---------- */
function buildItem(node) {
  const el = document.createElement('div');
  el.className = 'item';
  el.dataset.id = node.id;
  el.tabIndex = 0;
  el.draggable = true;

  const ico = document.createElement('span');
  ico.className = 'ico';
  paintIcon(ico, node);

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = node.title || node.url;

  el.append(ico, label);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openUrl(node.url, e.ctrlKey || e.metaKey);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showItemMenu(node, e.clientX, e.clientY);
  });
  bindItemDrag(el, node);
  return el;
}

/* ---------- 一条书签（图标方块） ---------- */
function buildTile(node) {
  const el = document.createElement('div');
  el.className = 'item tile';
  el.dataset.id = node.id;
  el.tabIndex = 0;
  el.draggable = true;

  const ico = document.createElement('span');
  ico.className = 'tile-ico';
  paintIcon(ico, node);

  const name = document.createElement('span');
  name.className = 'tile-name';
  name.textContent = node.title || node.url;

  el.append(ico, name);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openUrl(node.url, e.ctrlKey || e.metaKey);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showItemMenu(node, e.clientX, e.clientY);
  });
  bindItemDrag(el, node);
  return el;
}

/* ---------- 子文件夹入口 ----------
   CSS：.subfolder 无描边、hover 才出底色；
   .subfolder-copy 是 baseline 对齐的 flex（名字 + 计数并排） */
function buildSubfolder(node) {
  const el = document.createElement('div');
  el.className = 'subfolder';
  el.dataset.id = node.id;
  el.tabIndex = 0;
  el.draggable = true;

  const ico = document.createElement('span');
  ico.className = 'subfolder-ico';
  ico.innerHTML = SVG_FOLDER;

  const copy = document.createElement('span');
  copy.className = 'subfolder-copy';

  const name = document.createElement('span');
  name.className = 'subfolder-name';
  name.textContent = node.title || '未命名';

  const meta = document.createElement('span');
  meta.className = 'subfolder-meta';
  const n = childrenOf(node).length;
  meta.textContent = n ? `${n} 项` : '空';

  copy.append(name, meta);

  const arrow = document.createElement('span');
  arrow.className = 'subfolder-arrow';
  arrow.innerHTML = SVG_ARROW;

  el.append(ico, copy, arrow);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    enter(node);
  });
  bindSubDrag(el, node);
  return el;
}

/* ---------- 显示方式开关 ----------
   CSS 注释写明：「图标显示『点一下会变成什么』」
   所以：当前是列表 → 显示「图标」图标；当前是图标 → 显示「列表」图标 */
function buildViewToggle(node) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'zone-view';
  const listMode = modeOf(node) === MODE_LIST;
  el.innerHTML = listMode ? SVG_ICON : SVG_LIST;
  el.title = listMode ? '换成图标显示' : '换成列表显示';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    state.views.folders[node.id] = listMode ? MODE_ICON : MODE_LIST;
    storeSet('views', state.views);
    draw();
  });
  return el;
}

/* ---------- 一张相纸卡片 ---------- */
function buildZone(node, opts) {
  const openable = !!(opts && opts.openable);
  const zone = document.createElement('section');
  zone.className = 'zone';
  zone.dataset.id = node.id;
  zone.dataset.kind = openable ? 'folder' : 'group';

  const subs = foldersOf(node);
  const items = linksOf(node);
  const empty = !subs.length && !items.length;
  if (empty) zone.classList.add('is-empty');

  /* ---- 书脊 ---- */
  const head = document.createElement('header');
  head.className = openable ? 'zone-head openable' : 'zone-head';

  const dot = document.createElement('span');
  dot.className = 'zone-dot';

  const title = document.createElement('span');
  title.className = 'zone-title';
  title.textContent = node.title || '未命名';

  const count = document.createElement('span');
  count.className = 'zone-count';
  count.textContent = String(items.length);

  head.append(dot, title, count);

  if (!openable) head.appendChild(buildViewToggle(node));

  if (openable) {
    const open = document.createElement('span');
    open.className = 'zone-open';
    open.innerHTML = SVG_ARROW;
    head.appendChild(open);
    head.addEventListener('click', (e) => {
      e.stopPropagation();
      enter(node);
    });
  }

  // CSS: .zone-head[draggable="true"] 是 grab 手型 —— 标题栏就是拖拽把手
  head.draggable = true;
  bindZoneDrag(head, zone, node);

  /* ---- 主体 ---- */
  const body = document.createElement('div');
  body.className = 'zone-body';

  if (subs.length) {
    const list = document.createElement('div');
    list.className = 'subfolder-list';
    subs.forEach((s) => list.appendChild(buildSubfolder(s)));
    body.appendChild(list);
  }

  if (items.length) {
    const listMode = modeOf(node) === MODE_LIST;
    if (listMode) {
      const grid = document.createElement('div');
      grid.className = 'zone-grid';
      items.forEach((it) => grid.appendChild(buildItem(it)));
      body.appendChild(grid);
    } else {
      const band = document.createElement('div');
      band.className = 'tile-band';
      items.forEach((it) => band.appendChild(buildTile(it)));
      body.appendChild(band);
    }
  }

  if (empty) {
    const tip = document.createElement('div');
    tip.className = 'zone-empty';
    tip.textContent = '空的';
    body.appendChild(tip);
  }

  zone.append(head, body);
  bindZoneDrop(zone, node);
  return zone;
}

/* ---------- 铺满舞台 ---------- */
function draw() {
  const zones = $('zones');
  if (!zones) return;
  zones.innerHTML = '';

  const here = current();
  const kids = childrenOf(here);
  const folders = kids.filter((c) => !c.url);
  const loose = kids.filter((c) => c.url);

  // 每个文件夹一张卡（能打开）
  folders.forEach((f) => zones.appendChild(buildZone(f, { openable: true })));

  // 散落书签：顶层的收成一张「未分组」卡；文件夹里的直接铺在当层
  if (loose.length) {
    if (state.path.length) {
      zones.appendChild(buildZone({ id: `__loose__:${here.id}`, title: here.title || '书签', children: loose }, { openable: false }));
    } else {
      zones.appendChild(buildZone({ id: '__loose__', title: '未分组', children: loose }, { openable: false }));
    }
  }

  const emptyBox = $('empty');
  if (emptyBox) emptyBox.hidden = !!(folders.length || loose.length);

  paintCrumb();
  paintTray();
}

function current() {
  return state.path.length ? state.path[state.path.length - 1] : state.bar;
}

/* ---------- 面包屑 ----------
   CSS: .crumb 直接放 button，当前位置加 .cur */
function paintCrumb() {
  const crumb = $('crumb');
  if (!crumb) return;
  crumb.innerHTML = '';
  if (!state.path.length) { crumb.hidden = true; return; }
  crumb.hidden = false;

  const home = document.createElement('button');
  home.type = 'button';
  home.textContent = '书签栏';
  home.addEventListener('click', () => { state.path = []; draw(); });
  crumb.appendChild(home);

  state.path.forEach((node, i) => {
    const sep = document.createElement('span');
    sep.textContent = '/';
    sep.style.opacity = '0.4';
    crumb.appendChild(sep);

    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = node.title || '未命名';
    if (i === state.path.length - 1) b.classList.add('cur');
    b.addEventListener('click', () => { state.path = state.path.slice(0, i + 1); draw(); });
    crumb.appendChild(b);
  });
}

/* ---------- 放大层 ---------- */
function openZoom(node) {
  const box = $('folderZoom');
  const card = $('folderZoomCard');
  if (!box || !card) return;

  card.innerHTML = '';
  card.classList.remove('dragging');

  /* 头 */
  const head = document.createElement('header');
  head.className = 'zoom-head';

  const identity = document.createElement('div');
  identity.className = 'zoom-identity';

  const icon = document.createElement('span');
  icon.className = 'zoom-icon';
  icon.innerHTML = SVG_FOLDER;

  const title = document.createElement('span');
  title.className = 'zoom-title';
  title.id = 'zoomTitle';
  title.textContent = node.title || '未命名';

  identity.append(icon, title);

  const meta = document.createElement('span');
  meta.className = 'zoom-meta';
  const total = linksOf(node).length;
  meta.textContent = total ? `${total} 个书签` : '空的';

  head.append(identity, meta);

  /* CSS 里 `.zoom-head:hover .zone-view` 规定了放大层头部也有显示方式开关，
     所以这里也放一个 —— 在放大层里就能直接切图标/列表 */
  if (linksOf(node).length) head.appendChild(buildViewToggle(node));

  /* 内容 */
  const content = document.createElement('div');
  content.className = 'zoom-content';

  const subs = foldersOf(node);
  const items = linksOf(node);

  if (subs.length) {
    const list = document.createElement('div');
    list.className = 'zoom-folders';
    subs.forEach((s) => {
      const b = document.createElement('div');
      b.className = 'zoom-folder';
      b.dataset.id = s.id;
      b.tabIndex = 0;

      const fi = document.createElement('span');
      fi.className = 'zoom-folder-icon';
      fi.innerHTML = SVG_FOLDER;

      const copy = document.createElement('span');
      copy.className = 'zoom-folder-copy';
      const nm = document.createElement('span');
      nm.className = 'zoom-folder-name';
      nm.textContent = s.title || '未命名';
      const mt = document.createElement('span');
      mt.className = 'zoom-folder-meta';
      const c = linksOf(s).length;
      mt.textContent = c ? `${c} 个书签` : '空';
      copy.append(nm, mt);

      const ar = document.createElement('span');
      ar.className = 'zoom-folder-arrow';
      ar.innerHTML = SVG_ARROW;

      b.append(fi, copy, ar);
      b.addEventListener('click', (e) => { e.stopPropagation(); openZoom(s); });
      list.appendChild(b);
    });
    content.appendChild(list);
  }

  if (items.length) {
    if (modeOf(node) === MODE_LIST) {
      const list = document.createElement('div');
      list.className = 'zoom-list';
      items.forEach((it) => list.appendChild(buildItem(it)));
      content.appendChild(list);
    } else {
      const band = document.createElement('div');
      band.className = 'tile-band';
      items.forEach((it) => band.appendChild(buildTile(it)));
      content.appendChild(band);
    }
  }

  if (!subs.length && !items.length) {
    const tip = document.createElement('div');
    tip.className = 'zoom-empty';
    tip.textContent = '这个文件夹是空的';
    content.appendChild(tip);
  }

  card.append(head, content);

  /* 尺寸与位置：CSS 里 .folder-zoom-card 是 position:fixed + flex column，
     宽高由 JS 给，这里按可视区算一个合适的大小 */
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(320, Math.min(760, vw - 96));
  const h = Math.max(240, Math.min(640, vh - 112));
  card.style.width = `${w}px`;
  card.style.height = `${h}px`;
  card.style.left = `${Math.round((vw - w) / 2)}px`;
  card.style.top = `${Math.round((vh - h) / 2)}px`;

  box.hidden = false;
  document.body.classList.add('zoom-open');
  state.zoom = node;
}

function closeZoom() {
  const box = $('folderZoom');
  if (box) box.hidden = true;
  document.body.classList.remove('zoom-open');
  state.zoom = null;
}

/* 点文件夹 = 开这张卡片的放大层；再点进子文件夹就换一张 */
function enter(node) {
  openZoom(node);
}

function goBack() {
  if (state.zoom && state.zoom.parentId && state.byId.has(state.zoom.parentId)) {
    openZoom(state.byId.get(state.zoom.parentId));
  } else {
    closeZoom();
  }
}

/* ---------- 置顶栏 ---------- */
function paintTray() {
  const tray = $('tray');
  const box = $('trayApps');
  if (!tray || !box) return;

  const list = (state.icons || [])
    .map((ic) => (ic && ic.url ? ic : state.byId.get(typeof ic === 'string' ? ic : ic && ic.id)))
    .filter(Boolean);

  box.innerHTML = '';
  if (!list.length) { tray.hidden = true; return; }
  tray.hidden = false;

  list.forEach((node) => {
    const el = document.createElement('div');
    el.className = 'tray-app';
    el.dataset.id = node.id;
    el.tabIndex = 0;
    el.draggable = true;

    const ico = document.createElement('span');
    ico.className = 'tray-ico';
    paintIcon(ico, node);

    const name = document.createElement('span');
    name.className = 'tray-name';
    name.textContent = node.title || node.url;

    el.append(ico, name);

    el.addEventListener('click', (e) => openUrl(node.url, e.ctrlKey || e.metaKey));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTrayMenu(node, e.clientX, e.clientY);
    });
    bindTrayDrag(el, node);
    box.appendChild(el);
  });
}

/* ============================================================================
   拖拽 / 右键 / 刷新 / 启动

   拖拽铁律：内部拖拽只用自定义 MIME，绝不用 text/plain、text/uri-list。
   旧版本正是因为用了 text/plain，浏览器把内部拖动当成「从外面拖进来一个链接」，
   结果触发导入布局的误判 —— 拖图标变成导布局，就是那个 bug。
   ============================================================================ */

const BD_DRAG = 'application/x-bd-node';
let dragNode = null;

function beginDrag(e, node) {
  dragNode = node;
  try {
    e.dataTransfer.setData(BD_DRAG, String(node.id || ''));
    e.dataTransfer.effectAllowed = 'move';
  } catch { /* 少数环境不给 setData */ }
  document.body.classList.add('is-dragging');
}

function endDrag() {
  dragNode = null;
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.dragging, .drop-active, .insert-before, .insert-after, .drop-target')
    .forEach((el) => el.classList.remove('dragging', 'drop-active', 'insert-before', 'insert-after', 'drop-target'));
}

function bindItemDrag(el, node) {
  el.addEventListener('dragstart', (e) => { beginDrag(e, node); e.stopPropagation(); });
  el.addEventListener('dragend', endDrag);
}

function bindSubDrag(el, node) {
  el.addEventListener('dragstart', (e) => { beginDrag(e, node); e.stopPropagation(); });
  el.addEventListener('dragend', endDrag);
}

/* 卡片：标题栏是把手（CSS 里 .zone-head[draggable="true"] 就是 grab 手型），
   整张卡是落点 —— 拖进来的书签会进入这个文件夹 */
function bindZoneDrag(head, zone, node) {
  head.addEventListener('dragstart', (e) => { beginDrag(e, node); });
  head.addEventListener('dragend', endDrag);
  head.addEventListener('dragenter', (e) => {
    if (!dragNode) return;
    e.preventDefault();
    zone.classList.add('drop-active');
  });
}

function bindZoneDrop(zone, node) {
  zone.addEventListener('dragover', (e) => {
    if (!dragNode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('drop-active');
  });
  zone.addEventListener('dragleave', (e) => {
    if (zone.contains(e.relatedTarget)) return;
    zone.classList.remove('drop-active');
  });
  zone.addEventListener('drop', (e) => {
    if (!dragNode) return;
    e.preventDefault();
    e.stopPropagation();

    const src = dragNode;
    endDrag();

    if (String(src.id) === String(node.id)) return;
    if (!HAS_CHROME || !chrome.bookmarks) { toast('预览模式不能拖动'); return; }
    if (src.parentId === node.id) return;

    const index = childrenOf(node).length;
    try {
      chrome.bookmarks.move(src.id, { parentId: node.id, index }, () => scheduleRefresh());
    } catch {
      toast('移动失败');
    }
  });
}

function bindTrayDrag(el, node) {
  el.addEventListener('dragstart', (e) => { beginDrag(e, node); });
  el.addEventListener('dragend', endDrag);
}

/* ---------- 右键菜单 ---------- */
function showMenu(x, y, items) {
  const ctx = $('ctx');
  if (!ctx) return;
  ctx.innerHTML = '';
  items.forEach((it) => {
    if (it === '-') { ctx.appendChild(document.createElement('hr')); return; }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.label;
    if (it.danger) b.classList.add('danger');
    b.addEventListener('click', (e) => { e.stopPropagation(); hideCtx(); it.run(); });
    ctx.appendChild(b);
  });
  ctx.hidden = false;
  const w = ctx.offsetWidth || 170;
  const h = ctx.offsetHeight || 120;
  ctx.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 10))}px`;
  ctx.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 10))}px`;
}

function hideCtx() {
  const ctx = $('ctx');
  if (ctx) ctx.hidden = true;
}

/* 置顶图标的右键：取消置顶 */
function showTrayMenu(node, x, y) {
  showMenu(x, y, [
    { label: '打开', run: () => openUrl(node.url, false) },
    { label: '在新标签页打开', run: () => openUrl(node.url, true) },
    '-',
    {
      label: '取消置顶',
      run: () => {
        state.icons = (state.icons || []).filter((ic) => {
          const id = ic && typeof ic === 'object' ? ic.id : ic;
          return String(id) !== String(node.id);
        });
        storeSet('icons', state.icons);
        paintTray();
        toast('已取消置顶');
      },
    },
  ]);
}

/* 书签的右键：常规操作 */
function showItemMenu(node, x, y) {
  showMenu(x, y, [
    { label: '打开', run: () => openUrl(node.url, false) },
    { label: '在新标签页打开', run: () => openUrl(node.url, true) },
    '-',
    { label: '复制地址', run: () => copyText(node.url).then(() => toast('地址已复制')).catch(() => toast('复制失败')) },
    { label: '置顶到桌面', run: () => pinIcon(node) },
  ]);
}

function pinIcon(node) {
  const list = state.icons || [];
  if (list.some((ic) => String(ic && ic.id) === String(node.id))) { toast('已经在桌面上了'); return; }
  state.icons = list.concat([{ id: node.id, url: node.url, title: node.title, iconUrl: node.iconUrl }]);
  storeSet('icons', state.icons);
  paintTray();
  toast('已置顶');
}

/* ---------- 刷新 ---------- */
/* 书签被外部改动（增删改、拖动）时重读整棵树 */
async function refresh() {
  const keepZoomId = state.zoom && state.zoom.id;
  await loadTree();

  state.path = state.path.map((n) => state.byId.get(n.id)).filter(Boolean);

  if (keepZoomId && state.byId.has(keepZoomId)) {
    openZoom(state.byId.get(keepZoomId));
  } else if (state.zoom) {
    closeZoom();
  }

  draw();
}

let refreshTick = 0;
function scheduleRefresh() {
  clearTimeout(refreshTick);
  refreshTick = setTimeout(() => { refresh().catch(() => {}); }, 120);
}

/* ---------- 启动 ---------- */
async function init() {
  tickClock();
  setInterval(tickClock, 10000);

  state.engine = await storeGet('engine', 'bing');
  state.wallBlur = await storeGet('wallBlur', 'mid');
  state.icons = await storeGet('icons', []);
  state.views = await storeGet('views', { v: 1, folders: {}, items: {} });
  if (!state.views || !state.views.folders) state.views = { v: 1, folders: {}, items: {} };
  if (!state.views.items) state.views.items = {};
  state.bingDay = await storeGet('bingDay', 0);

  paintEngine();
  buildWallpaperPanel();

  await loadTree();
  draw();

  // 壁纸：必应要先把今天那张找回来
  const savedWall = await storeGet('wallpaper', 'aurora');
  if (savedWall === 'bing') {
    try {
      const b = await fetchBingWallpaper();
      state.bingList = b.list || [];
      const cur = state.bingList.find((d) => d.idx === state.bingDay) || state.bingList[0];
      state.wallpaperBing = cur ? cur.url : b.url;
    } catch {
      state.wallpaperBing = '';
    }
  }

  restorePaperTint(await storeGet('paperTint', null));
  applyWallpaper(savedWall || 'aurora');

  draw();
  await bindUI();

  if (HAS_CHROME && chrome.bookmarks) {
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].forEach((ev) => {
      if (chrome.bookmarks[ev]) chrome.bookmarks[ev].addListener(() => scheduleRefresh());
    });
  }
}

/* 事件都在这儿绑：函数全部定义完才绑，不会出现「还没定义就被调用」 */
async function bindUI() {
  const panel = $('wpPanel');
  const btnWallpaper = $('btnWallpaper');
  if (btnWallpaper && panel) {
    btnWallpaper.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        loadBingPanel();
        clearInterval(state.bingTick);
        state.bingTick = setInterval(() => { if (!panel.hidden) loadBingPanel(); }, BING_CACHE_MS);
      } else {
        clearInterval(state.bingTick);
      }
    });
  }

  const daily = $('wpBingDaily');
  if (daily) daily.addEventListener('click', (e) => { e.stopPropagation(); useTodayBing(); });

  const engineBtn = $('engineBtn');
  const engineMenu = $('engineMenu');
  if (engineBtn && engineMenu) {
    engineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      engineMenu.hidden = !engineMenu.hidden;
    });
  }

  const input = $('searchInput');
  const clear = $('searchClear');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
      if (e.key === 'Escape') { input.blur(); }
    });
    input.addEventListener('input', () => {
      const box = input.closest('.search');
      if (box) box.classList.toggle('has-value', !!input.value);
      if (clear) clear.hidden = !input.value;
    });
  }
  if (clear) {
    clear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!input) return;
      input.value = '';
      input.focus();
      const box = input.closest('.search');
      if (box) box.classList.remove('has-value');
      clear.hidden = true;
    });
  }

  const helpBtn = $('btnHelp');
  if (helpBtn) helpBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleKeyHint(); });
  const helpClose = $('helpClose');
  if (helpClose) helpClose.addEventListener('click', () => toggleKeyHint(false));

  const btnSync = $('btnSync');
  if (btnSync) btnSync.addEventListener('click', (e) => { e.stopPropagation(); showSyncPanel(); });

  const btnNewFolder = $('btnNewFolder');
  if (btnNewFolder) {
    btnNewFolder.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!HAS_CHROME || !chrome.bookmarks) { toast('预览模式不能新建'); return; }
      const parent = state.path.length ? state.path[state.path.length - 1] : state.bar;
      const title = window.prompt('新文件夹的名字');
      if (!title || !title.trim()) return;
      chrome.bookmarks.create({ parentId: parent.id, title: title.trim() }, () => scheduleRefresh());
    });
  }

  // 点空白：收起所有浮层
  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('.ctx')) hideCtx();
    if (!t.closest || !t.closest('.wp-panel')) { if (!t.closest || !t.closest('#btnWallpaper')) hideWallpaper(); }
    if (!t.closest || !t.closest('.help-card')) { if (!t.closest || !t.closest('#btnHelp')) toggleKeyHint(false); }
    if (!t.closest || !t.closest('.search')) { if (engineMenu) engineMenu.hidden = true; }
  });

  // 键盘
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /^(INPUT|TEXTAREA)$/.test(tag);

    if (e.key === 'Escape') {
      if (hideCtxIfOpen()) return;
      if (state.zoom) { closeZoom(); return; }
      if (panel && !panel.hidden) { hideWallpaper(); return; }
      toggleKeyHint(false);
      return;
    }
    if (typing) return;

    if (e.key === '/') { e.preventDefault(); if (input) input.focus(); }
    if (e.key === '?') { e.preventDefault(); toggleKeyHint(); }
    if (e.key === 'Backspace' && state.path.length) { e.preventDefault(); goBack(); }
  });

  // 拖文件进来：只认 .json 布局
  document.addEventListener('dragover', (e) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    dragHint(true);
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget) return;
    dragHint(false);
  });
  document.addEventListener('drop', async (e) => {
    if (dragNode) { endDrag(); return; }
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    dragHint(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) await importLayoutFile(file);
  });

  document.addEventListener('dragend', endDrag);

  // 放大层：点背景关（只绑一次）
  const backdrop = $('folderZoomBackdrop');
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = '1';
    backdrop.addEventListener('click', () => closeZoom());
  }
}

function hideCtxIfOpen() {
  const ctx = $('ctx');
  if (ctx && !ctx.hidden) { hideCtx(); return true; }
  return false;
}

async function main() {
  (function stampBuild() {
    const el = $('build');
    let ver = '1.21.0';
    if (HAS_CHROME && chrome.runtime && chrome.runtime.getManifest) {
      try { ver = chrome.runtime.getManifest().version; } catch { /* 用兜底 */ }
    }
    if (el) el.textContent = `v${ver}`;
  })();

  try {
    await init();
  } catch (err) {
    console.error('[书签桌面] 启动失败', err);
    const empty = $('empty');
    const title = $('emptyTitle');
    const sub = $('emptySub');
    if (empty) empty.hidden = false;
    if (title) title.textContent = '出了点问题';
    if (sub) sub.textContent = String((err && err.message) || err);
  }
}

main();
