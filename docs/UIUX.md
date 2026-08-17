# UI/UX 设计规范 - 企业级运维监控管理平台 v2.0

> 生成日期：2026-08-17
> 作者：颜好看（UI/UX 设计师）｜ 团队：MVP 开发专家团

## 1. 对标品牌 + 设计语言

对标 **Grafana「深色操作台画布（operator console）」** + **Datadog「语义化 Design Token」**，辅以夜莺/1Panel 国产化简洁感。设计寄存器 = Product（产品型），**深色优先**。规避 Datadog 紫→粉渐变（P0 红线）。

## 2. 配色 Token

### 深色主题（默认）
| 类别 | 值 |
|------|----|
| 背景 | #0B0E14 |
| 面板 | #141923 |
| 三级面 | #1A202C |
| 主色（accent） | #3D7BFF 电光蓝 |
| 文字 | #E6E8EE |
| 次级文字 | #A8B0BF |
| muted | #6B7280 |
| 边框 | rgba(255,255,255,0.08) |

### 语义色（深色值 / 浅色值）
| 语义 | 深色 | 浅色 |
|------|------|------|
| success | #34D399 | #16A34A |
| warning | #F59E0B | #D97706 |
| danger | #F87171 | #DC2626 |
| info | #3D7BFF | #2563EB |
| in-progress | #22D3EE | #0891B2 |

### 图表色板（7 色序列）
#3D7BFF、#22D3EE、#34D399、#FACC15、#FB923C、#F87171、#A78BFA

### 浅色主题
背景 #F7F9FC / 面板 #FFFFFF / 文字 #111827 / 主色 #2E6BE6

## 3. 字体方案

- 正文/UI：Inter + Noto Sans SC（中文回退）
- 数字/指标值/时间戳/IP/坐标刻度：**JetBrains Mono**（等宽 + tabular-nums，右对齐）——监控平台「操作台感」灵魂
- 字号 7 级：12/14/16/18/20/24/32，正文 14px 起步（数据密集）

## 4. 主题策略

- 深色为默认（NOC/夜间值班降疲劳、数据曲线更突出）；浅色保留（日间办公/报告演示）
- 支持跟随系统 prefers-color-scheme，Electron 用 nativeTheme 同步
- 深色靠「亮度递进」表达层级，不用阴影

## 5. 图标库（锁定）

**@mui/icons-material**（随 MUI 5 零额外依赖）。统一 outlined 变体、描边一致，尺寸 16/20/24px 三档。全项目不混用其他图标库，**禁止 emoji**。

## 6. 关键设计原则

1. 深色操作台优先，靠亮度递进分层而非阴影。
2. 语义色即状态色，success/warning/danger/info/in-progress 五态贯穿告警、主机列表、拓扑、终端。
3. 等宽数字 + tabular-nums 右对齐，指标值秒级扫读。
4. 克制强调色：每屏 ≤2 处 accent，大面积中性色 + 语义色承载数据。
5. 1px hairline 分隔线分组 + 8px 圆角，高密度但留白得当，禁止卡片盒子堆砌。

## 7. 落地产物

- `design-tokens.css`（CSS 变量，前端 import 引用）
- `design-tokens.json`（供图表库/组件消费）
