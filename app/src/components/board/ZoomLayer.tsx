/** 放大层：把一个文件夹摊开在页面正中。
 *  DOM 与 class 跟老版本 openZoom() 完全一致，宽高/居中也是同一套公式。 */
import { useEffect } from 'react';
import { bump, useApp } from '../../lib/store';
import { MODE_LIST } from '../../lib/constants';
import { foldersOf, linksOf, modeOf } from '../../lib/tree';
import { closeZoom, goBack, openZoom } from '../../lib/nav';
import { showFolderMenu, showZoneBlankMenu } from '../../lib/menus';
import { reg } from '../../lib/drag';
import { Arrow, Back, Close, Folder } from '../icons';
import { ItemRow, TileView, ViewToggle } from './bits';

/** 老版本：max(320, min(920, vw-96)) × max(240, min(600, vh-112)) */
function zoomSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(320, Math.min(920, vw - 96));
  const h = Math.max(240, Math.min(600, vh - 112));
  return { w, h };
}

export function ZoomLayer() {
  const s = useApp();
  const node = s.zoom;

  /* body.zoom-open 是老 CSS 的总开关（顶栏/舞台淡出、放大层接管） */
  useEffect(() => {
    document.body.classList.toggle('zoom-open', !!node);
    return () => document.body.classList.remove('zoom-open');
  }, [node]);
  /* 窗口尺寸变了要重新量一遍（老版本是 window.resize 里再 openZoom 一次） */
  useEffect(() => {
    if (!node) return;
    const onResize = () => bump();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [node]);

  if (!node) return <div className="folder-zoom" id="folderZoom" hidden />;

  const subs = foldersOf(node);
  const items = linksOf(node);
  const { w, h } = zoomSize();
  const parent = node.parentId ? s.byId.get(String(node.parentId)) : null;
  const canBack = !!(parent && parent !== s.bar);
  const mode = modeOf(node);
  const count = items.length;

  return (
    <div className="folder-zoom" id="folderZoom">
      <div className="folder-zoom-backdrop" onClick={() => closeZoom()} />
      <section
        className="folder-zoom-card"
        id="folderZoomCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zoomTitle"
        onContextMenu={(e) => {
          /* 卡片空白处右键 = 当前文件夹的菜单；条目/子文件夹自己的菜单会先 stopPropagation */
          e.preventDefault();
          e.stopPropagation();
          showZoneBlankMenu(node, e.clientX, e.clientY);
        }}
        style={{ width: w, height: h, left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2 }}
      >
        <div className="zoom-head">
          <div className="zoom-identity">
            <span className="zoom-icon">
              <Folder />
            </span>
            <span className="zoom-title" id="zoomTitle">
              {node.title || '未分组'}
            </span>
          </div>
          <span className="zoom-meta">{count ? `${count} 个书签` : '空的'}</span>
          {count ? <ViewToggle node={node} /> : null}
          {canBack ? (
            <button
              className="zoom-back"
              type="button"
              title="上一组（Esc / Backspace）"
              onClick={(e) => {
                e.stopPropagation();
                goBack();
              }}
            >
              <Back />
            </button>
          ) : null}
          <button
            className="zoom-close"
            type="button"
            title="关闭（Esc）"
            onClick={(e) => {
              e.stopPropagation();
              closeZoom();
            }}
          >
            <Close />
          </button>
        </div>

        <div className="zoom-content">
          {subs.length ? (
            <>
              <div className="zoom-section-label">文件夹</div>
              <div className="zoom-folders">
                {subs.map((sub) => {
                  const c = linksOf(sub).length;
                  return (
                    <div
                      key={sub.id}
                      className="zoom-folder"
                      data-fid={sub.id}
                      tabIndex={0}
                      draggable
                      ref={(el) => reg(el, 'folder', sub)}
                      onClick={(e) => {
                        e.stopPropagation();
                        openZoom(sub);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          openZoom(sub);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showFolderMenu(sub, e.clientX, e.clientY);
                      }}
                    >
                      <span className="zoom-folder-icon">
                        <Folder />
                      </span>
                      <span className="zoom-folder-copy">
                        <span className="zoom-folder-name">{sub.title || '未命名'}</span>
                        <span className="zoom-folder-meta">{c ? `${c} 个书签` : '空'}</span>
                      </span>
                      <span className="zoom-folder-arrow">
                        <Arrow />
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {items.length ? (
            <>
              {subs.length ? <div className="zoom-section-label">书签</div> : null}
              {mode === MODE_LIST ? (
                <div className="zoom-list">
                  {items.map((it) => (
                    <ItemRow key={it.id} node={it} />
                  ))}
                </div>
              ) : (
                <div className="tile-band">
                  {items.map((it) => (
                    <TileView key={it.id} node={it} />
                  ))}
                </div>
              )}
            </>
          ) : null}

          {!subs.length && !items.length ? <div className="zoom-empty">这个文件夹是空的</div> : null}
        </div>
      </section>
    </div>
  );
}
