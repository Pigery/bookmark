/** 书签的各种长相：图标印章、列表行、方块、子文件夹入口、显示方式开关。
 *  结构与 class 与老版本 buildItem / buildTile / buildSubfolder / paintIcon 完全一致。 */
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { MODE_ICON, MODE_LIST, MODE_MIX } from '../../lib/constants';
import { faviconOf, openUrl } from '../../lib/chrome';
import { enter } from '../../lib/nav';
import { bump } from '../../lib/store';
import { childrenOf, modeOf, restoreMix, setFolderMode, zoneModeOf } from '../../lib/tree';
import type { BmNode, ZoneMode } from '../../lib/types';
import { hexId, iconOf, letterHue } from '../../lib/utils';
import { Arrow, Folder, GridIcon, ListIcon, MixIcon } from '../icons';
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

/** 显示方式开关：整卡图标 / 整卡列表 / 混搭（记住每条自己的排法）。
 *  v3.1.0 起是三态 —— 点「混搭」不会丢东西：切到整齐的图标或列表时，
 *  每条的记录一直留着，再点「混搭」就原样回来。 */
export function ViewSwitch({ node }: { node: BmNode }) {
  const mode = zoneModeOf(node);
  const pick = async (e: MouseEvent, next: ZoneMode) => {
    e.stopPropagation();
    e.preventDefault();
    if (next === MODE_MIX) await restoreMix(node);
    else await setFolderMode(node, next);
    bump();
  };
  return (
    <span className="zone-views">
      <button
        type="button"
        className={mode === MODE_ICON ? 'zone-view on' : 'zone-view'}
        title="全部显示成图标"
        onClick={(e) => pick(e, MODE_ICON)}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        className={mode === MODE_LIST ? 'zone-view on' : 'zone-view'}
        title="全部显示成列表"
        onClick={(e) => pick(e, MODE_LIST)}
      >
        <ListIcon />
      </button>
      <button
        type="button"
        className={mode === 'mix' ? 'zone-view on' : 'zone-view'}
        title="混搭：每条按自己的显示方式（现在就记下来）"
        onClick={(e) => pick(e, 'mix')}
      >
        <MixIcon />
      </button>
    </span>
  );
}

/** 条目把「分段规则」暴露出来：图标一堆、列表一堆，各自内部还要按连续同类分段 */
export function splitRuns(items: BmNode[]): { mode: string; nodes: BmNode[] }[] {
  const runs: { mode: string; nodes: BmNode[] }[] = [];
  const group = (arr: BmNode[]) => {
    arr.forEach((it) => {
      const m = modeOf(it);
      const last = runs[runs.length - 1];
      if (last && last.mode === m) last.nodes.push(it);
      else runs.push({ mode: m, nodes: [it] });
    });
  };
  group(items.filter((it) => modeOf(it) !== MODE_LIST));
  group(items.filter((it) => modeOf(it) === MODE_LIST));
  return runs;
}
