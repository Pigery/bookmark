/** 一张相纸卡片：书脊 + 主体（子文件夹入口 → 图标段 → 列表段 → 空提示）。 */
import { MODE_LIST } from '../../lib/constants';
import { enter } from '../../lib/nav';
import { cn } from '../../lib/utils';
import { foldersOf, linksOf } from '../../lib/tree';
import type { BmNode } from '../../lib/types';
import { hexId } from '../../lib/utils';
import { Arrow } from '../icons';
import { ItemRow, SubfolderRow, TileView, ViewToggle, splitRuns } from './bits';
import { showFolderMenu, showZoneBlankMenu } from '../../lib/menus';
import { reg } from '../../lib/drag';

export function ZoneCard({ node, openable }: { node: BmNode; openable: boolean }) {
  const subs = foldersOf(node);
  const items = linksOf(node);
  const empty = !subs.length && !items.length;
  const runs = splitRuns(node, items);
  const title = node.title || '未命名';

  const headKey = (e: React.KeyboardEvent) => {
    if (!openable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      enter(node);
    }
  };

  return (
    <section
      className={cn('zone', empty && 'is-empty')}
      data-kind={openable ? 'folder' : 'group'}
      data-fid={node.id ? hexId(node.id) : undefined}
      ref={(el) => reg(el, 'zone', node)}
      onContextMenu={(e) => {
        // 卡片空白处 = 这张卡对应文件夹的功能菜单
        e.preventDefault();
        e.stopPropagation();
        showZoneBlankMenu(node, e.clientX, e.clientY);
      }}
    >
      <header
        className={openable ? 'zone-head openable' : 'zone-head'}
        tabIndex={0}
        draggable={openable || undefined}
        ref={(el) => reg(el, 'zoneHead', node)}
        onContextMenu={
          openable
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                showFolderMenu(node, e.clientX, e.clientY);
              }
            : undefined
        }
        onClick={
          openable
            ? (e) => {
                e.stopPropagation();
                enter(node);
              }
            : undefined
        }
        onKeyDown={headKey}
      >
        <span className="zone-dot" />
        <span className="zone-title" title={title}>
          {title}
        </span>
        <span className="zone-count">{items.length}</span>
        {items.length ? <ViewToggle node={node} /> : null}
        {openable ? (
          <span className="zone-open">
            <Arrow />
          </span>
        ) : null}
      </header>

      <div className="zone-body">
        {subs.length ? (
          <div className="subfolder-list">
            {subs.map((s) => (
              <SubfolderRow key={s.id} node={s} />
            ))}
          </div>
        ) : null}

        {runs.map((run, i) =>
          run.mode === MODE_LIST ? (
            <div className="zone-grid" key={`g${i}`}>
              {run.nodes.map((it) => (
                <ItemRow key={it.id} node={it} />
              ))}
            </div>
          ) : (
            <div className="tile-band" key={`b${i}`}>
              {run.nodes.map((it) => (
                <TileView key={it.id} node={it} />
              ))}
            </div>
          ),
        )}

        {empty ? <div className="zone-empty">空的</div> : null}
      </div>
    </section>
  );
}
