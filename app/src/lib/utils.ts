/** 小工具。凡是从老版本搬过来的函数都保留原名，方便对着改。 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { URL_LIKE } from './constants';
import type { BmNode } from './types';

/** shadcn/ui 的 cn() */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 书签 id → 短 hex（DOM 上的 data-fid，纯给人看的定位用） */
export function hexId(n: string | number): string {
  let h = 2166136261;
  const s = String(n);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'n' + (h >>> 0).toString(36);
}

/** 图标方块里的字：域名首个字母 */
export function iconOf(node: BmNode | null | undefined): string {
  const host = String((node && node.url) || '').replace(/^[a-z]+:\/\/(www\.)?/i, '').split(/[/?#]/)[0];
  return (host[0] || '?').toUpperCase();
}

/** 字母印章的色相：同样的字永远是同一个颜色 */
export function letterHue(ch: string): number {
  let h = 0;
  for (let i = 0; i < ch.length; i += 1) h = (h * 31 + ch.charCodeAt(i)) % 360;
  return h;
}

/** 输入本身就是网址时，回车直接打开 */
export function looksLikeUrl(s: string): boolean {
  const raw = String(s || '').trim();
  if (!raw || /\s/.test(raw)) return false;
  return URL_LIKE.test(raw) || /^https?:\/\//i.test(raw);
}

export function withScheme(s: string): string {
  const raw = String(s).trim();
  return /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** 等比缩放的取样画布边长（取色用） */
export const TINT_SIZE = 48;
export const TINT_S_REF = 0.55;
export const TINT_S_MIN = 0.2;
export const TINT_S_MAX = 0.5;
export const TINT_A_MIN = 0.42;
export const TINT_A_MAX = 0.62;
export const TINT_L_FLOOR = 0.895;
export const TINT_KEYS = ['--paper-warm', '--paper-deep', '--paper-solid', '--paper', '--paper-alpha'] as const;
