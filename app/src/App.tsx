/** 页面外壳：壁纸、顶栏、面包屑、置顶栏、舞台，以及各种浮层。
 *  这里只负责「按老版本 body 的顺序把块摆出来」，具体内容各自组件管。 */
import { useEffect, type CSSProperties } from 'react';
import { WALLPAPERS, WALL_BLURS } from './lib/constants';
import { storeGet } from './lib/chrome';
import { loadPrefs, loadTree } from './lib/tree';
import { bump, state, useApp } from './lib/store';
import { Topbar } from './components/topbar/Topbar';
import { Crumb } from './components/board/Crumb';
import { Tray } from './components/board/Tray';
import { Stage } from './components/board/Stage';
import { Build, DropHint, HelpButton, HelpCard, Toast } from './components/shell/small';
import { ZoomLayer } from './components/board/ZoomLayer';
import { Ctx } from './components/shell/Ctx';
import { Modal } from './components/shell/Modal';
import { installDrag } from './lib/drag';
import { installKeyboard } from './lib/keys';
import { watchBookmarks } from './lib/actions';
import { ensureBingWallpaper } from './lib/bing';
import { restorePaperTint } from './lib/tint';
import { applyWallpaper } from './lib/wallpaper';
import { closeCtx } from './lib/actions';
import { hideSyncPanel, hideWallpaper } from './lib/actions';
import { WallpaperPanel } from './components/panels/WallpaperPanel';
import { SyncPanel } from './components/panels/SyncPanel';

/** 壁纸：老版本是往 #bg 上写一串 inline style，这里算成同一个 style 对象 */
function wallpaperStyle(): { style: CSSProperties; light: boolean } {
  const b = WALL_BLURS.find((x) => x.id === state.wallBlur) || WALL_BLURS[2];
  // 模糊会从边缘漏出虚边，放大一点刚好盖住
  const style: CSSProperties = {
    filter: b.px ? `blur(${b.px}px)` : '',
    transform: b.px ? 'scale(1.08)' : '',
  };

  if (state.wallpaper === 'bing' && state.wallpaperBing) {
    return {
      style: {
        ...style,
        backgroundColor: '#10131c',
        backgroundImage: `url("${state.wallpaperBing}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      },
      light: false,
    };
  }

  const wp = WALLPAPERS.find((w) => w.id === state.wallpaper) || WALLPAPERS[0];
  return { style: { ...style, background: wp.css }, light: wp.light };
}

export default function App() {
  const s = useApp();
  const { style, light } = wallpaperStyle();

  /* 启动：跟老版本 init() 一个顺序 —— 偏好 → 树 → 壁纸 → 挂事件 */
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadPrefs();
      await loadTree();
      /* 壁纸：老版本 init() 的顺序 —— 先找回必应那张，再恢复上次的纸色，
         最后套壁纸（套的那一步会按新壁纸重算纸色）。 */
      const saved = await storeGet<string>('wallpaper', 'aurora');
      if (saved === 'bing') {
        try {
          await ensureBingWallpaper();
        } catch {
          /* 取不到就退回渐变，不影响首屏 */
        }
      }
      restorePaperTint(await storeGet('paperTint', null));
      await applyWallpaper(saved === 'bing' && !state.wallpaperBing ? 'aurora' : saved);
      if (!alive) return;
      state.ready = true;
      bump();
    })().catch((err) => {
      console.error('[书签桌面] 启动失败', err);
      state.ready = true;
      state.bootError = String((err && err.message) || err);
      bump();
    });
    return () => {
      alive = false;
    };
  }, []);

  /* 拖动 + 点空白处收浮层：老版本 bindUI() 里的那几件事 */
  useEffect(() => {
    installDrag();
    installKeyboard();
    watchBookmarks();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      let dirty = false;
      if (!t.closest('#engineMenu, #engineBtn') && state.engineMenu) {
        state.engineMenu = false;
        dirty = true;
      }
      if (!t.closest('#wpPanel, #btnWallpaper') && state.wpPanel) {
        hideWallpaper();
        dirty = true;
      }
      if (!t.closest('#syncPanel, #btnSync') && state.syncPanel) {
        hideSyncPanel();
        dirty = true;
      }
      if (!t.closest('#helpCard, #btnHelp') && state.helpCard) {
        state.helpCard = false;
        dirty = true;
      }
      if (!t.closest('#ctx') && state.ctx) {
        closeCtx();
        dirty = true;
      }
      if (dirty) bump();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, []);

  /* body[data-light] 是老 CSS 的开关：浅色壁纸下换一套文字色 */
  useEffect(() => {
    document.body.dataset.light = light ? '1' : '0';
    state.light = light;
  }, [light]);

  if (!s.ready) {
    return <div className="bg" id="bg" style={style} />;
  }

  return (
    <>
      <div className="bg" id="bg" style={style} />
      <div className="bg-grain" />
      <Topbar />
      <Crumb />
      <HelpButton />
      <HelpCard />
      <Tray />
      <Stage />
      <ZoomLayer />
      <Ctx />
      <Modal />
      <WallpaperPanel />
      <SyncPanel />
      <DropHint />
      <Toast />
      <Build />
    </>
  );
}
