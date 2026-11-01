import type { Config } from 'tailwindcss';

/**
 * Tailwind 只用来写「新东西」和布局；老样式表 `styles/legacy.css` 原样保留、
 * 逐字未改 —— 这是「不能改任何样式」的执行方式：像素由老 CSS 负责，
 * Tailwind 的 preflight 关掉，免得它把老 CSS 依赖的元素默认值（margin / 标题字重…）洗一遍。
 * 颜色 / 字号 / 圆角都映射到 legacy.css 里已有的 CSS 变量，两边指的是同一套刻度。
 */
export default {
  content: ['./app/newtab.html', './app/src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        paper: 'var(--paper)',
        'paper-solid': 'var(--paper-solid)',
        sheet: 'var(--sheet-bg)',
        'sheet-solid': 'var(--sheet-solid)',
        // shadcn/ui 需要的那套语义变量，在 index.css 里映射到纸色
        background: 'hsl(var(--sh-background))',
        foreground: 'hsl(var(--sh-foreground))',
        border: 'hsl(var(--sh-border))',
        input: 'hsl(var(--sh-input))',
        ring: 'hsl(var(--sh-ring))',
        primary: { DEFAULT: 'hsl(var(--sh-primary))', foreground: 'hsl(var(--sh-primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--sh-secondary))', foreground: 'hsl(var(--sh-secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--sh-muted))', foreground: 'hsl(var(--sh-muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--sh-accent))', foreground: 'hsl(var(--sh-accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--sh-popover))', foreground: 'hsl(var(--sh-popover-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--sh-destructive))', foreground: 'hsl(var(--sh-destructive-foreground))' },
      },
      borderRadius: {
        pill: 'var(--r-pill)',
        row: 'var(--r-row)',
        sheet: 'var(--r-sheet)',
        card: 'var(--r-card)',
        pop: 'var(--r-pop)',
        lg: 'var(--sh-radius)',
        md: 'calc(var(--sh-radius) - 2px)',
        sm: 'calc(var(--sh-radius) - 4px)',
      },
      fontSize: {
        1: 'var(--fs-1)',
        2: 'var(--fs-2)',
        3: 'var(--fs-3)',
        4: 'var(--fs-4)',
        5: 'var(--fs-5)',
        6: 'var(--fs-6)',
      },
      fontWeight: { 1: 'var(--fw-1)', 2: 'var(--fw-2)', 3: 'var(--fw-3)' },
    },
  },
  plugins: [],
} satisfies Config;
