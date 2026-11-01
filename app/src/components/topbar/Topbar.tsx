/** 顶栏：左边时钟、中间搜索（引擎切换 + 输入 + 清空 + `/` 提示）、右边三个动作。 */
import { useEffect, useRef, useState } from 'react';
import { createFolder, toggleSyncPanel, toggleWallpaperPanel } from '../../lib/actions';
import { ENGINES } from '../../lib/constants';
import { applyQuery, clearSearch, pickEngine, placeholderFor, runSearch, engineNow } from '../../lib/nav';
import { bump, state, useApp } from '../../lib/store';
import { cn } from '../../lib/utils';
import { Caret, Plus, SearchClear, SyncIcon, WallpaperIcon } from '../icons';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function Topbar() {
  const s = useApp();
  const [now, setNow] = useState(() => new Date());
  const [value, setValue] = useState(s.query);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 时钟每 10 秒走一次（老版本 setInterval(tickClock, 10000)） */
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(t);
  }, []);

  /* 点别处就把引擎下拉收起来（老版本挂在 document 上） */
  useEffect(() => {
    if (!s.engineMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('.search')) return;
      state.engineMenu = false;
      bump();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [s.engineMenu]);

  const engine = engineNow();
  const wd = '日一二三四五六'[now.getDay()];

  return (
    <header className="topbar">
      <div className="clock">
        <div className="time" id="clockTime">
          {`${pad(now.getHours())}:${pad(now.getMinutes())}`}
        </div>
        <div className="date" id="clockDate">
          {`${now.getMonth() + 1} 月 ${now.getDate()} 日 周${wd}`}
        </div>
      </div>

      <div className={cn('search', value && 'has-value')}>
        <button
          className="engine-btn"
          id="engineBtn"
          type="button"
          title="切换搜索引擎"
          onClick={(e) => {
            e.stopPropagation();
            state.engineMenu = !state.engineMenu;
            bump();
          }}
        >
          <span className="engine-name" id="engineName">
            {engine.name}
          </span>
          <Caret />
        </button>
        <span className="search-sep" />
        <input
          id="searchInput"
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholderFor(value)}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value);
            applyQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearch(value);
            }
          }}
        />
        <button
          className="search-clear"
          id="searchClear"
          title="清空"
          hidden={!value}
          onClick={(e) => {
            e.stopPropagation();
            setValue('');
            clearSearch();
            inputRef.current?.focus();
          }}
        >
          <SearchClear />
        </button>
        <kbd className="search-kbd">/</kbd>
        <div className="engine-menu" id="engineMenu" hidden={!s.engineMenu}>
          {ENGINES.map((x) => (
            <button
              key={x.id}
              type="button"
              className={cn(x.id === s.engine && 'on')}
              onClick={(ev) => {
                ev.stopPropagation();
                void pickEngine(x.id);
                inputRef.current?.focus();
              }}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>

      <div className="top-actions">
        <button
          className="icon-btn"
          id="btnNewFolder"
          title="新建分组（书签文件夹）"
          onClick={(e) => {
            e.stopPropagation();
            void createFolder();
          }}
        >
          <Plus />
        </button>
        <button
          className="icon-btn"
          id="btnSync"
          title="布局同步（导出 / 导入）"
          onClick={(e) => {
            e.stopPropagation();
            toggleSyncPanel();
          }}
        >
          <SyncIcon />
        </button>
        <button
          className="icon-btn"
          id="btnWallpaper"
          title="更换壁纸"
          onClick={(e) => {
            e.stopPropagation();
            void toggleWallpaperPanel();
          }}
        >
          <WallpaperIcon />
        </button>
      </div>
    </header>
  );
}
