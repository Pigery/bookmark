/** 预览模式用的假书签树：没有 chrome.bookmarks 时铺这棵，预览页才能看全所有状态。
 *  形状与 chrome 给的一模一样，id 是 '0' / '1' / '10'… / 'm1'…，测试脚本也拿它当基准。 */
import type { BmNode } from './types';

export function mockTree(): BmNode {
  const mk = (id: string, title: string, children: BmNode[]): BmNode => ({ id, title, children });
  const leaf = (n: number, title: string, url: string): BmNode => ({ id: 'm' + n, title, url });
  const bar = mk('1', '书签栏', [
    mk('10', '前端', [
      leaf(1, 'MDN 文档', 'https://developer.mozilla.org'),
      leaf(2, 'Can I use', 'https://caniuse.com'),
      leaf(3, 'web.dev', 'https://web.dev'),
      leaf(4, 'CSS-Tricks', 'https://css-tricks.com'),
    ]),
    mk('11', '工具', [
      leaf(5, 'Figma', 'https://www.figma.com'),
      leaf(6, 'Excalidraw', 'https://excalidraw.com'),
      leaf(7, 'RegExr', 'https://regex101.com'),
      leaf(8, 'JSON 格式化', 'https://www.json.cn'),
    ]),
    mk('12', '阅读', [
      leaf(9, '少数派', 'https://sspai.com'),
      leaf(10, '知乎', 'https://www.zhihu.com'),
      leaf(11, 'Hacker News', 'https://news.ycombinator.com'),
    ]),
    mk('13', '设计', [
      leaf(12, 'Dribbble', 'https://dribbble.com'),
      leaf(13, 'Behance', 'https://www.behance.net'),
    ]),
  ]);
  return mk('0', '', [bar]);
}
