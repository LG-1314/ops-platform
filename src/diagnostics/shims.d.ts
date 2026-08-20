// .mjs 模块类型垫片：backend tsconfig 未开启 allowJs，无法从源码推断这些模块的类型，
// 而它们由 esbuild 直接打包运行、并无独立 .d.ts。此处声明为 any，仅用于消除 tsc 告警，
// 不改动运行时行为。当前覆盖 src/diagnostics/parsers.mjs 与 src/diagnostics/knowledge.mjs。
declare module '*.mjs'
