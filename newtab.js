'use strict';

/* ==========================================================
   书签桌面 · 新标签页  newtab.js
   ----------------------------------------------------------
   目录（v2 全量重写，功能与此前各版本完全对齐）：
     1. 公共层             $ / storeGet / storeSet / toast / state
     2. 数据               预置壁纸、模糊档位、搜索引擎、示例书签树
     3. 纸跟着壁纸走       背景取色（色相 / 彩度 / 明度 / 透光）
     4. 壁纸面板           渐变预设 + 必应每日（3×3 九宫格往期）
     5. 布局同步           导出 / 导入 / 分享文本（纯离线）
     6. 显示方式           图标 / 列表 + 自动推断（打分制）
     7. 渲染               桌面卡片、放大层、置顶栏、搜索结果
     8. 交互               拖拽（跨文件夹 / 换位置 / 置顶排序）、右键菜单
     9. 启动               初始化与事件绑定

   三条铁律（踩过坑，别再犯）：
     a. 本文件顶层只有「声明」，任何函数调用都放在 main() 里，
        且 main() 必须写在文件最后 —— 否则会 xxx is not defined。
     b. 内部拖拽只用私有 MIME，绝不用 text/plain，否则会被当成
        「从外面拖进来一个链接」，触发导入布局的误判。
     c. 所有 DOM 类名必须能在 newtab.css 里找到，自创等于没样式。
   ========================================================== */

/* ---------------- 1. 公共层 ---------------- */

const $ = (id) => document.getElementById(id);

/* 扩展里走 chrome.storage.local；直接打开 newtab.html 预览时退到
   localStorage，前缀 bd: 免得和别的本地页面打架 */
const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
const HAS_BOOKMARKS = HAS_CHROME && !!(chrome.bookmarks && chrome.bookmarks.getTree);

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
    /* 存不进去就算了：界面上已经改过，下次有动静再存 */
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

/* 全局状态：视图相关的一切都在这儿，渲染函数只读它 */
const state = {
  wallpaper: 'aurora',      // 渐变预设 id 或 'bing'
  wallBlur: 'mid',          // 必应照片模糊档位
  engine: 'bing',           // 当前搜索引擎
  wallpaperBing: '',        // 当前生效的必应原图地址
  bingList: [],             // 必应往期（3×3 九宫格数据）
  bingDay: 0,               // 当前选中的天数：0=今天，1=昨天…
  bingTick: 0,              // 面板打开时的刷新计时器
  icons: [],                // 置顶清单，元素形如 { id, url, title, iconUrl }
  views: { v: 1, folders: {}, items: {} }, // 显示方式：文件夹 / 书签各自覆盖
  tree: null,
  byId: new Map(),          // id → 节点
  bar: null,                // 书签栏根节点
  path: [],                 // 下钻路径（面包屑）
  query: '',                // 搜索关键字
  zoom: null,               // 放大层当前展示的文件夹
  dragNode: null,           // 正在拖的东西
  lastFocus: '',            // 重绘前的焦点身份证，画完还回去
};

/* ---------------- 2. 数据 ---------------- */

/* 8 套渐变：深色 5、浅色 3。light:true 会把整页配色切到浅色纸。
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
  { id: 'off', label: '无', px: 0 },
  { id: 'lite', label: '轻', px: 10 },
  { id: 'mid', label: '中', px: 22 },
  { id: 'deep', label: '重', px: 40 },
];

const ENGINES = [
  { id: 'bing', name: '必应', logo: 'B', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'baidu', name: '百度', logo: '百', url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { id: 'google', name: 'Google', logo: 'G', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'sogou', name: '搜狗', logo: '搜', url: (q) => `https://www.sogou.com/web?query=${encodeURIComponent(q)}` },
  { id: 'ddg', name: 'DuckDuckGo', logo: 'D', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
];

const MODE_ICON = 'icon';
const MODE_LIST = 'list';
function isMode(v) { return v === MODE_ICON || v === MODE_LIST; }

/* 没有 chrome.bookmarks（双击 newtab.html 预览）时用这棵假树，
   这样预览页也能看全所有状态 */
function mockTree() {
  const mk = (id, title, children) => ({ id, title, children });
  const leaf = (n, title, url) => ({ id: 'm' + n, title, url });
  const bar = mk('1', '书签栏', [
    mk('10', '前端', [
      leaf(1, 'MDN 文档', 'https://developer.mozilla.org'),
      leaf(2, 'Can I use', 'https://caniuse.com'),
      leaf(3, 'web.dev', 'https://web.dev'),
      leaf(4, 'CSS-Tricks', 'https://css-tricks.com'),
    ]),
    mk('11', '工具', [
      leaf(5, 'Figma', 'https://www.figma.com'),
      leaf(6, 'Excalidraw', 'https://excalidraw.com'),
      leaf(7, 'RegExr', 'https://regex101.com'),
      leaf(8, 'JSON 格式化', 'https://www.json.cn'),
    ]),
    mk('12', '阅读', [
      leaf(9, '少数派', 'https://sspai.com'),
      leaf(10, '知乎', 'https://www.zhihu.com'),
      leaf(11, 'Hacker News', 'https://news.ycombinator.com'),
    ]),
    mk('13', '设计', [
      leaf(12, 'Dribbble', 'https://dribbble.com'),
      leaf(13, 'Behance', 'https://www.behance.net'),
    ]),
  ]);
  return mk('0', '', [bar]);
}

/* ---------------- 3. 纸跟着壁纸走 ----------------
   壁纸是随机的，一张纯白的纸贴在哪张照片上都格格不入。
   这里从壁纸里取色，把「纸」本身染成壁纸的同色系：
     --paper-warm   上沿：照片顶上亮，纸就偏暖
     --paper-deep   下沿：照片底下沉，纸就多沉一档
     --paper-solid  卡片实底（不透明）
     --paper        卡片中间那层，带 alpha，让壁纸透上来
     --paper-alpha  透多少
   绝不碰 --ink / --text / --accent：字和身份不跟着壁纸漂。 */

const TINT_SIZE = 48;            // 取样用的缩略图边长
const TINT_S_REF = 0.55;         // s=0.55 就视为「很热闹的壁纸」，不再往上加
const TINT_S_MIN = 0.2;          // 灰壁纸的纸彩度（再低就雪盲）
const TINT_S_MAX = 0.5;          // 最彩的纸（再高就成彩色卡）
const TINT_A_MIN = 0.42;         // 渐层透明度下限
const TINT_A_MAX = 0.62;         // 渐层透明度上限
const TINT_L_FLOOR = 0.895;      // 纸明度下限：白纸染了色还是纸

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function hsl2rgb(h, s, l) {
  const hn = ((h % 360) + 360) % 360 / 360;
  if (s <= 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
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

const rgbStr = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255))
  .toString(16).padStart(2, '0')).join('');

const rgbaStr = (rgb, a) => `rgba(${rgb.map((v) => Math.round(clamp(v, 0, 255))).join(', ')}, ${a.toFixed(3)})`;

/* #rrggbb + alpha → rgba() */
function rgbToRgba(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* 从 RGBA 像素里算：整张平均色 + 上沿 / 下沿各自的平均色。
   取平均而不是取某几个点 —— 免得恰好点在太阳或黑水上 */
function analyzeThumb(data, size) {
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
function hueOf(rgb) {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
  const mn = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
  const d = mx - mn;
  if (d < 0.0001) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return h * 60;
}

/* 最短角差：350° 和 10° 只差 20°，不是 340° */
function blendHue(a, b, w) {
  if (a == null) return b;
  if (b == null) return a;
  const d = ((b - a + 540) % 360) - 180;
  return ((a + d * w) % 360 + 360) % 360;
}

/* 算要写进 body 的变量。返回 null 表示这张壁纸不适合取色
   （太黑 / 太亮 / 跨域读不到），交回 CSS 里写死的默认纸 */
function paperTintVars(info) {
  if (!info) return null;
  const { s, l, h } = info;
  if (!(l > 0.08 && l < 0.74)) return null;

  const hueTop = hueOf(info.topRGB || [128, 128, 128]);
  const hueBot = hueOf(info.botRGB || [128, 128, 128]);
  const hueMid = hueOf([info.r, info.g, info.b]);

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

const TINT_KEYS = ['--paper-warm', '--paper-deep', '--paper-solid', '--paper', '--paper-alpha'];

function paintPaperTint(info) {
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

/* 上次算过的色先上纸，再异步重算一次 —— 避免每次闪一下白纸再变色 */
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

async function refreshPaperTint() {
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

/* ---------------- 4. 壁纸 ---------------- */

function wpList() { return $('wpList'); }

function paintWallBlur() {
  const bg = $('bg');
  if (!bg) return;
  const b = WALL_BLURS.find((x) => x.id === state.wallBlur) || WALL_BLURS[2];
  // 模糊会从边缘漏出虚边，放大一点刚好盖住
  bg.style.filter = b.px ? `blur(${b.px}px)` : '';
  bg.style.transform = b.px ? 'scale(1.08)' : '';
  const opts = $('wpBlurOpts');
  if (opts) [...opts.children].forEach((n) => n.classList.toggle('on', n.dataset.id === b.id));
  const row = $('wpBlurRow');
  if (row) row.hidden = state.wallpaper !== 'bing';
}

/* 套上一套壁纸。id 是渐变的 id，或者 'bing' 表示用必应照片 */
function applyWallpaper(id) {
  const bg = $('bg');
  const list = wpList();
  if (!bg) return;

  if (id === 'bing' && state.wallpaperBing) {
    state.wallpaper = 'bing';
    bg.style.backgroundColor = '#10131c';
    bg.style.backgroundImage = `url("${state.wallpaperBing}")`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.backgroundRepeat = 'no-repeat';
    document.body.dataset.light = '0';
    if (list) [...list.children].forEach((n) => n.classList.toggle('on', false));
    paintWallBlur();
    refreshPaperTint();
    return;
  }

  const wp = WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
  state.wallpaper = wp.id;
  bg.style.backgroundColor = '';
  bg.style.backgroundImage = 'none';
  bg.style.background = wp.css;
  bg.style.backgroundSize = '';
  bg.style.backgroundPosition = '';
  bg.style.backgroundRepeat = '';
  document.body.dataset.light = wp.light ? '1' : '0';
  if (list) [...list.children].forEach((n) => n.classList.toggle('on', n.dataset.id === wp.id));
  paintWallBlur();
  refreshPaperTint();
}

async function pickWallpaper(id) {
  applyWallpaper(id);
  await storeSet('wallpaper', state.wallpaper);
}

function buildWallpaperPanel() {
  const box = wpList();
  if (!box) return;
  box.innerHTML = '';
  WALLPAPERS.forEach((wp) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'wp-item';
    d.dataset.id = wp.id;
    d.style.background = wp.css;
    d.title = wp.light ? '浅色壁纸' : '深色壁纸';
    d.addEventListener('click', async (e) => {
      e.stopPropagation();
      await pickWallpaper(wp.id);
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
    d.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.wallBlur = b.id;
      paintWallBlur();
      refreshPaperTint();
      await storeSet('wallBlur', b.id);
    });
    opts.appendChild(d);
  });
  paintWallBlur();
}

function toggleWallpaperPanel(force) {
  const panel = $('wpPanel');
  if (!panel) return;
  const open = force == null ? panel.hidden : !!force;
  panel.hidden = !open;
  clearInterval(state.bingTick);
  if (open) {
    loadBingPanel();
    state.bingTick = setInterval(() => { if (!panel.hidden) loadBingPanel(); }, BING_CACHE_MS);
  }
}

function hideWallpaper() {
  const panel = $('wpPanel');
  if (panel) panel.hidden = true;
  clearInterval(state.bingTick);
  state.bingTick = 0;
}

/* ---------- 必应每日壁纸 ----------
   一次取最近 BING_DAYS 天：idx=0 是今天，idx 越大越旧；面板里排成 3×3。
   取「今天 + 往前 8 天」正好 9 张，第 10 天不要 —— 格子对不上反而难看。 */
const BING_DAYS = 9;
/* 有两套接口参数可以要历史：官方老接口用 idx，有的地区 / 版本要换 xid。
   两个都试一遍，哪个先返回够用的就用哪个 */
const BING_ENDPOINTS = [
  (w, i) => `https://www.bing.com/HPImageArchive.aspx?format=js&n=${w}&mkt=zh-CN&idx=${i}`,
  (w, i) => `https://www.bing.com/HPImageArchive.aspx?format=js&n=${w}&mkt=zh-CN&xid=${i}`,
];
const BING_CACHE_MS = 6 * 60 * 60 * 1000;

/* 缩略图参数：原图动辄 3~8MB，画廊里只要 320 宽就够看 */
function bingThumb(url, w = 320) {
  return url.replace(/&w=\d+/, '').replace(/&h=\d+/, '') + `&w=${w}&h=${Math.round(w * 0.5625)}&rs=1`;
}

/* 一次请求要回 want 天。必应有时只认 idx 不认 n、有时反过来，
   所以「要 8 天却只给 1 天」就当这次没成功，换下一套参数再试 */
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

/* 一天一天地要：第 0 天、第 1 天……直到拿到重复的。
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

/* 往期去重用「URL 的查询串」而不是整条 URL：
   缓存里存的可能是缩略图地址，只差 w/h 参数，整串比会认成两张 */
function bingKey(url) {
  const s = String(url || '');
  const q = s.split('?')[1];
  if (!q) return s;
  return q.replace(/&(w|h|rs)=[^&]*/g, '');
}

async function fetchBingWallpaper(force = false) {
  const cached = await storeGet('bing', null);
  // 缓存里记着「这份是按几天取的」（for_）。天数一改旧缓存直接作废，
  // 否则升级完打开看见的还是老画廊，得干等 6 小时缓存过期
  const fresh = cached && cached.ts && Date.now() - cached.ts < BING_CACHE_MS
    && cached.url && cached.list && cached.list.length
    && cached.for_ === BING_DAYS;
  if (!force && fresh) return cached;
  const prev = cached && cached.list ? cached.list : [];

  let list = [];
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
    if (cached && cached.url) return cached;
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
  return out;
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
    b.addEventListener('click', (e) => { e.stopPropagation(); pickBingDay(day); });
    box.appendChild(b);
  });
  const cur = list.find((d) => d.idx === state.bingDay) || list[0];
  if (metaEl) metaEl.textContent = cur ? (cur.copyright || cur.title || '') : '';
}

/* 画廊里点一张：立刻换上去，但不动「跟随每日」这个意图本身，
   所以「用今天的」按钮一直在，下次开新标签页还是回到当天那张 */
async function pickBingDay(day) {
  if (!day || !day.url) return;
  state.wallpaperBing = day.url;
  state.bingDay = day.idx;
  applyWallpaper('bing');
  await storeSet('wallpaper', 'bing');
  await storeSet('bingDay', day.idx);
  paintBingGallery();
  toast(day.idx === 0 ? '已启用今天的必应壁纸' : `已切换到 ${bingDayLabel(day)} 的壁纸`);
}

async function loadBingPanel() {
  const metaEl = $('wpBingMeta');
  try {
    const b = await fetchBingWallpaper();
    state.bingList = (b.list && b.list.length)
      ? b.list
      : [{ idx: 0, url: b.url, thumb: b.thumb, title: b.title, copyright: b.copyright }];
    if (state.bingDay == null) state.bingDay = 0;
    // 选的那天滚出 9 天窗口了（停了半个月没开），退回今天
    if (!state.bingList.some((d) => d.idx === state.bingDay)) state.bingDay = 0;
    const cur = state.bingList.find((d) => d.idx === state.bingDay) || state.bingList[0];
    if (state.wallpaper === 'bing' && cur) state.wallpaperBing = cur.url;
    paintBingGallery();
  } catch {
    state.bingList = [];
    if (metaEl) metaEl.textContent = '';
    paintBingGallery();
  }
}

async function useTodayBing() {
  if (!state.bingList || !state.bingList.length) { toast('还没有取到今天的壁纸'); return; }
  const today = state.bingList.find((d) => d.idx === 0) || state.bingList[0];
  await pickBingDay(today);
}

/* ---------------- 5. 布局同步（导出 / 导入 / 分享文本） ----------------
   只搬「怎么展示」：置顶图标顺序、图标 / 列表方式、壁纸、引擎、模糊档位。
   书签本身由浏览器自己同步，这里一根指头都不碰它。

   关键点：chrome.bookmarks 的 id 是每台设备本地分配的，同一份书签在
   A 机和 B 机上 id 完全不同，直接搬 id 会全部错位。所以导出时先把 id
   翻译成跨设备稳定的键 —— 书签用规范化 URL，文件夹用「书签栏/工具/前端」
   这样的标题路径 —— 导入时再翻回本机的 id。文件里不出现任何 bookmark id。 */

const LAYOUT_APP = 'bookmark-desktop-layout';
const LAYOUT_SCHEMA = 1;
const SHARE_PREFIX_GZ = 'bd1.';
const SHARE_PREFIX_RAW = 'bd0.';
const BD_MIME = 'application/x-bookmark-desktop';

let pendingLayout = null;

/* 规范化 URL：去 hash、去跟踪参数、参数排序、去尾斜杠 */
function normUrl(u) {
  try {
    const url = new URL(String(u));
    url.hash = '';
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

/* 文件夹的标题路径：从书签栏往下数着拼 */
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

/* 本机：规范化 URL → id（同一个 URL 只认第一个） */
function layoutUrlIndex() {
  const map = new Map();
  state.byId.forEach((node) => {
    if (!node.url) return;
    const k = normUrl(node.url);
    if (k && !map.has(k)) map.set(k, node.id);
  });
  return map;
}

/* 本机：标题路径 → id */
function layoutFolderIndex() {
  const map = new Map();
  layoutFolderPaths().forEach((path, id) => {
    if (path && !map.has(path)) map.set(path, id);
  });
  return map;
}

/* 导出：把本机 id 全部换成稳定键 */
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
    prefs: {
      wallpaper: state.wallpaper,
      wallBlur: state.wallBlur,
      engine: state.engine,
    },
    icons,
    views: { items, folders },
  };
}

/* 把布局翻译回本机 id；对不上的条目跳过，不让它变成错误设置 */
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

function countViews(plan) {
  return Object.keys(plan.items).length + Object.keys(plan.folders).length;
}

function syncResetPending() {
  pendingLayout = null;
  const p = $('syncPreview');
  if (p) { p.hidden = true; p.innerHTML = ''; }
}

function syncLines(plan) {
  const lines = [];
  lines.push(`置顶图标 ${plan.icons.length} 个${plan.missIcons ? `（${plan.missIcons} 个本机没有）` : ''}`);
  lines.push(`显示方式 ${countViews(plan)} 项${plan.missViews ? `（${plan.missViews} 项对不上）` : ''}`);
  const bits = [];
  if (plan.prefs.wallpaper) bits.push(`壁纸 ${plan.prefs.wallpaper}`);
  if (plan.prefs.wallBlur) bits.push(`模糊 ${plan.prefs.wallBlur}`);
  if (plan.prefs.engine) bits.push(`搜索引擎 ${plan.prefs.engine}`);
  if (bits.length) lines.push(`偏好 ${bits.join(' · ')}`);
  return lines;
}

function renderSyncPreview(plan) {
  const box = $('syncPreview');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '';
  syncLines(plan).forEach((text) => {
    const p = document.createElement('div');
    p.textContent = text;
    box.appendChild(p);
  });
  const tip = document.createElement('div');
  tip.className = 'sync-hint';
  tip.textContent = '导入是整体覆盖：本机多出来的置顶图标和显示方式会被清掉。';
  box.appendChild(tip);
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
  draw();
  paintTray();
  toast(`已导入：置顶 ${state.icons.length} · 显示方式 ${countViews(plan)}`);
}

/* ---------- 分享文本：gzip + base64url ----------
   bd1. 表示 gzip 过的，bd0. 表示没压的原文 */
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
  if (typeof CompressionStream === 'undefined') return SHARE_PREFIX_RAW + bytesToB64url(new TextEncoder().encode(json));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const packed = SHARE_PREFIX_GZ + bytesToB64url(new Uint8Array(buf));
  // 只有几个置顶图标的小布局，gzip 头比省下来的还多，退回不压缩，不让它变大
  if (packed.length >= SHARE_PREFIX_RAW.length + bytesToB64url(new TextEncoder().encode(json)).length) {
    return SHARE_PREFIX_RAW + bytesToB64url(new TextEncoder().encode(json));
  }
  return packed;
}

async function unpackLayout(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('空文本');
  if (raw.startsWith(SHARE_PREFIX_GZ)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('这个浏览器不支持解压');
    const stream = new Blob([b64urlToBytes(raw.slice(4))]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  if (raw.startsWith(SHARE_PREFIX_RAW)) {
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

function toggleSyncPanel(force) {
  const p = $('syncPanel');
  if (!p) return;
  const open = force == null ? p.hidden : !!force;
  p.hidden = !open;
  if (!open) syncResetPending();
}

/* 判断一段文本是不是布局：先试 JSON，再看 app 标记 */
function looksLikeLayout(text) {
  const raw = String(text || '').trim();
  if (/^bd[01]\./.test(raw)) return true;
  try {
    const o = JSON.parse(raw);
    return !!(o && o.app === LAYOUT_APP);
  } catch {
    return false;
  }
}

function isLayoutObject(data) {
  return !!(data && data.app === LAYOUT_APP);
}

function checkLayoutFile(file) {
  if (!file) return false;
  if (/\.(json|txt)$/i.test(file.name || '')) return true;
  return file.type === 'application/json' || file.type === 'text/plain';
}

function setDropHint(on) {
  const hint = $('dropHint');
  if (hint) hint.hidden = !on;
  document.body.classList.toggle('is-dragging', !!on && !state.dragNode);
}

/* 拖进来的是文件而不是页面里的元素？ */
function isFilesDrag(e) {
  if (state.dragNode) return false;           // 内部拖拽一律不参与导入
  const types = (e.dataTransfer && e.dataTransfer.types) || [];
  if (Array.prototype.indexOf.call(types, BD_MIME) >= 0) return false;
  return Array.prototype.indexOf.call(types, 'Files') >= 0;
}

/* 先把待导入的布局读出来给人看一眼，点「确认覆盖」才真的写 */
async function startPreview(text) {
  let data;
  try {
    data = await unpackLayout(text);
  } catch {
    renderSyncError('这份内容读不出来，可能不是布局文本');
    toggleSyncPanel(true);
    return;
  }
  if (!isLayoutObject(data)) { renderSyncError('不是书签桌面的布局文件'); toggleSyncPanel(true); return; }
  if (Number(data.schema) > LAYOUT_SCHEMA) { renderSyncError('这份布局比当前版本新，先升级扩展'); toggleSyncPanel(true); return; }
  const plan = resolveLayout(data);
  const total = plan.icons.length + countViews(plan);
  const hasPrefs = !!(plan.prefs.wallpaper || plan.prefs.engine || plan.prefs.wallBlur);
  if (!total && !hasPrefs) {
    renderSyncError('这份布局里没有本机对得上的内容');
    toggleSyncPanel(true);
    return;
  }
  pendingLayout = plan;
  toggleSyncPanel(true);
  renderSyncPreview(plan);
}

async function importLayoutFile(file) {
  if (!checkLayoutFile(file)) { toast('只认 .json / .txt 布局文件'); return; }
  const text = await file.text();
  await startPreview(text);
}

/* ---------------- 6. 显示方式：图标 / 列表 ----------------
   优先级：单条书签 > 文件夹 > 自动推断。
   自动推断只看三件事：站点性质、路径深度、标题长度。
   平局判给列表 —— 文章被压成方块会丢掉标题，代价比反过来大。 */

const SITE_ICON = /(^|\.)(figma\.com|notion\.so|excalidraw\.com|miro\.com|vercel\.com|netlify\.app|localhost|127\.0\.0\.1|192\.168\.)/i;
const SITE_LIST = /(^|\.)(zhihu\.com|juejin\.cn|sspai\.com|medium\.com|ycombinator\.com|reddit\.com|news\.|blog\.|weibo\.com|bilibili\.com)/i;
const LIST_PATH = /(github\.com\/[^/]+\/[^/]+\/(blob|tree|issues|pull)|docs?\.|\.md$|\/(wiki|issue|post|article|p)\/)/i;

/* 只按书签本身打分，不读 state —— 方便单独测。
   v2.0.2 修正：原来 score 从 0 起步，而判图标要 >= 1，于是普通网址
   （github / google / 百度 / 淘宝 …）永远停在 0 分，全被判成列表，
   整个桌面看起来「自动显示全是列表」。改成从 +1 起步：**默认就是图标**，
   只有站点性质 / 路径 / 标题确实像篇文章时，才一分一分扣到列表去。 */
function inferMode(node) {
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
  const depth = (rest.split('/').filter(Boolean)).length;
  if (depth >= 2) score -= 1;
  if (depth >= 3) score -= 1;
  // 标题长度：长的像文章
  const title = String((node && node.title) || '');
  if (title.length >= 24) score -= 2;
  else if (title.length >= 14) score -= 1;
  // 平局判给列表（score >= 1 才是图标）
  return score >= 1 ? MODE_ICON : MODE_LIST;
}

/* 优先级：单条书签 > 最近的设过显示方式的祖先文件夹 > 自动推断。
   v2.0.1 修正：原来这里只读「自己的文件夹 id」，于是点卡片上的「图标显示」
   只把「卡片自己的布局」换了，里面这些按站点推断成列表的书签原地不动 ——
   看起来就像点了没反应。真正生效的规则是「文件夹设成列表后，里面新加的书签
   也跟着是列表」，那条规则本来就在 folderModeInherit 里，只是没被用上。 */
function modeOf(node) {
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

/* 给文件夹改显示方式：文件夹覆盖会连带影响里面没手动设过的书签
   （靠 modeOf 往上找祖先实现，这里只负责写库） */
async function setFolderMode(node, mode) {
  if (!node || !node.id) return;
  state.views.folders[node.id] = mode;
  await storeSet('views', state.views);
}

/* 让「文件夹设成列表后，里面新加的书签也跟着是列表」成立：
   往上找最近一个设过的祖先文件夹 */
function folderModeInherit(node) {
  let p = node && node.parentId ? state.byId.get(node.parentId) : null;
  while (p) {
    const m = state.views.folders[p.id];
    if (isMode(m)) return m;
    p = p.parentId ? state.byId.get(p.parentId) : null;
  }
  return null;
}

/* ---------------- 7. 渲染 ---------------- */

/* ---------- 7.1 书签树 ---------- */
function indexTree(tree) {
  const byId = new Map();
  const walk = (node, parentId) => {
    if (parentId != null) node.parentId = parentId;
    byId.set(node.id, node);
    (node.children || []).forEach((c) => walk(c, node.id));
  };
  walk(tree, null);
  state.byId = byId;
  return tree;
}

async function loadTree() {
  if (HAS_BOOKMARKS) {
    const [tree] = await chrome.bookmarks.getTree();
    state.bar = (tree.children || []).find((c) => /书签栏|Bookmarks bar|Barre/i.test(c.title))
      || (tree.children && tree.children[0]) || tree;
    state.tree = indexTree(tree);
    return state.tree;
  }
  const tree = mockTree();
  state.bar = (tree.children || [])[0] || tree;
  state.tree = indexTree(tree);
  return state.tree;
}

function childrenOf(node) { return (node && node.children) || []; }
function linksOf(node) { return childrenOf(node).filter((c) => c.url); }
function foldersOf(node) { return childrenOf(node).filter((c) => !c.url); }
function current() { return state.path.length ? state.path[state.path.length - 1] : state.bar; }

/* 图标方块里的字：域名首个字母 */
function iconOf(node) {
  const host = String((node && node.url) || '').replace(/^[a-z]+:\/\/(www\.)?/i, '').split(/[/?#]/)[0];
  return (host[0] || '?').toUpperCase();
}

/* Chrome 的 _favicon 接口：有就用真 favicon，没有就退字母印章 */
function faviconOf(url) {
  if (!HAS_CHROME || !chrome.runtime || !chrome.runtime.getURL) return '';
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', String(url));
    u.searchParams.set('size', '32');
    return u.toString();
  } catch {
    return '';
  }
}

/* ---------- 7.2 图标小件 ---------- */
const SVG_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const SVG_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SVG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function letterBlock(ch) {
  const s = document.createElement('span');
  s.className = 'letter';
  let h = 0;
  for (let i = 0; i < ch.length; i += 1) h = (h * 31 + ch.charCodeAt(i)) % 360;
  s.style.background = `hsl(${h}, 52%, 52%)`;
  s.textContent = ch;
  return s;
}

/* 有 favicon 用 img，加载失败就换字母印章 */
function paintIcon(box, node) {
  box.innerHTML = '';
  const src = node.iconUrl || faviconOf(node.url);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
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

function folderBlock() {
  const s = document.createElement('span');
  s.className = 'ico folder';
  s.innerHTML = SVG_FOLDER;
  return s;
}

/* ---------- 7.3 书签条目 ---------- */
function hexId(n) {
  let h = 2166136261;
  const s = String(n);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'n' + (h >>> 0).toString(36);
}

function bindOpen(el, node) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openUrl(node.url, e.ctrlKey || e.metaKey);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showItemMenu(node, e.clientX, e.clientY);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openUrl(node.url, e.ctrlKey || e.metaKey);
    }
  });
}

function buildItem(node) {
  const el = document.createElement('div');
  el.className = 'item';
  el.dataset.fid = hexId(node.id);
  el.tabIndex = 0;
  el.draggable = true;

  const ico = document.createElement('span');
  ico.className = 'ico';
  paintIcon(ico, node);

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = node.title || node.url;
  label.title = `${node.title || ''}\n${node.url || ''}`.trim();

  el.append(ico, label);
  bindOpen(el, node);
  bindItemDrag(el, node);
  return el;
}

function buildTile(node) {
  const el = document.createElement('div');
  el.className = 'item tile';
  el.dataset.fid = hexId(node.id);
  el.tabIndex = 0;
  el.draggable = true;

  const ico = document.createElement('span');
  ico.className = 'tile-ico';
  paintIcon(ico, node);

  const name = document.createElement('span');
  name.className = 'tile-name';
  name.textContent = node.title || node.url;
  name.title = node.title || node.url;

  el.append(ico, name);
  bindOpen(el, node);
  bindItemDrag(el, node);
  return el;
}

/* 子文件夹入口：无描边，hover 才出底色 */
function buildSubfolder(node) {
  const el = document.createElement('div');
  el.className = 'subfolder';
  el.dataset.fid = hexId(node.id);
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

  el.addEventListener('click', (e) => { e.stopPropagation(); enter(node); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      enter(node);
    }
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showFolderMenu(node, e.clientX, e.clientY);
  });
  bindSubDrag(el, node);
  return el;
}

/* 显示方式开关：图标显示的是「点一下会变成什么」 */
function buildViewToggle(node) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'zone-view';
  const listMode = modeOf(node) === MODE_LIST;
  el.innerHTML = listMode ? SVG_ICON : SVG_LIST;
  el.title = listMode ? '换成图标显示' : '换成列表显示';
  el.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    await setFolderMode(node, listMode ? MODE_ICON : MODE_LIST);
    render();
  });
  return el;
}

/* ---------- 7.4 一张相纸卡片 ---------- */
function buildZone(node, opts) {
  const openable = !!(opts && opts.openable);
  const zone = document.createElement('section');
  zone.className = 'zone';
  zone.dataset.kind = openable ? 'folder' : 'group';
  if (node.id) zone.dataset.fid = hexId(node.id);

  const subs = foldersOf(node);
  const items = linksOf(node);
  const empty = !subs.length && !items.length;
  if (empty) zone.classList.add('is-empty');

  /* ---- 书脊 ---- */
  const head = document.createElement('header');
  head.className = openable ? 'zone-head openable' : 'zone-head';
  head.tabIndex = 0;

  const dot = document.createElement('span');
  dot.className = 'zone-dot';

  const title = document.createElement('span');
  title.className = 'zone-title';
  title.textContent = node.title || '未命名';
  title.title = node.title || '未命名';

  const count = document.createElement('span');
  count.className = 'zone-count';
  count.textContent = String(items.length);

  head.append(dot, title, count);

  if (linksOf(node).length) head.appendChild(buildViewToggle(node));

  if (openable) {
    const open = document.createElement('span');
    open.className = 'zone-open';
    open.innerHTML = SVG_ARROW;
    head.appendChild(open);
    head.addEventListener('click', (e) => { e.stopPropagation(); enter(node); });
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        enter(node);
      }
    });
    head.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showFolderMenu(node, e.clientX, e.clientY);
    });
    // 标题栏就是拖拽把手（CSS 里 .zone-head[draggable="true"] 是 grab 手型）
    head.draggable = true;
    bindZoneDrag(head, zone, node);
  }

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
    /* 「未分组」这种合成卡的 id 是 `__loose__:1` 这种假 id，
       folderModeInherit() 沿 parentId 往上走永远走不到它 —— 于是点了卡片上的
       「图标显示」，外框变了，里面每条书签仍掉回 inferMode 判成列表。
       这里让合成卡里的书签跟随这张卡：卡是图标就全图标，卡是列表就全列表。
       单条书签自己设过的仍然优先（modeOf 的第一步就是查 views.items）。 */
    const zoneMode = modeOf(node);
    const looseKey = node.id ? String(node.id).startsWith('__loose__:') : false;
    const pick = (it) => {
      const own = state.views.items[it.id];
      if (isMode(own)) return own;
      return looseKey ? zoneMode : modeOf(it);
    };
    const listMode = pick(items[0]) === MODE_LIST;
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

/* ---------- 7.5 铺满舞台 ---------- */
function draw() {
  const zones = $('zones');
  if (!zones) return;
  zones.innerHTML = '';
  zones.classList.remove('searching');

  const here = current();
  const kids = childrenOf(here);
  const folders = kids.filter((c) => !c.url);
  const loose = kids.filter((c) => c.url);

  folders.forEach((f) => zones.appendChild(buildZone(f, { openable: true })));

  // 散落书签：顶层的收成一张「未分组」卡；文件夹里的直接铺在当层
  if (loose.length) {
    const title = state.path.length ? (here.title || '书签') : '未分组';
    zones.appendChild(buildZone({ id: `__loose__:${here.id}`, title, children: loose }, { openable: false }));
  }

  const emptyBox = $('empty');
  if (emptyBox) emptyBox.hidden = !!(folders.length || loose.length);

  paintTray();
}

/* 搜索中：整页换成一张扁平结果列表 */
function drawSearch() {
  const zones = $('zones');
  if (!zones) return;
  zones.innerHTML = '';
  zones.classList.add('searching');

  const hits = searchHits(state.query);
  const emptyBox = $('empty');
  if (emptyBox) emptyBox.hidden = hits.length > 0;

  const grid = document.createElement('div');
  grid.className = 'zone-grid';
  hits.forEach((h) => grid.appendChild(buildItem(h.node)));
  zones.appendChild(grid);
}

/* ---------- 7.6 面包屑 ---------- */
function paintCrumb() {
  const crumb = $('crumb');
  if (!crumb) return;
  crumb.innerHTML = '';
  if (!state.path.length) { crumb.hidden = true; return; }
  crumb.hidden = false;

  const home = document.createElement('button');
  home.type = 'button';
  home.textContent = '书签栏';
  home.addEventListener('click', () => { state.path = []; state.zoom = null; closeZoom(); draw(); });
  crumb.appendChild(home);

  state.path.forEach((node, i) => {
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '/';
    crumb.appendChild(sep);

    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = node.title || '未命名';
    if (i === state.path.length - 1) b.classList.add('cur');
    b.addEventListener('click', () => {
      state.path = state.path.slice(0, i + 1);
      openZoom(node);
    });
    crumb.appendChild(b);
  });
}

/* ---------- 7.7 放大层 ----------
   固定尺寸：约 920×600，屏幕小就按可用区域缩。翻文件夹时卡片不动，
   只有里面的内容在换，所以不会跟着「跳」 */
function zoomSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(320, Math.min(920, vw - 96));
  const h = Math.max(240, Math.min(600, vh - 112));
  return { w, h, vw, vh };
}

function openZoom(node) {
  if (!node) return;
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

  if (linksOf(node).length) head.appendChild(buildViewToggle(node));

  // 常驻出口（v1.18.0）：有上一层就给「上一组」，永远给 ×
  if (node.parentId && state.byId.has(node.parentId) && state.byId.get(node.parentId) !== state.bar) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'zoom-back';
    back.title = '上一组（Esc / Backspace）';
    back.innerHTML = SVG_BACK;
    back.addEventListener('click', (e) => { e.stopPropagation(); goBack(); });
    head.appendChild(back);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'zoom-close';
  close.title = '关闭（Esc）';
  close.innerHTML = SVG_CLOSE;
  close.addEventListener('click', (e) => { e.stopPropagation(); closeZoom(); });
  head.appendChild(close);

  /* 内容 */
  const content = document.createElement('div');
  content.className = 'zoom-content';

  const subs = foldersOf(node);
  const items = linksOf(node);

  if (subs.length) {
    const label = document.createElement('div');
    label.className = 'zoom-section-label';
    label.textContent = '文件夹';
    content.appendChild(label);

    const list = document.createElement('div');
    list.className = 'zoom-folders';
    subs.forEach((s) => {
      const b = document.createElement('div');
      b.className = 'zoom-folder';
      b.dataset.fid = hexId(s.id);
      b.tabIndex = 0;
      b.draggable = true;

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
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          openZoom(s);
        }
      });
      bindSubDrag(b, s);
      bindZoomFolderDrop(b, s);
      list.appendChild(b);
    });
    content.appendChild(list);
  }

  if (items.length) {
    if (subs.length) {
      const label = document.createElement('div');
      label.className = 'zoom-section-label';
      label.textContent = '书签';
      content.appendChild(label);
    }
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

  const { w, h, vw, vh } = zoomSize();
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

/* 点文件夹 = 打开放大层（桌面上双击才进去，单点不打扰） */
function enter(node) {
  openZoom(node);
}

function goBack() {
  const node = state.zoom;
  if (!node) return;
  const parent = node.parentId ? state.byId.get(node.parentId) : null;
  if (parent && parent !== state.bar) {
    openZoom(parent);
  } else {
    closeZoom();
  }
}

/* ---------- 7.8 置顶栏 ---------- */
function resolveIconEntry(entry) {
  if (!entry) return null;
  if (entry.url) return entry;
  const id = typeof entry === 'string' ? entry : entry.id;
  return state.byId.get(id) || null;
}

function paintTray() {
  const tray = $('tray');
  const box = $('trayApps');
  if (!tray || !box) return;

  const list = (state.icons || []).map(resolveIconEntry).filter(Boolean);

  box.innerHTML = '';
  if (!list.length) { tray.hidden = true; return; }
  tray.hidden = false;

  list.forEach((node) => {
    const el = document.createElement('div');
    el.className = 'tray-app';
    el.dataset.fid = hexId(node.id);
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
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openUrl(node.url, e.ctrlKey || e.metaKey);
      }
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTrayMenu(node, e.clientX, e.clientY);
    });
    bindTrayDrag(el, node);
    box.appendChild(el);
  });
}

/* ---------------- 8. 交互 ---------------- */

/* ---------- 8.1 搜索引擎 / 时钟 / 跳转 ---------- */
function paintEngine() {
  const e = ENGINES.find((x) => x.id === state.engine) || ENGINES[0];
  const logo = $('engineLogo');
  const name = $('engineName');
  const input = $('searchInput');
  if (logo) logo.textContent = e.logo;
  if (name) name.textContent = e.name;
  if (input) paintPlaceholder();
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

function engineNow() {
  return ENGINES.find((x) => x.id === state.engine) || ENGINES[0];
}

/* 占位文字跟着结果走（v1.18.0）：有命中就写「回车打开「XXX」· 其余 N 个」，
   没有命中才写「没有匹配，回车用必应搜索」 */
function paintPlaceholder() {
  const input = $('searchInput');
  if (!input) return;
  const e = engineNow();
  const q = String(input.value || '').trim();
  if (!q) {
    input.placeholder = `搜索书签，回车用${e.name}搜索`;
    return;
  }
  const hits = searchHits(q);
  if (!hits.length) {
    input.placeholder = `没有匹配，回车用${e.name}搜索`;
    return;
  }
  const first = hits[0].node.title || hits[0].node.url;
  input.placeholder = hits.length > 1
    ? `回车打开「${first}」 · 其余 ${hits.length - 1} 个`
    : `回车打开「${first}」`;
}

/* 输入本身就是网址时，回车直接打开 */
const URL_LIKE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i;

function looksLikeUrl(s) {
  const raw = String(s || '').trim();
  if (!raw || /\s/.test(raw)) return false;
  return URL_LIKE.test(raw) || /^https?:\/\//i.test(raw);
}

function withScheme(s) {
  const raw = String(s).trim();
  return /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function runSearch() {
  const input = $('searchInput');
  const q = (input && input.value || '').trim();
  if (!q) return;
  // 唯一例外：输入本身就是网址，直接打开
  if (looksLikeUrl(q)) { openUrl(withScheme(q), false); return; }
  const e = engineNow();
  openUrl(e.url(q), false);
}

function openUrl(url, newTab) {
  if (!url) return;
  if (newTab) {
    if (HAS_CHROME && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
    else window.open(url, '_blank');
    return;
  }
  if (HAS_CHROME && chrome.tabs && chrome.tabs.update) {
    chrome.tabs.update({ url });
  } else {
    window.location.href = url;
  }
}

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

/* ---------- 8.2 搜索 ----------
   排序：标题开头命中 > 标题包含 > 只有网址命中。
   搜 github 时不会被一个域名里带 github 的镜像站抢到第一条 */
function searchHits(q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return [];
  const out = [];
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
  out.sort((a, b) => (b.score - a.score) || a.node.title.localeCompare(b.node.title, 'zh'));
  return out;
}

/* 这条书签在哪：书签栏/工具 */
function crumbOf(node) {
  const parts = [];
  let p = node && node.parentId ? state.byId.get(node.parentId) : null;
  while (p && p !== state.bar) {
    parts.unshift(p.title || '未命名');
    p = p.parentId ? state.byId.get(p.parentId) : null;
  }
  return ['书签栏', ...parts].join(' / ');
}

async function onSearchInput() {
  const input = $('searchInput');
  if (!input) return;
  const q = String(input.value || '').trim();
  const box = input.closest('.search');
  const clear = $('searchClear');
  if (box) box.classList.toggle('has-value', !!input.value);
  if (clear) clear.hidden = !input.value;
  paintPlaceholder();
  if (q === state.query) return;
  state.query = q;
  if (!q) { draw(); paintCrumb(); return; }
  drawSearch();
}

function clearSearch() {
  const input = $('searchInput');
  if (!input) return;
  input.value = '';
  state.query = '';
  onSearchInput();
  paintCrumb();
  input.focus();
}

/* ---------- 8.3 拖拽 ----------
   铁律：内部拖拽只用私有 MIME，绝不用 text/plain / text/uri-list。
   旧版本正是因为用了 text/plain，浏览器把内部拖动当成「从外面拖进来
   一个链接」，结果拖图标变成导布局 —— 那个 bug 就是这么来的。 */
const BD_DRAG = 'application/x-bd-node';
const DRAG_CLASSES = ['dragging', 'drop-active', 'insert-before', 'insert-after', 'drop-target'];

function beginDrag(e, node) {
  state.dragNode = node;
  try {
    e.dataTransfer.setData(BD_DRAG, String((node && node.id) || ''));
    e.dataTransfer.effectAllowed = 'move';
  } catch { /* 少数环境不给 setData */ }
  document.body.classList.add('is-dragging');
}

function endDrag() {
  state.dragNode = null;
  document.body.classList.remove('is-dragging');
  setDropHint(false);
  clearDragMarks();
}

function clearDragMarks(root) {
  const scope = root || document;
  DRAG_CLASSES.slice(1).forEach((cls) => {
    scope.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
  });
  scope.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
}

function bindItemDrag(el, node) {
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    beginDrag(e, node);
    e.stopPropagation();
  });
  el.addEventListener('dragend', endDrag);
}

function bindSubDrag(el, node) {
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    beginDrag(e, node);
    e.stopPropagation();
  });
  el.addEventListener('dragend', endDrag);
}

function bindTrayDrag(el, node) {
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    beginDrag(e, node);
    e.stopPropagation();
  });
  el.addEventListener('dragend', endDrag);
}

/* 卡片标题栏是把手：落到别的卡片左/右窄边 = 换位置，落到中间 = 挪进去 */
const ZONE_EDGE = 0.28;
const ZONE_EDGE_MAX = 130;

function zoneEdgeOf(zone, x) {
  const r = zone.getBoundingClientRect();
  const edge = Math.min(r.width * ZONE_EDGE, ZONE_EDGE_MAX);
  if (x - r.left <= edge) return 'before';
  if (r.right - x <= edge) return 'after';
  return '';
}

function bindZoneDrag(head, zone, node) {
  head.addEventListener('dragstart', (e) => {
    zone.classList.add('dragging');
    beginDrag(e, node);
    e.stopPropagation();
  });
  head.addEventListener('dragend', endDrag);
  head.addEventListener('dragenter', (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
  });
}

function bindZoneDrop(zone, node) {
  zone.addEventListener('dragover', (e) => {
    const src = state.dragNode;
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    const srcIsFolder = !src.url;
    const edge = srcIsFolder && !zone.classList.contains('dragging') ? zoneEdgeOf(zone, e.clientX) : '';
    zone.classList.toggle('insert-before', edge === 'before');
    zone.classList.toggle('insert-after', edge === 'after');
    zone.classList.toggle('drop-active', !edge);
  });
  zone.addEventListener('dragleave', (e) => {
    if (zone.contains(e.relatedTarget)) return;
    zone.classList.remove('drop-active', 'insert-before', 'insert-after');
  });
  zone.addEventListener('drop', (e) => {
    const src = state.dragNode;
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();

    const edge = (!src.url && !zone.classList.contains('dragging')) ? zoneEdgeOf(zone, e.clientX) : '';
    endDrag();
    if (src.id === node.id) return;
    // 落点是「未分组」这种虚拟卡：目标是它所在的文件夹
    const targetId = node.id && String(node.id).startsWith('__loose__') ? null : node.id;

    if (edge && targetId) { reorderZone(src, node, edge); return; }
    moveInto(src, targetId);
  });
}

/* 拖到子文件夹那一行：优先「移进那个子文件夹」，不会误判成换位置 */
function bindZoomFolderDrop(el, node) {
  el.addEventListener('dragover', (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('drop-active');
  });
  el.addEventListener('dragleave', (e) => {
    if (el.contains(e.relatedTarget)) return;
    el.classList.remove('drop-active');
  });
  el.addEventListener('drop', (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
    e.stopPropagation();
    const src = state.dragNode;
    endDrag();
    moveInto(src, node.id);
  });
}

/* 桌面上的卡片：拖到卡片空白处 = 挪进这个文件夹 */
function bindStageDrop() {
  const stage = $('stage');
  if (!stage) return;
  stage.addEventListener('dragover', (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    stage.classList.add('drop-active');
  });
  stage.addEventListener('dragleave', (e) => {
    if (stage.contains(e.relatedTarget)) return;
    stage.classList.remove('drop-active');
  });
  stage.addEventListener('drop', (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
    e.stopPropagation();
    const src = state.dragNode;
    endDrag();
    const here = current();
    moveInto(src, here && here.id);
  });
}

/* 是不是「自己或自己的子孙」—— 拖进去会成环 */
function isSelfOrDescendant(node, targetId) {
  if (!node || !targetId) return false;
  if (String(node.id) === String(targetId)) return true;
  let p = state.byId.get(targetId);
  while (p) {
    if (String(p.id) === String(node.id)) return true;
    p = p.parentId ? state.byId.get(p.parentId) : null;
  }
  return false;
}

/* 移动一条书签 / 一个文件夹到目标文件夹的末尾 */
async function moveInto(src, targetId, opts) {
  if (!src) return;
  const node = src.url ? src : (state.byId.get(src.id) || src);
  if (!targetId) return;
  const target = state.byId.get(targetId);
  if (!target) return;
  if (isSelfOrDescendant(node, targetId)) { toast(node.url ? '已经在这里了' : '不能拖进自己里面'); return; }

  if (!node.url && opts && opts.beforeSetup) return;

  if (!HAS_BOOKMARKS) { toast('预览模式不能拖动'); return; }
  try {
    const index = (target.children || []).length;
    await chrome.bookmarks.move(node.id, { parentId: targetId, index });
    toast(`已移到「${target.title || '书签栏'}」`);
    await refresh();
  } catch {
    toast('移动失败');
  }
}

/* 拖卡片标题栏到另一张卡片左右两侧：交换先后 */
async function reorderZone(src, target, edge) {
  if (!src || src.url) return;
  if (src.id === target.id) return;
  if (!HAS_BOOKMARKS) { toast('预览模式不能拖动'); return; }
  try {
    const parent = state.byId.get(src.parentId);
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

    // 一步步换到位：chrome.bookmarks 没有「批量重排」，只能按最终顺序逐个 move
    for (let i = 0; i < list.length; i += 1) {
      const id = list[i];
      const node = state.byId.get(id);
      if (node && childrenOf(parent).findIndex((c) => c.id === id) === i) continue;
      await chrome.bookmarks.move(id, { parentId: parent.id, index: i });
    }
    const targetNode = state.byId.get(target.id);
    toast(`已调到「${targetNode ? targetNode.title : ''}」${edge === 'before' ? '前面' : '后面'}`);
    await refresh();
  } catch {
    toast('调整顺序失败');
  }
}

/* 置顶图标拖到两个图标之间任意排序（不是两两互换） */
function bindTrayDrop() {
  const apps = $('trayApps');
  if (!apps) return;
  apps.addEventListener('dragover', (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest ? e.target.closest('.tray-app') : null;
    apps.querySelectorAll('.tray-app').forEach((el) => el.classList.remove('insert-before', 'insert-after'));
    if (!target || target.classList.contains('dragging')) return;
    const r = target.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    target.classList.toggle('insert-before', before);
    target.classList.toggle('insert-after', !before);
  });
  apps.addEventListener('dragleave', (e) => {
    if (apps.contains(e.relatedTarget)) return;
    apps.querySelectorAll('.tray-app').forEach((el) => el.classList.remove('insert-before', 'insert-after'));
  });
  apps.addEventListener('drop', async (e) => {
    if (!state.dragNode) return;
    e.preventDefault();
    e.stopPropagation();
    const srcId = state.dragNode.id;
    const target = e.target.closest ? e.target.closest('.tray-app') : null;
    let at = null;
    if (target) {
      const before = target.classList.contains('insert-before');
      at = trayIndexOf(target.dataset.fid, before ? 0 : 1);
    }
    endDrag();
    if (!isPinned(srcId)) return;
    await moveIcon(srcId, at);
  });
}

function trayIndexOf(fid, offset) {
  const list = state.icons || [];
  for (let i = 0; i < list.length; i += 1) {
    const n = resolveIconEntry(list[i]);
    if (n && hexId(n.id) === fid) return i + offset;
  }
  return null;
}

function isPinned(id) {
  return (state.icons || []).some((entry) => {
    const n = resolveIconEntry(entry);
    return n && String(n.id) === String(id);
  });
}

/* 把置顶图标挪到第 at 位；at=null 表示挪到最末 */
async function moveIcon(id, at) {
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
  paintTray();
}

/* 从网页里拖链接进来：落在哪张卡片 / 哪个子文件夹，就在那里新建书签 */
function bindExternalLinkDrop() {
  document.addEventListener('dragover', (e) => {
    if (state.dragNode) return;
    const types = (e.dataTransfer && e.dataTransfer.types) || [];
    const hasFile = Array.prototype.indexOf.call(types, 'Files') >= 0;
    const hasLink = Array.prototype.indexOf.call(types, 'text/uri-list') >= 0
      || Array.prototype.indexOf.call(types, 'text/plain') >= 0;
    if (!hasFile && !hasLink) return;
    e.preventDefault();
    setDropHint(true);
  });
}

/* ---------- 8.4 右键菜单 ---------- */
function showMenu(x, y, items) {
  const ctx = $('ctx');
  if (!ctx) return;
  ctx.innerHTML = '';
  items.forEach((it) => {
    if (it === '-') { ctx.appendChild(document.createElement('hr')); return; }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.label;
    if (it.on) b.classList.add('on');
    if (it.danger) b.classList.add('danger');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      hideCtx();
      Promise.resolve().then(() => it.run()).catch(() => {});
    });
    ctx.appendChild(b);
  });
  ctx.hidden = false;
  const w = ctx.offsetWidth || 180;
  const h = ctx.offsetHeight || 150;
  ctx.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 10))}px`;
  ctx.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 10))}px`;
  ctx.dataset.open = '1';
}

function hideCtx() {
  const ctx = $('ctx');
  if (ctx) { ctx.hidden = true; ctx.dataset.open = ''; }
}

/* 置顶图标的右键 */
function showTrayMenu(node, x, y) {
  showMenu(x, y, [
    { label: '打开', run: () => openUrl(node.url, false) },
    { label: '在新标签页打开', run: () => openUrl(node.url, true) },
    '-',
    { label: '取消置顶', run: () => unpinIcon(node) },
  ]);
}

/* 书签的右键：显示方式 / 置顶 / 复制 / 编辑删除 */
function showItemMenu(node, x, y) {
  const mode = modeOf(node);
  const explicit = isMode(state.views.items[node.id]);
  showMenu(x, y, [
    { label: '打开', run: () => openUrl(node.url, false) },
    { label: '在新标签页打开', run: () => openUrl(node.url, true) },
    '-',
    { label: '以图标显示', on: mode === MODE_ICON, run: () => setItemMode(node, MODE_ICON) },
    { label: '以列表显示', on: mode === MODE_LIST, run: () => setItemMode(node, MODE_LIST) },
    ...(explicit ? [{ label: '恢复自动显示', run: () => resetItemMode(node) }] : []),
    '-',
    { label: isPinned(node.id) ? '已在桌面上' : '置顶到桌面图标', run: () => pinIcon(node) },
    { label: '复制地址', run: async () => { const ok = await copyText(node.url); toast(ok ? '地址已复制' : '复制失败'); } },
    '-',
    { label: '重命名', run: () => renameNode(node) },
    { label: '删除', danger: true, run: () => removeNode(node) },
  ]);
}

/* 文件夹的右键 */
function showFolderMenu(node, x, y) {
  const mode = modeOf(node);
  const isReal = state.byId.has(node.id);
  const items = [
    { label: '打开', run: () => enter(node) },
  ];
  if (isReal) {
    items.push(
      '-',
      { label: '新建书签', run: () => createBookmark(node) },
      { label: '新建子文件夹', run: () => createFolder(node) },
      '-',
      { label: '图标显示', on: mode === MODE_ICON, run: () => setFolderModeThen(node, MODE_ICON) },
      { label: '列表显示', on: mode === MODE_LIST, run: () => setFolderModeThen(node, MODE_LIST) },
      { label: '按名称排序', run: () => sortFolder(node) },
      '-',
      { label: '重命名', run: () => renameNode(node) },
      { label: '删除', danger: true, run: () => removeNode(node) },
    );
  }
  showMenu(x, y, items);
}

async function setFolderModeThen(node, mode) {
  await setFolderMode(node, mode);
  render();
}

async function setItemMode(node, mode) {
  state.views.items[node.id] = mode;
  await storeSet('views', state.views);
  render();
}

async function resetItemMode(node) {
  delete state.views.items[node.id];
  await storeSet('views', state.views);
  render();
}

async function pinIcon(node) {
  if (isPinned(node.id)) { toast('已经在桌面上了'); return; }
  state.icons = (state.icons || []).concat([{
    id: node.id, url: node.url, title: node.title, iconUrl: node.iconUrl || '',
  }]);
  await storeSet('icons', state.icons);
  paintTray();
  toast('已置顶');
}

async function unpinIcon(node) {
  const before = (state.icons || []).length;
  state.icons = (state.icons || []).filter((entry) => {
    if (!entry) return false;
    if (entry.url) return String(entry.url) !== String(node.url);
    return String(entry.id) !== String(node.id);
  });
  if (state.icons.length === before) return;
  await storeSet('icons', state.icons);
  paintTray();
  toast('已取消置顶');
}

/* ---------- 8.5 书签的增删改 ---------- */
function promptText(title, value) {
  return new Promise((resolve) => {
    const box = $('modal');
    const titleEl = $('modalTitle');
    const body = $('modalBody');
    const ok = $('modalOk');
    const cancel = $('modalCancel');
    if (!box || !body || !ok || !cancel) { resolve(window.prompt(title, value || '') || null); return; }

    if (titleEl) titleEl.textContent = title;
    body.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'modal-input';
    input.type = 'text';
    input.value = value || '';
    input.spellcheck = false;
    body.appendChild(input);
    box.hidden = false;
    input.focus();
    input.select();

    const done = (v) => {
      box.hidden = true;
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onOk = () => done(input.value.trim());
    const onCancel = () => done(null);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}

async function createFolder(parent) {
  if (!HAS_BOOKMARKS) { toast('预览模式不能新建'); return; }
  const name = await promptText('新文件夹的名字', '');
  if (!name) return;
  try {
    await chrome.bookmarks.create({ parentId: parent.id, title: name });
    await refresh();
    toast(`已新建「${name}」`);
  } catch {
    toast('新建失败');
  }
}

async function createBookmark(parent) {
  if (!HAS_BOOKMARKS) { toast('预览模式不能新建'); return; }
  const title = await promptText('书签名字', '');
  if (title == null) return;
  const url = await promptText('书签地址', 'https://');
  if (!url) return;
  try {
    await chrome.bookmarks.create({ parentId: parent.id, title: title || url, url: withScheme(url) });
    await refresh();
    toast('已新建书签');
  } catch {
    toast('新建失败，地址是不是写错了');
  }
}

async function renameNode(node) {
  if (!HAS_BOOKMARKS) { toast('预览模式不能改名'); return; }
  const name = await promptText('改成什么名字', node.title || '');
  if (name == null) return;
  try {
    await chrome.bookmarks.update(node.id, { title: name });
    await refresh();
  } catch {
    toast('改名失败');
  }
}

async function removeNode(node) {
  if (!HAS_BOOKMARKS) { toast('预览模式不能删除'); return; }
  const what = node.url ? '书签' : '文件夹（连同里面的东西）';
  if (!window.confirm(`删除这个${what}？删了就找不回来了。`)) return;
  try {
    await chrome.bookmarks.removeTree(node.id);
    await refresh();
    toast('已删除');
  } catch {
    toast('删除失败');
  }
}

async function sortFolder(node) {
  if (!HAS_BOOKMARKS) { toast('预览模式不能排序'); return; }
  try {
    const kids = (await chrome.bookmarks.getChildren(node.id)) || [];
    const sorted = kids.slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh'));
    for (let i = 0; i < sorted.length; i += 1) {
      await chrome.bookmarks.move(sorted[i].id, { parentId: node.id, index: i });
    }
    await refresh();
    toast('已按名称排序');
  } catch {
    toast('排序失败');
  }
}

/* ---------- 8.6 渲染与刷新 ---------- */
/* 记下焦点再画，画完还回去 —— 否则每次书签变化都会把键盘的人踢回页首 */
function focusToken() {
  const a = document.activeElement;
  if (!a || a === document.body) return '';
  if (a.closest) {
    const host = a.closest('[data-fid]');
    if (host) return host.dataset.fid;
  }
  return a.id ? `#${a.id}` : '';
}

function restoreFocus(token) {
  if (!token) return;
  if (token[0] === '#') {
    const el = $(token.slice(1));
    if (el) el.focus();
    return;
  }
  const el = document.querySelector(`[data-fid="${token}"]`);
  if (el && el.focus) el.focus();
}

function render() {
  const token = focusToken();
  if (state.query) drawSearch(); else draw();
  paintCrumb();
  paintTray();
  if (token) restoreFocus(token);
  if (state.zoom && state.byId.has(state.zoom.id)) openZoom(state.byId.get(state.zoom.id));
}

/* 书签被外部改动（增删改、拖动）时重读整棵树 */
async function refresh() {
  state.lastFocus = focusToken();
  await loadTree();
  state.path = state.path.map((n) => state.byId.get(n.id)).filter(Boolean);
  if (state.zoom) {
    state.zoom = state.byId.get(state.zoom.id) || null;
    if (!state.zoom) closeZoom();
  }
  render();
  if (state.lastFocus) restoreFocus(state.lastFocus);
}

let refreshTick = 0;
function scheduleRefresh() {
  clearTimeout(refreshTick);
  refreshTick = setTimeout(() => { refresh().catch(() => {}); }, 120);
}

/* ---------- 8.7 快捷键卡 ---------- */
function toggleKeyHint(force) {
  const card = $('helpCard');
  if (!card) return;
  card.hidden = force == null ? !card.hidden : !force;
}

/* ---------- 8.8 键盘导航 ----------
   方向键按几何位置找最近的一个，不按 DOM 顺序瞎走 */
function kbTargets() {
  const scope = $('folderZoom') && !$('folderZoom').hidden
    ? $('folderZoomCard')
    : $('zones');
  if (!scope) return [];
  return [...scope.querySelectorAll('.item, .subfolder, .zoom-folder, .tray-app, .zone-head.openable')]
    .filter((el) => el.offsetParent !== null || el.getClientRects().length);
}

function moveFocus(dir) {
  const list = kbTargets();
  if (!list.length) return;
  const active = document.activeElement;
  const cur = list.indexOf(active);
  if (cur < 0) { list[0].focus(); return; }
  const r = active.getBoundingClientRect();
  const ax = r.left + r.width / 2;
  const ay = r.top + r.height / 2;
  let best = -1;
  let bestScore = Infinity;
  list.forEach((el, i) => {
    if (i === cur) return;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
    if (!ok) return;
    const score = dir === 'left' || dir === 'right'
      ? Math.abs(dx) + Math.abs(dy) * 3
      : Math.abs(dy) + Math.abs(dx) * 3;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) list[best].focus();
}

/* 只有键盘操作才画焦点环，鼠标点完不闪 */
function bindKeyboardFocusRing() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') document.body.classList.add('kb-mode');
  }, true);
  document.addEventListener('mousedown', () => document.body.classList.remove('kb-mode'), true);
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el || !el.classList) return;
    const ring = document.body.classList.contains('kb-mode');
    ['item', 'subfolder', 'zoom-folder', 'tray-app', 'zone-head'].forEach((cls) => {
      document.querySelectorAll(`.${cls}.kb-focus`).forEach((n) => { if (n !== el) n.classList.remove('kb-focus'); });
    });
    if (ring && /item|subfolder|zoom-folder|tray-app|zone-head/.test(el.className)) el.classList.add('kb-focus');
    else el.classList.remove('kb-focus');
  });
}

/* 统一的「一层层退回去」：菜单 → 弹层 → 放大层 → 搜索 */
function escLayer() {
  const ctx = $('ctx');
  if (ctx && !ctx.hidden) { hideCtx(); return true; }

  const modal = $('modal');
  if (modal && !modal.hidden) {
    const cancel = $('modalCancel');
    if (cancel) cancel.click();
    return true;
  }

  const sync = $('syncPanel');
  if (sync && !sync.hidden) { toggleSyncPanel(false); return true; }

  const wp = $('wpPanel');
  if (wp && !wp.hidden) { hideWallpaper(); return true; }

  const help = $('helpCard');
  if (help && !help.hidden) { toggleKeyHint(false); return true; }

  const engineMenu = $('engineMenu');
  if (engineMenu && !engineMenu.hidden) { engineMenu.hidden = true; return true; }

  const zoom = $('folderZoom');
  if (zoom && !zoom.hidden) {
    const node = state.zoom;
    const parent = node && node.parentId ? state.byId.get(node.parentId) : null;
    if (parent && parent !== state.bar) openZoom(parent); else closeZoom();
    return true;
  }

  const input = $('searchInput');
  if (input && input.value) { clearSearch(); return true; }
  return false;
}

/* ---------------- 9. 启动 ---------------- */

async function init() {
  const t = $('clockTime');
  if (t) {
    tickClock();
    setInterval(tickClock, 10000);
  }

  // 偏好
  state.engine = await storeGet('engine', 'bing');
  state.wallBlur = await storeGet('wallBlur', 'mid');
  const icons = await storeGet('icons', []);
  state.icons = Array.isArray(icons) ? icons : [];
  const views = await storeGet('views', null);
  state.views = (views && views.folders && views.items) ? views : { v: 1, folders: {}, items: {} };
  if (!state.views.items) state.views.items = {};
  if (!state.views.folders) state.views.folders = {};
  state.bingDay = Number(await storeGet('bingDay', 0)) || 0;

  paintEngine();
  buildWallpaperPanel();

  await loadTree();
  render();

  // 壁纸：必应要先把选中的那张找回来
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
  applyWallpaper(savedWall === 'bing' && !state.wallpaperBing ? 'aurora' : savedWall);

  bindUI();

  if (HAS_BOOKMARKS && chrome.bookmarks) {
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].forEach((ev) => {
      if (chrome.bookmarks[ev]) chrome.bookmarks[ev].addListener(() => scheduleRefresh());
    });
  }
  if (HAS_CHROME && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(() => {});
  }
}

function bindUI() {
  // 壁纸面板
  const btnWallpaper = $('btnWallpaper');
  if (btnWallpaper) {
    btnWallpaper.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWallpaperPanel();
    });
  }
  const daily = $('wpBingDaily');
  if (daily) daily.addEventListener('click', (e) => { e.stopPropagation(); useTodayBing(); });

  // 搜索引擎
  const engineBtn = $('engineBtn');
  const engineMenu = $('engineMenu');
  if (engineBtn && engineMenu) {
    engineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      engineMenu.hidden = !engineMenu.hidden;
    });
  }

  // 搜索框
  const input = $('searchInput');
  const clear = $('searchClear');
  if (input) {
    input.addEventListener('input', onSearchInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });
  }
  if (clear) {
    clear.addEventListener('click', (e) => { e.stopPropagation(); clearSearch(); });
  }

  // 帮助卡
  const helpBtn = $('btnHelp');
  if (helpBtn) helpBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleKeyHint(); });
  const helpClose = $('helpClose');
  if (helpClose) helpClose.addEventListener('click', () => toggleKeyHint(false));

  // 新建分组
  const btnNewFolder = $('btnNewFolder');
  if (btnNewFolder) {
    btnNewFolder.addEventListener('click', async (e) => {
      e.stopPropagation();
      const here = current();
      await createFolder(here || state.bar);
    });
  }

  // 布局同步面板
  const btnSync = $('btnSync');
  if (btnSync) btnSync.addEventListener('click', (e) => { e.stopPropagation(); toggleSyncPanel(); });
  const syncClose = $('syncClose');
  if (syncClose) syncClose.addEventListener('click', (e) => { e.stopPropagation(); toggleSyncPanel(false); });

  const syncCopy = $('syncCopy');
  if (syncCopy) {
    syncCopy.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copyText(JSON.stringify(buildLayout(), null, 2));
      toast(ok ? '布局 JSON 已复制' : '复制失败');
    });
  }
  const syncDownload = $('syncDownload');
  if (syncDownload) {
    syncDownload.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadLayout(buildLayout());
      toast('已存成文件');
    });
  }
  const syncShare = $('syncShare');
  if (syncShare) {
    syncShare.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const text = await packLayout(buildLayout());
        const ok = await copyText(text);
        toast(ok ? `分享文本已复制（${text.length} 字）` : '复制失败');
      } catch {
        toast('生成分享文本失败');
      }
    });
  }
  const syncFile = $('syncFile');
  const syncFileInput = $('syncFileInput');
  if (syncFile && syncFileInput) {
    syncFile.addEventListener('click', (e) => { e.stopPropagation(); syncFileInput.click(); });
    syncFileInput.addEventListener('change', async () => {
      const f = syncFileInput.files && syncFileInput.files[0];
      syncFileInput.value = '';
      if (f) await importLayoutFile(f);
    });
  }
  const syncInput = $('syncInput');
  const syncApply = $('syncApply');
  if (syncApply && syncInput) {
    syncApply.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = String(syncInput.value || '').trim();
      if (!text) { toast('先粘一段布局进来'); return; }
      await startPreview(text);
    });
  }
  // 「确认覆盖」：预览出来之后再点一次才真的写
  const preview = $('syncPreview');
  if (preview) {
    preview.addEventListener('click', async (e) => {
      const btn = e.target.closest ? e.target.closest('.sync-apply-go') : null;
      if (!btn || !pendingLayout) return;
      const plan = pendingLayout;
      pendingLayout = null;
      await applyResolvedLayout(plan);
      toggleSyncPanel(false);
    });
  }

  // 点空白：收起所有浮层
  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    const inside = (sel) => t && t.closest && t.closest(sel);
    if (!inside('.ctx')) hideCtx();
    if (!inside('.wp-panel') && !inside('#btnWallpaper')) hideWallpaper();
    if (!inside('.help-card') && !inside('#btnHelp')) toggleKeyHint(false);
    if (!inside('.search')) { const m = $('engineMenu'); if (m) m.hidden = true; }
  });

  // 键盘
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /^(INPUT|TEXTAREA)$/.test(tag);

    if (e.key === 'Escape') {
      if (escLayer()) { e.preventDefault(); }
      return;
    }
    if (typing) return;

    if (e.key === '/') { e.preventDefault(); if (input) input.focus(); return; }
    if (e.key === '?' ) { e.preventDefault(); toggleKeyHint(); return; }
    if (e.key === 'Backspace') {
      if (state.zoom) { e.preventDefault(); goBack(); }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      e.preventDefault();
      moveFocus(dir);
      return;
    }
    if (e.key === 'F10' && e.shiftKey) {
      const a = document.activeElement;
      if (a && a.getBoundingClientRect) {
        e.preventDefault();
        const r = a.getBoundingClientRect();
        a.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12,
        }));
      }
    }
  });

  bindKeyboardFocusRing();
  bindStageDrop();
  bindTrayDrop();
  bindExternalLinkDrop();

  // 拖文件进来：只认 .json / .txt 布局
  document.addEventListener('dragover', (e) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    setDropHint(true);
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget) return;
    setDropHint(false);
  });
  document.addEventListener('drop', async (e) => {
    if (state.dragNode) { endDrag(); return; }
    const types = (e.dataTransfer && e.dataTransfer.types) || [];
    const hasFile = Array.prototype.indexOf.call(types, 'Files') >= 0;
    if (hasFile) {
      e.preventDefault();
      setDropHint(false);
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) await importLayoutFile(file);
      return;
    }
    // 外部链接：落点所在的文件夹里新建一条书签
    const link = e.dataTransfer && (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
    if (!link) return;
    e.preventDefault();
    setDropHint(false);
    await dropLink(link, e.target);
  });

  document.addEventListener('dragend', endDrag);
  window.addEventListener('blur', endDrag);
  window.addEventListener('resize', () => { if (state.zoom) openZoom(state.zoom); });

  // 放大层：点背景关（只绑一次）
  const backdrop = $('folderZoomBackdrop');
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = '1';
    backdrop.addEventListener('click', () => closeZoom());
  }

  // 桌面空白双击 / 单机 Esc 缩回上一层
  const stage = $('stage');
  if (stage) {
    stage.addEventListener('dblclick', (e) => {
      if (e.target === stage || (e.target.classList && e.target.classList.contains('zones'))) {
        state.path = [];
        closeZoom();
        draw();
        paintCrumb();
      }
    });
  }
}

/* 从网页拖一条链接进来：落点在哪个子文件夹 / 卡片里，就放进哪个文件夹 */
async function dropLink(link, targetEl) {
  const url = String(link).split('\n')[0].trim();
  if (!/^[a-z]+:\/\//i.test(url) && !looksLikeUrl(url)) { toast('这不是一个网址'); return; }
  if (looksLikeLayout(url)) { await startPreview(url); return; }
  if (!HAS_BOOKMARKS) { toast('预览模式不能新建'); return; }

  let parentId = state.bar ? state.bar.id : null;
  const host = targetEl && targetEl.closest ? targetEl.closest('[data-fid]') : null;
  if (host) {
    const hit = [...state.byId.values()].find((n) => hexId(n.id) === host.dataset.fid);
    if (hit) parentId = hit.url ? (hit.parentId || parentId) : hit.id;
  }
  try {
    await chrome.bookmarks.create({ parentId, title: url.replace(/^[a-z]+:\/\/(www\.)?/i, ''), url: withScheme(url) });
    await refresh();
    toast('已添加书签');
  } catch {
    toast('添加失败');
  }
}

function main() {
  (function stampBuild() {
    const el = $('build');
    let ver = '2.0.2';
    let mode = HAS_CHROME ? '扩展' : '预览';
    if (HAS_CHROME && chrome.runtime && chrome.runtime.getManifest) {
      try { ver = chrome.runtime.getManifest().version; } catch { /* 用兜底 */ }
    }
    if (el) el.textContent = `v${ver} · ${mode}`;
  })();

  init().catch((err) => {
    console.error('[书签桌面] 启动失败', err);
    const empty = $('empty');
    const title = $('emptyTitle');
    const sub = $('emptySub');
    if (empty) empty.hidden = false;
    if (title) title.textContent = '出了点问题';
    if (sub) sub.textContent = String((err && err.message) || err);
  });
}

main();
