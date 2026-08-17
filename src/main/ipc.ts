// ipc.ts — 架构已转向「前端 → REST → Express」模型，IPC 仅保留为未来扩展点占位。
// 当前所有跨进程通信通过 HTTP /api 完成，无需主进程 <-> 渲染进程 IPC。
// 若后续需要桥接原生能力（如读取本地文件、系统托盘），可在此注册 handler 并通过 preload 暴露。
export const ipcPlaceholder = true
