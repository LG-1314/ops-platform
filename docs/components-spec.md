# 组件与模式规范（组件目录）— Ops Platform

> 遵循 design-tokens.css / design-tokens.json / theme.ts。深色默认，浅色备选。
> 图标一律 `@mui/icons-material`（outlined，16/20/24px），**禁 emoji**。每屏 ≤2 处 accent。

## 1. 布局外壳（Layout Shell）
- 顶栏 AppBar：`bg=panel`，`borderBottom=1px border`，高度 48–56px，左侧菜单按钮 + 标题，右侧状态/主题切换。
- 左侧导航 Drawer：折叠 64px / 展开 232px，`bg=panel`，激活项用 `rgba(primary,0.18)` 底 + primary 图标，hover `rgba(255,255,255,0.06)`。
- 内容区：`bg=bg`，padding `--space-xl`(24px)，最大宽度自适应；高密度但留白得当。

## 2. 数据表（Data Table）
- 容器：`Paper`（`bg=panel`，`border`），无外阴影。
- 表头 `TableCell head`：`bg=panel-2`，`color=text-secondary`，`fontWeight=600`。
- 数值列（延迟/IP/指标）：`fontFamily=var(--font-mono)`，`font-variant-numeric: tabular-nums`，`textAlign:right`，`fontWeight=500`。
- 行 hover：`rgba(255,255,255,0.03)`；行高紧凑（~40px）。分页/筛选置于表头上方工具条。

## 3. 指标卡 / 统计卡（Stat Card）
- `Paper`，`radius=8`，padding `--space-base`(16px)。顶部标题（`text-secondary`，13px）+ 右上 `StatusBadge`。
- 主数值：`font-mono`，`font-size=2xl~3xl`(24–32px)，`tabular-nums`，右对齐或左对齐保持整页一致。
- 副信息（正常范围/趋势）：`caption`，`text-secondary`。禁卡片盒子堆砌——用 1px hairline 分隔而非重边框。

## 4. 状态胶囊（Status Pill）— online/offline/warning
- 用 `Chip`：`bg=color+1A`，`color=color`，`border=1px color+33`，height 24。
- 颜色映射：online=success `#34D399`、warning=warning `#F59E0B`、offline/error=danger `#F87171`、unknown=text-disabled。图标 `@mui/icons-material`（CheckCircle/Warning/Error/HelpOutline）。

## 5. 延迟徽标（Latency Badge）
- 等宽数字，`tabular-nums`，右对齐。阈值配色：<50ms success、50–150ms warning、>150ms danger。单位 `ms` 用 `text-secondary` 小字。

## 6. 图表框（Chart Frame）
- 外框 `Paper`（`border`，`radius=8`），标题行 + 右上图例/时间范围选择器。
- 序列色严格取 `--color-chart-c1..c8`（禁自定义紫粉）。坐标/刻度文字 `font-mono`、`text-secondary`。深色背景统一 `#0B0E14`/`panel` 区。

## 7. 对话框与表单（Dialog / Form）
- `Dialog`：`Paper` `bg=panel`，`border`，`radius=8`，`boxShadow=shadow-md`。
- 输入框 `TextField`：`bg=panel-2`，`border`，focus 用 primary 环；label 常驻（非仅 placeholder）。
- 主按钮 `contained primary`（≤1 个主操作/组），次按钮 `outlined`/`text`。错误就近显示于字段下方，禁用态 `opacity` 降低并显式样式。
- 所有交互：`focus-visible` 可见环；尊重 `prefers-reduced-motion`。
