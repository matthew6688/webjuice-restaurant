# DESIGN.md · WebJuice Design System

> 生成任何页面前必须读取此文件。所有颜色、字体、布局均来自此 tokens。
> 设计规范遵循 webjuice-design skill：https://github.com/alchaincyf/huashu-design/blob/main/SKILL.md

---

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#FFFFFF` | 页面主背景 |
| `--bg-secondary` | `#F8F9FA` | 次级背景、section 分隔 |
| `--bg-accent` | `#F3F4F6` | card 背景、微强对比 |
| `--text-primary` | `#111827` | 标题、重要文本 |
| `--text-secondary` | `#6B7280` | 正文、描述 |
| `--text-muted` | `#9CA3AF` | 辅助文本、日期 |
| `--accent` | `#000000` | CTA、链接、重点标记。**每屏最多用两次** |
| `--accent-hover` | `#374151` | accent hover 状态 |
| `--border` | `#E5E7EB` | 边框、分隔线 |
| `--success` | `#10B981` | 成功状态 |
| `--error` | `#EF4444` | 错误状态 |

## Typography

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | `Newsreader, Georgia, serif` | 400-700 | Hero headline, section titles |
| Body | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | 400 | 正文、描述 |
| Mono | `"SF Mono", Monaco, monospace` | 400 | 数据、标注、caption |

### Scale

| Level | Size | Line-height | Usage |
|-------|------|-------------|-------|
| H1 | `clamp(2.5rem, 5vw, 4rem)` | 1.1 | Hero headline |
| H2 | `clamp(1.75rem, 3vw, 2.5rem)` | 1.2 | Section titles |
| H3 | `1.25rem` | 1.3 | Card titles |
| Body | `1rem` | 1.6 | Paragraphs |
| Small | `0.875rem` | 1.5 | Captions, metadata |
| Tiny | `0.75rem` | 1.4 | Labels, tags |

## Layout

### Grid
- Max-width: `1200px`
- Padding: `24px` mobile / `48px` tablet / `64px` desktop
- Section spacing: `96px` vertical

### Responsive Breakpoints
- Desktop: ≥1200px
- Tablet: 768px – 1199px
- Mobile: <768px

### Spacing Scale
- `xs`: `4px`
- `sm`: `8px`
- `md`: `16px`
- `lg`: `24px`
- `xl`: `32px`
- `2xl`: `48px`
- `3xl`: `64px`
- `4xl`: `96px`

## Components

### Button
```
Primary: bg-accent + text-white + px-6 py-3 + rounded-lg + hover:bg-accent-hover
Secondary: border + border-border + bg-transparent + hover:bg-bg-secondary
Ghost: text-accent + underline-offset-4 + hover:underline
```

### Card
```
bg-bg-secondary + border + border-border + rounded-xl + p-6
No shadow by default. Shadow only on hover if interactive.
```

### Input
```
border + border-border + rounded-lg + px-4 py-2 + focus:ring-2 focus:ring-accent
```

## Depth & Elevation

- **Minimal by default**。大多数组件无阴影。
- 只有弹窗、dropdown 等覆盖层使用 `box-shadow: 0 4px 20px rgba(0,0,0,0.08)`

## Anti-Slop Checklist

生成每个页面前自检：
- [ ] 没有紫色渐变
- [ ] 没有 Emoji 作图标
- [ ] 没有圆角卡片 + 左彩色 border accent
- [ ] 没有 SVG 手画代替真实产品图
- [ ] Display font 是衬线，不是 Inter/Roboto
- [ ] Accent 色每屏 ≤2 次
- [ ] 文案有意义，不是 lorem ipsum
