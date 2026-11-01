/** 书签的各种长相：图标印章、列表行、方块、子文件夹入口、显示方式开关。
 *  结构与 class 与老版本 buildItem / buildTile / buildSubfolder / paintIcon 完全一致。 */
import { useState } from 'react';
import { MODE_ICON, MODE_LIST } from '../../lib/constants';
import { faviconOf, openUrl } from '../../lib/chrome';
import { enter } from '../../lib/nav';
import { bump, state } from '../../lib/store';
import { childrenOf, modeOf, setFolderMode } from '../../lib/tree';
import type { BmNode } from '../../lib/types';
import { hexId, iconOf, letterHue } from '../../lib/utils';
import { Arrow, Folder, GridIcon, ListIcon } from '../icons';
import { showFolderMenu, showItemMenu } from '../../lib/menus';
import { reg } from '../../lib/drag';

/** 有 favicon 用 img，加载失败就换字母印章（老版本 paintIcon 的同一套降级） */
export function IconBox({ node, boxClass }: { node: BmNode; boxClass: string }) {
  const src = node.iconUrl || faviconOf(node.url);
  const [broken, setBroken] = useState('');
  const ch = iconOf(node);
  return (
    <span className={boxClass}>
      {src && broken !== src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(src)} />
      ) : (
        <span className="letter" style={{ background: `hsl(${letterHue(ch)}, 52%, 52%)` }}>
          {ch}
        </span>
      )}
    </span>
  );
}

export function FolderIco({ boxClass }: { boxClass: string }) {
  return (
    <span className={boxClass}>
      <Folder />
    </span>
  );
}

/** 列表行 */
export function ItemRow({ node }: { node: BmNode }) {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openUrl(node.url, e.ctrlKey || e.metaKey);
    }
  };
  return (
    <div
      className="item"
      data-fid={hexId(node.id)}
      tabIndex={0}
      draggable
      ref={(el) => reg(el, 'item', node)}
      onClick={(e) => {
        e.stopPropagation();
        openUrl(node.url, e.ctrlKey || e.metaKey);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showItemMenu(node, e.clientX, e.clientY);
      }}
      onKeyDown={onKey}
    >
      <IconBox node={node} boxClass="ico" />
      <span className="label" title={`${node.title || ''}\n${node.url || ''}`.trim()}>
        {node.title || node.url}
      </span>
    </div>
  );
}

/** 图标方块 */
export function TileView({ node }: { node: BmNode }) {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openUrl(node.url, e.ctrlKey || e.metaKey);
    }
  };
  return (
    <div
      className="item tile"
      data-fid={hexId(node.id)}
      tabIndex={0}
      draggable
      ref={(el) => reg(el, 'item', node)}
      onClick={(e) => {
        e.stopPropagation();
        openUrl(node.url, e.ctrlKey || e.metaKey);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showItemMenu(node, e.clientX, e.clientY);
      }}
      onKeyDown={onKey}
    >
      <IconBox node={node} boxClass="tile-ico" />
      <span className="tile-name" title={node.title || node.url}>
        {node.title || node.url}
      </span>
    </div>
  );
}

/** 子文件夹入口：无描边，hover 才出底色 */
export function SubfolderRow({ node }: { node: BmNode }) {
  const n = childrenOf(node).length;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      enter(node);
    }
  };
  return (
    <div
      className="subfolder"
      data-fid={hexId(node.id)}
      tabIndex={0}
      draggable
      ref={(el) => reg(el, 'folder', node)}
      onClick={(e) => {
        e.stopPropagation();
        enter(node);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showFolderMenu(node, e.clientX, e.clientY);
      }}
      onKeyDown={onKey}
    >
      <span className="subfolder-ico">
        <Folder />
      </span>
      <span className="subfolder-copy">
        <span className="subfolder-name">{node.title || '未命名'}</span>
        <span className="subfolder-meta">{n ? `${n} 项` : '空'}</span>
      </span>
      <span className="subfolder-arrow">
        <Arrow />
      </span>
    </div>
  );
}

/** 显示方式开关：图标显示的是「点一下会变成什么」 */
export function ViewToggle({ node }: { node: BmNode }) {
  const listMode = modeOf(node) === MODE_LIST;
  return (
    <button
      type="button"
      className="zone-view"
      title={listMode ? '换成图标显示' : '换成列表显示'}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await setFolderMode(node, listMode ? MODE_ICON : MODE_LIST);
        bump();
      }}
    >
      {listMode ? <GridIcon /> : <ListIcon />}
    </button>
  );
}

/** 条目把「分段规则」暴露出来：图标一堆、列表一堆，各自内部还要按连续同类分段 */
export function splitRuns(node: BmNode, items: BmNode[]): { mode: string; nodes: BmNode[] }[] {
  const zoneMode = modeOf(node);
  const looseKey = node.id ? String(node.id).startsWith('__loose__:') : false;
  const modeFor = (it: BmNode) => {
    const own = state.views.items[it.id];
    if (own === MODE_ICON || own === MODE_LIST) return own;
    return looseKey ? zoneMode : modeOf(it);
  };
  const tiles = items.filter((it) => modeFor(it) !== MODE_LIST);
  const lists = items.filter((it) => modeFor(it) === MODE_LIST);

  const runs: { mode: string; nodes: BmNode[] }[] = [];
  const group = (arr: BmNode[]) => {
    arr.forEach((it) => {
      const m = modeFor(it);
      const last = runs[runs.length - 1];
      if (last && last.mode === m) last.nodes.push(it);
      else runs.push({ mode: m, nodes: [it] });
    });
  };
  group(tiles);
  group(lists);
  return runs;
}
