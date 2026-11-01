/** 通用输入弹窗：老版本 promptText() 的 DOM 那一半。 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/store';

export function Modal() {
  const s = useApp();
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dlg = s.modal;

  useEffect(() => {
    if (!dlg) return;
    setVal(dlg.value ?? '');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [dlg]);

  if (!dlg) return <div className="modal" id="modal" hidden />;

  const done = (v: string | null) => dlg.resolve(v);

  return (
    <div className="modal" id="modal">
      <div className="modal-card">
        <div className="modal-title" id="modalTitle">
          {dlg.title}
        </div>
        <div className="modal-body" id="modalBody">
          {dlg.value !== null ? (
            <input
              className="modal-input"
              type="text"
              ref={inputRef}
              value={val}
              spellCheck={false}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  done(val.trim());
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  done(null);
                }
              }}
            />
          ) : null}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" id="modalCancel" onClick={() => done(null)}>
            取消
          </button>
          <button className="btn primary" id="modalOk" onClick={() => done(val.trim())}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
