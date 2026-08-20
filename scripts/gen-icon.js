// 生成多尺寸（16/32/48/64/128/256）PNG 编码的 .ico 应用图标
// 品牌盾形 + 脉冲节点，主色 #3D7BFF，透明背景
// 用法：node scripts/gen-icon.js
'use strict'
const fs = require('fs')
const zlib = require('zlib')

const PRIMARY = [0x3d, 0x7b, 0xff] // #3D7BFF
const ACCENT = [0x22, 0xd3, 0xee] // #22D3EE 信息蓝

/** 生成单尺寸 RGBA 像素缓冲（盾形 logo） */
function renderPixels(size) {
  const px = Buffer.alloc(size * size * 4)
  const s = size
  const cx = s / 2
  const cy = s / 2
  // 盾形参数
  const top = s * 0.08
  const bottom = s * 0.92
  const halfW = s * 0.46
  const neck = s * 0.32 // 盾颈收窄比例
  const centerY = s * 0.42
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4
      const dx = x - cx
      const dy = y - centerY
      const t = (y - top) / (bottom - top) // 0..1
      const w = halfW * (1 - (1 - neck / halfW) * t) // 从顶部到底部线性收窄
      const insideShield = t >= 0 && t <= 1 && Math.abs(dx) <= w
      // 中心脉冲圆
      const inPulse = Math.hypot(x - cx, y - s * 0.42) <= s * 0.08
      // 环绕监测点
      const ringR = s * 0.32
      const dots = [
        [0, -1, ACCENT], [0.94, -0.34, PRIMARY], [0.58, 0.81, PRIMARY],
        [-0.58, 0.81, PRIMARY], [-0.94, -0.34, ACCENT],
      ]
      let inDot = false
      let dotColor = PRIMARY
      for (const [rdx, rdy, c] of dots) {
        const d = Math.hypot(x - (cx + rdx * ringR), y - (cy + rdy * ringR))
        if (d <= s * 0.055) { inDot = true; dotColor = c; break }
      }
      if (insideShield || inPulse || inDot) {
        // 抗锯齿边缘（1px 半透明）
        const dist = Math.min(
          insideShield ? Math.abs(Math.abs(dx) - w) : 1e9,
          inPulse ? Math.abs(Math.hypot(x - cx, y - s * 0.42) - s * 0.08) : 1e9,
          inDot ? 1e9 : 1e9
        )
        const alpha = dist < 1.5 ? Math.round(255 * Math.min(1, dist)) : 255
        const col = inPulse || inDot ? dotColor : PRIMARY
        px[i] = col[0]
        px[i + 1] = col[1]
        px[i + 2] = col[2]
        px[i + 3] = alpha
      } else {
        px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0
      }
    }
  }
  return px
}

/** RGBA 像素 → PNG Buffer */
function toPng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // 每行前置 filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw)
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// 组装 ICO：header + 目录 + 各尺寸 PNG
const sizes = [16, 32, 48, 64, 128, 256]
const images = sizes.map((s) => toPng(s, renderPixels(s)))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type=icon
header.writeUInt16LE(images.length, 4)
const dirSize = images.length * 16
const ico = Buffer.alloc(header.length + dirSize + images.reduce((a, b) => a + b.length, 0))
header.copy(ico, 0)
let offset = header.length + dirSize
images.forEach((png, i) => {
  const dir = header.length + i * 16
  ico[dir] = sizes[i] >= 256 ? 0 : sizes[i] // width (0=256)
  ico[dir + 1] = sizes[i] >= 256 ? 0 : sizes[i] // height
  ico[dir + 2] = 0 // colors
  ico[dir + 3] = 0 // reserved
  ico.writeUInt16LE(1, dir + 4) // planes
  ico.writeUInt16LE(32, dir + 6) // bpp
  ico.writeUInt32LE(png.length, dir + 8) // size
  ico.writeUInt32LE(offset, dir + 12) // offset
  png.copy(ico, offset)
  offset += png.length
})
fs.writeFileSync('build/icon.ico', ico)
console.log(`icon.ico created: ${ico.length} bytes, sizes=${sizes.join('/')}, PNG-encoded`)