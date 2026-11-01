/** 面包屑。老版本 v2.0.x 起其实不再往下钻（点文件夹开的是放大层），
 *  所以正常情况下它是收起来的 —— 但state.path 一旦有内容，照样要画出来。 */
import { useApp } from '../../lib/store';
import { closeZoom, openZoom } from '../../lib/nav';
import { bump } from '../../lib/store';

export function Crumb() {
  const s = useApp();
  if (!s.path.length) return <nav className="crumb" id="crumb" hidden />;

  return (
    <nav className="crumb" id="crumb">
      <button
        type="button"
        onClick={() => {
          s.path = [];
          s.zoom = null;
          closeZoom();
          bump();
        }}
      >
        书签栏
      </button>
      {s.path.map((node, i) => (
        <span key={`${node.id}-${i}`}>
          <span className="crumb-sep">/</span>
          <button
            type="button"
            className={i === s.path.length - 1 ? 'cur' : undefined}
            onClick={() => {
              s.path = s.path.slice(0, i + 1);
              openZoom(node);
            }}
          >
            {node.title || '未命名'}
          </button>
        </span>
      ))}
    </nav>
  );
}
