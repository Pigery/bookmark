/** 壁纸面板：必应九宫格 + 模糊档位 + 渐变预设。
 *  结构与 class 照抄老版本 #wpPanel（buildWallpaperPanel / buildBlurRow / paintBingGallery）。 */
import { useApp, state } from '../../lib/store';
import { WALLPAPERS, WALL_BLURS } from '../../lib/constants';
import { bingDayLabel, loadBingPanel, pickBingDay, useTodayBing } from '../../lib/bing';
import { pickWallpaper, setWallBlur } from '../../lib/wallpaper';
import { hideWallpaper } from '../../lib/actions';

export function WallpaperPanel() {
  const s = useApp();
  const bing = s.wallpaper === 'bing';
  const list = s.bingList || [];
  const cur = list.find((d) => d.idx === s.bingDay) || list[0];

  return (
    <div className="wp-panel" id="wpPanel" hidden={!s.wpPanel}>
      <div className="wp-title">必应壁纸</div>
      <div className="wp-bing" id="wpBing">
        <div className="wp-bing-gallery" id="wpBingGallery" onMouseEnter={() => { if (!state.bingList.length) void loadBingPanel(); }}>
          {list.map((day) => {
            const active = bing && s.bingDay === day.idx;
            return (
              <button
                key={day.idx}
                type="button"
                className={active ? 'wp-bing-cell on' : 'wp-bing-cell'}
                data-idx={String(day.idx)}
                style={{ backgroundImage: `url("${day.thumb || day.url}")` }}
                title={day.copyright || day.title || bingDayLabel(day)}
                aria-pressed={active ? 'true' : 'false'}
                onClick={(e) => {
                  e.stopPropagation();
                  void pickBingDay(day);
                }}
              >
                <span className="wp-bing-tag">{day.idx === 0 ? '今天' : bingDayLabel(day)}</span>
              </button>
            );
          })}
        </div>
        <div className="wp-bing-bar">
          <span className="wp-bing-meta" id="wpBingMeta">
            {list.length ? (cur ? cur.copyright || cur.title || '' : '') : '暂时没取到必应壁纸'}
          </span>
          <button
            className="wp-bing-daily"
            id="wpBingDaily"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void useTodayBing();
            }}
          >
            用今天的
          </button>
        </div>
      </div>

      <div className="wp-blur-row" id="wpBlurRow" hidden={!bing}>
        <span className="wp-blur-label">模糊</span>
        <div className="wp-blur-opts" id="wpBlurOpts">
          {WALL_BLURS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={s.wallBlur === b.id ? 'wp-blur-opt on' : 'wp-blur-opt'}
              data-id={b.id}
              onClick={(e) => {
                e.stopPropagation();
                void setWallBlur(b.id);
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="wp-title">渐变预设</div>
      <div className="wp-list" id="wpList">
        {WALLPAPERS.map((wp) => (
          <button
            key={wp.id}
            type="button"
            className="wp-item"
            data-id={wp.id}
            style={{ background: wp.css }}
            title={wp.light ? '浅色壁纸' : '深色壁纸'}
            onClick={(e) => {
              e.stopPropagation();
              void pickWallpaper(wp.id);
              hideWallpaper();
            }}
          />
        ))}
      </div>
    </div>
  );
}
