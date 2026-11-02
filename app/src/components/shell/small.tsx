/** 几个小浮层：水印、提示条、快捷键卡、拖文件提示。 */
import { toggleKeyHint } from '../../lib/actions';
import { HAS_CHROME, buildVersion } from '../../lib/chrome';
import { APP_VERSION } from '../../lib/constants';
import { useApp } from '../../lib/store';
import { HelpIcon } from '../icons';

export function Build() {
  const ver = buildVersion(APP_VERSION);
  const mode = HAS_CHROME ? '扩展' : '预览';
  return (
    <div className="build" id="build" title="当前加载的版本 / 运行环境">{`v${ver} · ${mode}`}</div>
  );
}

export function Toast() {
  const s = useApp();
  return (
    <div className="toast" id="toast" hidden={!s.toastOn}>
      {s.toast}
    </div>
  );
}

export function HelpButton() {
  return (
    <button
      className="help-btn"
      id="btnHelp"
      type="button"
      title="键盘与手势（?）"
      aria-label="键盘与手势"
      onClick={(e) => {
        e.stopPropagation();
        toggleKeyHint();
      }}
    >
      <HelpIcon />
    </button>
  );
}

export function HelpCard() {
  const s = useApp();
  return (
    <div className="help-card" id="helpCard" hidden={!s.helpCard}>
      <div className="help-head">
        <span className="help-title">能用的位置</span>
        <button className="help-close" id="helpClose" type="button" aria-label="关闭" onClick={() => toggleKeyHint(false)}>
          ×
        </button>
      </div>
      <dl className="help-list">
        <div>
          <dt>
            <kbd>/</kbd>
          </dt>
          <dd>搜索 · 回车用当前引擎搜</dd>
        </div>
        <div>
          <dt>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
          </dt>
          <dd>在书签之间走</dd>
        </div>
        <div>
          <dt>
            <kbd>Enter</kbd>
          </dt>
          <dd>打开 · 空格也是</dd>
        </div>
        <div>
          <dt>
            <kbd>菜单键</kbd>
          </dt>
          <dd>Shift+F10 出右键菜单</dd>
        </div>
        <div>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>一层层退回去</dd>
        </div>
        <div>
          <dt>
            <kbd>?</kbd>
          </dt>
          <dd>这张卡</dd>
        </div>
      </dl>
      <p className="help-foot">
        拖书签进别的卡片可以换分组，从网页里拖一条地址进来可以直接收下。
      </p>
    </div>
  );
}

export function DropHint() {
  const s = useApp();
  return (
    <div className="drop-hint" id="dropHint" hidden={!s.dropHint}>
      <div className="drop-hint-in">
        松手，把这条地址收下来
        <div className="drop-hint-sub">落在卡片上就收进那个分组，落在空白处就收进书签栏</div>
      </div>
    </div>
  );
}
