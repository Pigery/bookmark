/** 布局同步面板：老 newtab.html 里 div.sync-panel#syncPanel 那一段的 React 版。
 *  结构、class、id、文案照着老 HTML 一字不差；按钮全部转调 lib/sync.ts。 */
import { useRef, useState } from 'react';
import { useApp } from '../../lib/store';
import {
  confirmLayout,
  copyLayoutJson,
  copyShareText,
  hasPendingLayout,
  importLayoutFile,
  saveLayoutFile,
  syncApply,
  toggleSyncPanel,
} from '../../lib/sync';

export function SyncPanel() {
  const s = useApp();
  // 老版本读 $('syncInput').value：换成组件自己的输入内容，面板收起也不丢
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const lines = s.syncPreview ? s.syncPreview.split('\n').filter(Boolean) : [];
  const showPreview = !!(s.syncPreview || s.syncError);
  const canConfirm = !s.syncError && hasPendingLayout();

  return (
    <div className="sync-panel" id="syncPanel" hidden={!s.syncPanel}>
      <div className="sync-head">
        <div className="sync-title">布局同步</div>
        <button
          className="sync-close"
          id="syncClose"
          type="button"
          title="关闭"
          onClick={(e) => {
            e.stopPropagation();
            toggleSyncPanel(false);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="sync-note">
        只搬「怎么展示」：置顶图标的顺序、图标 / 列表方式、壁纸、搜索引擎。书签本身由浏览器自己同步，这里一根指头都不碰它。换设备就「存成文件」带走，或者把分享文本发给自己。
      </p>

      <div className="sync-label">导出这台设备的布局</div>
      <div className="sync-row">
        <button
          className="sync-btn"
          id="syncCopy"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copyLayoutJson();
          }}
        >
          复制 JSON
        </button>
        <button
          className="sync-btn"
          id="syncDownload"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            saveLayoutFile();
          }}
        >
          存成文件
        </button>
        <button
          className="sync-btn"
          id="syncShare"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copyShareText();
          }}
        >
          复制分享文本
        </button>
      </div>

      <div className="sync-label">把另一台设备的布局搬过来</div>
      <textarea
        className="sync-input"
        id="syncInput"
        placeholder="粘贴 JSON、分享文本，或整条分享链接"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sync-row">
        <button
          className="sync-btn"
          id="syncFile"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
        >
          读取文件…
        </button>
        <button
          className="sync-btn accent"
          id="syncApply"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            syncApply(text);
          }}
        >
          检查并导入
        </button>
      </div>

      {/* 预览：先看要覆盖掉什么，再点「确认覆盖」才真的写库 */}
      <div className="sync-preview" id="syncPreview" hidden={!showPreview}>
        {s.syncError ? <div className="err">{s.syncError}</div> : null}
        {!s.syncError && s.syncPreview
          ? lines.map((line, i) => <div key={i}>{line}</div>)
          : null}
        {!s.syncError && s.syncPreview ? (
          <div className="sync-hint">导入是整体覆盖：本机多出来的置顶图标和显示方式会被清掉。</div>
        ) : null}
        {canConfirm ? (
          <button
            className="sync-btn accent sync-confirm sync-apply-go"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              confirmLayout();
            }}
          >
            确认覆盖
          </button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        id="syncFileInput"
        accept=".json,application/json,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          // 老版本读完就把 value 清空，才读得进同一个文件第二次
          e.target.value = '';
          if (f) importLayoutFile(f);
        }}
      />
    </div>
  );
}
