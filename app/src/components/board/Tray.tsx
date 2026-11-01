/** 置顶栏：一行快捷图标，没有置顶就整条藏起来。 */
import { openUrl } from '../../lib/chrome';
import { useApp } from '../../lib/store';
import { resolveIconEntry } from '../../lib/tree';
import { hexId } from '../../lib/utils';
import { IconBox } from './bits';
import { showTrayMenu } from '../../lib/menus';
import { reg } from '../../lib/drag';

export function Tray() {
  const s = useApp();
  const list = (s.icons || []).map(resolveIconEntry).filter(Boolean) as ReturnType<typeof resolveIconEntry>[];
  const rows = list.filter(Boolean);

  return (
    <div className="tray" id="tray" hidden={!rows.length}>
      <div className="tray-apps" id="trayApps">
        {rows.map((node) => (
          <div
            key={node!.id}
            className="tray-app"
            data-fid={hexId(node!.id)}
            tabIndex={0}
            draggable
            ref={(el) => reg(el, 'tray', node!)}
            onClick={(e) => openUrl(node!.url, e.ctrlKey || e.metaKey)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              showTrayMenu(node!, e.clientX, e.clientY);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openUrl(node!.url, e.ctrlKey || e.metaKey);
              }
            }}
          >
            <IconBox node={node!} boxClass="tray-ico" />
            <span className="tray-name">{node!.title || node!.url}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
