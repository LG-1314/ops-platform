// 把文本（报告 Markdown 等）触发浏览器下载为文件。
export function downloadText(
  filename: string,
  text: string,
  mime = 'text/markdown;charset=utf-8'
) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
