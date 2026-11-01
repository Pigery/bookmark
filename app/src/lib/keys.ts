/** 键盘：方向键按几何位置找最近的一个，`/` 进搜索，Esc 一层层退。
 *  老版本是 append 在 bindUI() 末尾的一段，这里拆成独立模块，App 挂一次。 */
import { bump, state } from './store';
import { clearSearch, closeZoom, goBack, openZoom } from './nav';
import { closeCtx, toggleKeyHint, toggleSyncPanel } from './actions';
import { hideWallpaper } from './actions';

/** 当前该在哪个范围里走：放大层开着就在放大层的卡里，否则在舞台上 */
function kbTargets(): HTMLElement[] {
  const zoom = document.getElementById('folderZoom');
  const scope = zoom && !zoom.hidden ? document.getElementById('folderZoomCard') : document.getElementById('zones');
  if (!scope) return [];
  return Array.from(
    scope.querySelectorAll<HTMLElement>('.item, .subfolder, .zoom-folder, .tray-app, .zone-head.openable'),
  ).filter((el) => el.offsetParent !== null || el.getClientRects().length);
}

export function moveFocus(dir: 'left' | 'right' | 'up' | 'down'): void {
  const list = kbTargets();
  if (!list.length) return;
  const active = document.activeElement as HTMLElement | null;
  const cur = active ? list.indexOf(active) : -1;
  if (cur < 0) {
    list[0].focus();
    return;
  }
  const r = active!.getBoundingClientRect();
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
    const ok =
      dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
    if (!ok) return;
    const score =
      dir === 'left' || dir === 'right' ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best >= 0) list[best].focus();
}

/** 统一的一层层退：菜单 → 弹窗 → 同步面板 → 壁纸面板 → 快捷键卡 → 引擎菜单 → 放大层 → 搜索 */
function escLayer(): boolean {
  if (state.ctx) {
    closeCtx();
    return true;
  }
  if (state.modal) {
    state.modal.resolve(null);
    return true;
  }
  if (state.syncPanel) {
    toggleSyncPanel(false);
    return true;
  }
  if (state.wpPanel) {
    hideWallpaper();
    return true;
  }
  if (state.helpCard) {
    toggleKeyHint(false);
    return true;
  }
  if (state.engineMenu) {
    state.engineMenu = false;
    bump();
    return true;
  }
  if (state.zoom) {
    const node = state.zoom;
    const parent = node.parentId ? state.byId.get(String(node.parentId)) : null;
    if (parent && parent !== state.bar) openZoom(parent);
    else closeZoom();
    return true;
  }
  if (state.query) {
    clearSearch();
    return true;
  }
  return false;
}

/** 只有键盘操作才画焦点环，鼠标点完不闪 */
function bindFocusRing(): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') document.body.classList.add('kb-mode');
    },
    true,
  );
  document.addEventListener('mousedown', () => document.body.classList.remove('kb-mode'), true);
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.classList) return;
    const ring = document.body.classList.contains('kb-mode');
    ['item', 'subfolder', 'zoom-folder', 'tray-app', 'zone-head'].forEach((cls) => {
      document.querySelectorAll(`.${cls}.kb-focus`).forEach((n) => {
        if (n !== el) n.classList.remove('kb-focus');
      });
    });
    if (ring && /item|subfolder|zoom-folder|tray-app|zone-head/.test(el.className)) el.classList.add('kb-focus');
    else el.classList.remove('kb-focus');
  });
}

let installed = false;

export function installKeyboard(): void {
  if (installed) return;
  installed = true;
  bindFocusRing();

  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /^(INPUT|TEXTAREA)$/.test(tag);

    if (e.key === 'Escape') {
      if (escLayer()) e.preventDefault();
      return;
    }
    if (typing) return;

    const input = document.getElementById('searchInput') as HTMLInputElement | null;
    if (e.key === '/') {
      e.preventDefault();
      input?.focus();
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      toggleKeyHint();
      return;
    }
    if (e.key === 'Backspace') {
      if (state.zoom) {
        e.preventDefault();
        goBack();
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      const dir = (
        {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
        } as const
      )[e.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'];
      e.preventDefault();
      moveFocus(dir);
      return;
    }
    if (e.key === 'F10' && e.shiftKey) {
      const a = document.activeElement as HTMLElement | null;
      if (a && a.getBoundingClientRect) {
        e.preventDefault();
        const r = a.getBoundingClientRect();
        a.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: r.left + 12,
            clientY: r.top + 12,
          }),
        );
      }
    }
  });

}
