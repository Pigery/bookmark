/** 右键菜单（含「添加到 → 某文件夹」这种二级菜单）。
 *  结构与 class 与老版本 showMenu / buildMenuItems / openSubmenu 完全一致：
 *  菜单是一堆 <button>，分隔线是 <hr>，二级菜单是 .ctx.ctx-sub 挂在父按钮里，
 *  右边放不下就加 .sub-left 翻到左边，底下放不下就整体上收。 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useApp, type CtxEntry } from '../../lib/store';

interface SubState {
  index: number;
  top: number;
  left: boolean;
}

export function Ctx() {
  const s = useApp();
  const boxRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sub, setSub] = useState<SubState | null>(null);

  /* 先画出来量尺寸，再夹到窗口里（老版本用 offsetWidth 现量现摆） */
  useLayoutEffect(() => {
    if (!s.ctx) {
      setSub(null);
      setPos(null);
      return;
    }
    const el = boxRef.current;
    if (!el) {
      setPos({ left: s.ctx.x, top: s.ctx.y });
      return;
    }
    const w = el.offsetWidth || 180;
    const h = el.offsetHeight || 150;
    setPos({
      left: Math.max(6, Math.min(s.ctx.x, window.innerWidth - w - 10)),
      top: Math.max(6, Math.min(s.ctx.y, window.innerHeight - h - 10)),
    });
  }, [s.ctx]);

  /* 二级菜单摆位：右边放不下翻左边，底下放不下上收 */
  useLayoutEffect(() => {
    const el = subRef.current;
    if (!sub || !el || !s.ctx) return;
    const parent = el.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    const sw = el.offsetWidth || 180;
    const sh = el.offsetHeight || 120;
    const left = r.right + 4 + sw > window.innerWidth - 8;
    let top = 0;
    if (r.top + sh > window.innerHeight - 8) top = window.innerHeight - 8 - (r.top + sh);
    if (left !== sub.left || top !== sub.top) setSub({ ...sub, left, top });
    /* 翻到左边靠的是 CSS 里的 .sub-left（和老版本一样用 class，不写内联 left/right），
       底下放不下就整体上收 —— 老版本也是只改 top */
    el.style.top = `${top}px`;
  });

  if (!s.ctx) return <div className="ctx" id="ctx" hidden />;

  const closeAll = () => {
    setSub(null);
    s.ctx = null;
  };

  const renderItems = (items: CtxEntry[], isSub: boolean) =>
    items.map((it, i) => {
      if (it === '-') return <hr key={`hr${i}`} />;
      const open = () => {
        if (!it.children || !it.children.length) return;
        setSub({ index: i, top: 0, left: false });
      };
      return (
        <button
          key={`${it.label}-${i}`}
          type="button"
          className={[it.on ? 'on' : '', it.danger ? 'danger' : '', it.children && it.children.length ? 'has-sub' : '']
            .filter(Boolean)
            .join(' ') || undefined}
          onMouseEnter={() => {
            /* 悬停到别的顶层项时收掉二级菜单 —— 但**不能**在二级菜单自己的项上收，
               否则鼠标一进子菜单、刚碰到第一项就把子菜单抽走，看着像「添加到点不开」。
               老版本这里注销的是子菜单内部的 .ctx-sub（子项没有下一级，等于什么都没删），
               所以行为上是「进了子菜单就停在那儿」。 */
            if (it.children && it.children.length) open();
            else if (!isSub) setSub(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (it.children && it.children.length) {
              open();
              return;
            }
            closeAll();
            Promise.resolve()
              .then(() => it.run && it.run())
              .catch(() => {});
          }}
        >
          {it.label}
          {!isSub && sub && sub.index === i && it.children && it.children.length ? (
            <div className={['ctx', 'ctx-sub', sub.left ? 'sub-left' : ''].filter(Boolean).join(' ')} ref={subRef} style={{ top: sub.top }}>
              {renderItems(it.children, true)}
            </div>
          ) : null}
        </button>
      );
    });

  return (
    <div
      className="ctx"
      id="ctx"
      ref={boxRef}
      data-open="1"
      style={{ left: pos ? pos.left : s.ctx.x, top: pos ? pos.top : s.ctx.y }}
    >
      {renderItems(s.ctx.items, false)}
    </div>
  );
}
