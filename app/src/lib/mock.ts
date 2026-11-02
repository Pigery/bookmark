/** 预览模式用的假书签树：没有 chrome.bookmarks 时铺这棵，预览页才能看全所有状态。
 *  形状与 chrome 给的一模一样，id 是 '0' / '1' / '10'… / 'm1'…。 */
import type { BmNode } from './types';

export function mockTree(): BmNode {
  const mk = (id: string, title: string, children: BmNode[]): BmNode => ({ id, title, children });
  let seq = 0;
  const leaf = (title: string, url: string): BmNode => ({ id: 'm' + ++seq, title, url });

  const bar = mk('1', '书签栏', [
    mk('10', '前端', [
      leaf('MDN 文档', 'https://developer.mozilla.org'),
      leaf('Can I use', 'https://caniuse.com'),
      leaf('web.dev', 'https://web.dev'),
      leaf('CSS-Tricks', 'https://css-tricks.com'),
      leaf('TypeScript 手册', 'https://www.typescriptlang.org/docs/'),
      leaf('React 官方文档', 'https://react.dev'),
      leaf('Vite 中文文档', 'https://cn.vitejs.dev'),
      leaf('Tailwind CSS', 'https://tailwindcss.com'),
      leaf('shadcn/ui', 'https://ui.shadcn.com'),
      leaf('阮一峰 ES6 教程', 'https://es6.ruanyifeng.com'),
      leaf('Chrome DevTools', 'https://developer.chrome.com/docs/devtools/'),
    ]),
    mk('11', '工具', [
      leaf('Figma', 'https://www.figma.com'),
      leaf('Excalidraw', 'https://excalidraw.com'),
      leaf('RegExr', 'https://regex101.com'),
      leaf('JSON 格式化', 'https://www.json.cn'),
      leaf('Squoosh', 'https://squoosh.app'),
      leaf('Carbon', 'https://carbon.now.sh'),
      leaf('Ray.so', 'https://ray.so'),
      leaf('TinyPNG', 'https://tinypng.com'),
      leaf('Shields.io', 'https://shields.io'),
      leaf('LibreTranslate', 'https://libretranslate.com'),
    ]),
    mk('12', '阅读', [
      leaf('少数派', 'https://sspai.com'),
      leaf('知乎', 'https://www.zhihu.com'),
      leaf('Hacker News', 'https://news.ycombinator.com'),
      leaf('掘金', 'https://juejin.cn'),
      leaf('Lobsters', 'https://lobste.rs'),
      leaf('InfoQ 中文', 'https://www.infoq.cn'),
      leaf('阮一峰的网络日志', 'https://www.ruanyifeng.com/blog/'),
      leaf('Product Hunt', 'https://www.producthunt.com'),
      leaf('V2EX', 'https://www.v2ex.com'),
    ]),
    mk('13', '设计', [
      leaf('Dribbble', 'https://dribbble.com'),
      leaf('Behance', 'https://www.behance.net'),
      leaf('Awwwards', 'https://www.awwwards.com'),
      leaf('Unsplash', 'https://unsplash.com'),
      leaf('Godly', 'https://godly.website'),
      leaf('Mobbin', 'https://mobbin.com'),
      leaf('Coolors', 'https://coolors.co'),
      leaf('Fontsource', 'https://fontsource.org'),
    ]),
  ]);
  return mk('0', '', [bar]);
}
