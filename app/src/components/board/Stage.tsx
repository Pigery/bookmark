/** 舞台：正常状态铺卡片，搜索时整页换成一张扁平结果列表。 */
import { useApp } from '../../lib/store';
import { childrenOf, current, searchHits } from '../../lib/tree';
import { closeZoom } from '../../lib/nav';
import { bump } from '../../lib/store';
import { cn } from '../../lib/utils';
import { EmptyFolder } from '../icons';
import { ItemRow } from './bits';
import { ZoneCard } from './ZoneCard';
import { showStageMenu } from '../../lib/menus';

export function Stage() {
  const s = useApp();
  const here = current();
  const kids = childrenOf(here);
  const folders = kids.filter((c) => !c.url);
  const loose = kids.filter((c) => c.url);
  const searching = !!s.query;
  const hits = searching ? searchHits(s.query) : [];
  const showEmpty = searching ? hits.length === 0 : !(folders.length || loose.length);

  /* 桌面空白双击：缩回书签栏顶层（老版本 v2.0.x 的行为） */
  const onDblClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t === e.currentTarget || (t.classList && t.classList.contains('zones'))) {
      s.path = [];
      closeZoom();
      bump();
    }
  };

  return (
    <main
      className="stage"
      id="stage"
      onDoubleClick={onDblClick}
      onContextMenu={(e) => {
        // 桌面空白处：书签栏这一层的常用操作
        const t = e.target as HTMLElement;
        if (t !== e.currentTarget && !(t.classList && t.classList.contains('zones'))) return;
        e.preventDefault();
        showStageMenu(e.clientX, e.clientY);
      }}
    >
      <div className={cn('zones', searching && 'searching')} id="zones">
        {searching ? (
          hits.length ? (
            <div className="zone-grid">
              {hits.map((h) => (
                <ItemRow key={h.node.id} node={h.node} />
              ))}
            </div>
          ) : null
        ) : (
          <>
            {folders.map((f) => (
              <ZoneCard key={f.id} node={f} openable />
            ))}
            {loose.length && here ? (
              <ZoneCard
                key="__loose__"
                node={{
                  id: `__loose__:${here.id}`,
                  title: s.path.length ? here.title || '书签' : '未分组',
                  children: loose,
                }}
                openable={false}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="empty" id="empty" hidden={!showEmpty}>
        <div className="empty-icon">
          <EmptyFolder />
        </div>
        <p className="empty-title" id="emptyTitle">
          {s.bootError ? '出了点问题' : '还没有书签'}
        </p>
        <p className="empty-sub" id="emptySub">
          {s.bootError || '把网页地址拖到这里，或者右键新建一个文件夹'}
        </p>
      </div>
    </main>
  );
}
