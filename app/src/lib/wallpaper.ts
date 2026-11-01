/** 壁纸：渐变预设与必应照片的切换、模糊档位。
 *  老版本往 #bg 写 inline style，这里只改 state，样式由 App 算。 */
import { WALLPAPERS } from './constants';
import { storeSet } from './chrome';
import { bump, state } from './store';
import { refreshPaperTint } from './tint';

/** 套上一套壁纸。id 是渐变的 id，或者 'bing' 表示用必应照片 */
export async function applyWallpaper(id: string): Promise<void> {
  if (id === 'bing' && state.wallpaperBing) {
    state.wallpaper = 'bing';
    state.light = false;
    bump();
    await refreshPaperTint();
    return;
  }
  const wp = WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
  state.wallpaper = wp.id;
  state.light = wp.light;
  bump();
  await refreshPaperTint();
}

export async function pickWallpaper(id: string): Promise<void> {
  await applyWallpaper(id);
  await storeSet('wallpaper', state.wallpaper);
}

export async function setWallBlur(id: string): Promise<void> {
  state.wallBlur = id;
  bump();
  await storeSet('wallBlur', id);
  await refreshPaperTint();
}
