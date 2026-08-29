// 生成 Windows 应用图标：圆角深色磁贴 + 盾形监测节点（与侧栏 Logo 同源）
// 4 倍超采样抗锯齿，多尺寸 PNG 编码进 ICO
// 用法：node scripts/gen-icon.js
'use strict'
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..')
const SS = 4

const C = {
  bgTop: [10, 18, 40],
  bgBot: [18, 32, 72],
  border: [61, 123, 255],
  primary: [61, 123, 255],
  primaryHi: [91, 146, 255],
  accent: [34, 211, 238],
  pulse: [230, 238, 255],
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function mix(a, b, t) {
  return a + (b - a) * t
}

function mix3(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
}

function sdRoundBox(px, py, hw, hh, r) {
  const ax = Math.abs(px) - (hw - r)
  const ay = Math.abs(py) - (hh - r)
  const dx = Math.max(ax, 0)
  const dy = Math.max(ay, 0)
  return Math.hypot(dx, dy) + Math.min(Math.max(ax, ay), 0) - r
}

function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const c1 = vx * wx + vy * wy
  if (c1 <= 0) return Math.hypot(px - ax, py - ay)
  const c2 = vx * vx + vy * vy
  if (c2 <= c1) return Math.hypot(px - bx, py - by)
  const t = c1 / c2
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

function sampleCubic(a, c1, c2, b, n) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([cubic(a[0], c1[0], c2[0], b[0], t), cubic(a[1], c1[1], c2[1], b[1], t)])
  }
  return pts
}

function buildShieldPoly() {
  // 与 Logo.tsx viewBox 48 对齐
  const left = sampleCubic([41, 22], [41, 33.5], [33.5, 41.5], [24, 45], 10)
  const right = sampleCubic([24, 45], [14.5, 41.5], [7, 33.5], [7, 22], 10)
  return [[24, 3], [41, 9.5], ...left.slice(1), ...right.slice(1), [7, 9.5]]
}

const SHIELD = buildShieldPoly()

function insidePoly(x, y, pts) {
  let n = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][1]
    const yj = pts[j][1]
    const xi = pts[i][0]
    const xj = pts[j][0]
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (hit) n++
  }
  return n % 2 === 1
}

function distPoly(x, y, pts) {
  let d = 1e9
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    d = Math.min(d, distSeg(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1]))
  }
  return insidePoly(x, y, pts) ? -d : d
}

function overlay(dst, src, a) {
  if (a <= 0) return
  const aa = clamp01(a)
  dst[0] = mix(dst[0], src[0], aa)
  dst[1] = mix(dst[1], src[1], aa)
  dst[2] = mix(dst[2], src[2], aa)
  dst[3] = mix(dst[3], 255, aa)
}

function renderHi(size, detail) {
  const px = Buffer.alloc(size * size * 4)
  const margin = size * 0.055
  const inner = size - margin * 2
  const hw = inner / 2
  const hh = inner / 2
  const radius = inner * 0.22
  const cx = size / 2
  const cy = size / 2
  const stroke = Math.max(1.15, size * 0.028)
  const scale = inner / 48
  const ox = cx - 24 * scale
  const oy = cy - 24 * scale

  const nodes = [
    [24, 11, C.primary],
    [35, 20, C.accent],
    [30, 33, C.primary],
    [18, 33, C.accent],
    [13, 20, C.primary],
  ]
  const hub = [24, 22]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const col = [0, 0, 0, 0]

      const sdTile = sdRoundBox(x - cx, y - cy, hw, hh, radius)
      const tileA = clamp01(0.5 - sdTile)
      if (tileA > 0) {
        const gy = clamp01((y - margin) / (inner || 1))
        const bg = mix3(C.bgTop, C.bgBot, gy)
        overlay(col, bg, tileA)
        const ring = Math.abs(sdTile)
        overlay(col, C.border, tileA * (1 - clamp01(ring / 1.35)) * 0.55)
        overlay(col, [255, 255, 255], tileA * clamp01((margin + 6 - y) / (size * 0.18)) * 0.06)
      }

      const sx = (x - ox) / scale
      const sy = (y - oy) / scale
      const sdShield = distPoly(sx, sy, SHIELD)
      const fillA = clamp01(0.5 - sdShield * scale)
      const strokeA = clamp01(1 - Math.abs(sdShield * scale) / stroke)

      if (fillA > 0) {
        const t = clamp01((sy - 3) / 42)
        overlay(col, mix3(C.primary, C.accent, t * 0.7), fillA * 0.22)
      }
      overlay(col, mix3(C.primaryHi, C.accent, clamp01((sy - 8) / 30)), strokeA * 0.95)

      const hx = ox + hub[0] * scale
      const hy = oy + hub[1] * scale
      const hubR = size * (detail >= 48 ? 0.055 : 0.07)
      const hd = Math.hypot(x - hx, y - hy)
      overlay(col, C.accent, clamp01(1 - hd / (hubR * 3.2)) * 0.22)
      overlay(col, C.primaryHi, clamp01(0.5 - (hd - hubR)))
      overlay(col, C.pulse, clamp01(0.5 - (hd - hubR * 0.38)))

      if (detail >= 28) {
        for (const [nx, ny, nc] of nodes) {
          const dx = ox + nx * scale
          const dy = oy + ny * scale
          if (detail >= 40) {
            const ld = distSeg(x, y, hx, hy, dx, dy)
            overlay(col, nc, clamp01(1 - ld / Math.max(0.7, size * 0.012)) * 0.42)
          }
          const nd = Math.hypot(x - dx, y - dy)
          const nr = size * 0.028
          overlay(col, nc, clamp01(0.5 - (nd - nr)))
        }
      }

      px[i] = Math.round(col[0])
      px[i + 1] = Math.round(col[1])
      px[i + 2] = Math.round(col[2])
      px[i + 3] = Math.round(col[3])
    }
  }
  return px
}

function downsample(src, srcSize, dstSize) {
  const factor = srcSize / dstSize
  const out = Buffer.alloc(dstSize * dstSize * 4)
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const x0 = Math.floor(x * factor)
      const y0 = Math.floor(y * factor)
      const x1 = Math.floor((x + 1) * factor)
      const y1 = Math.floor((y + 1) * factor)
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * srcSize + xx) * 4
          const aa = src[i + 3] / 255
          r += src[i] * aa
          g += src[i + 1] * aa
          b += src[i + 2] * aa
          a += src[i + 3]
          n++
        }
      }
      const j = (y * dstSize + x) * 4
      const avgA = a / n
      if (avgA < 0.5) {
        out[j] = 0
        out[j + 1] = 0
        out[j + 2] = 0
        out[j + 3] = 0
      } else {
        const pa = avgA / 255
        out[j] = Math.round(r / n / pa)
        out[j + 1] = Math.round(g / n / pa)
        out[j + 2] = Math.round(b / n / pa)
        out[j + 3] = Math.round(avgA)
      }
    }
  }
  return out
}

function renderPixels(size) {
  return downsample(renderHi(size * SS, size), size * SS, size)
}

function toPng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
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

function packIco(images, sizes) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dirSize = images.length * 16
  const ico = Buffer.alloc(header.length + dirSize + images.reduce((a, b) => a + b.length, 0))
  header.copy(ico, 0)
  let offset = header.length + dirSize
  images.forEach((png, i) => {
    const dir = header.length + i * 16
    ico[dir] = sizes[i] >= 256 ? 0 : sizes[i]
    ico[dir + 1] = sizes[i] >= 256 ? 0 : sizes[i]
    ico[dir + 2] = 0
    ico[dir + 3] = 0
    ico.writeUInt16LE(1, dir + 4)
    ico.writeUInt16LE(32, dir + 6)
    ico.writeUInt32LE(png.length, dir + 8)
    ico.writeUInt32LE(offset, dir + 12)
    png.copy(ico, offset)
    offset += png.length
  })
  return ico
}

const sizes = [16, 24, 32, 48, 64, 128, 256]

function writeOutputs(images) {
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true })
  fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true })
  const ico = packIco(images, sizes)
  fs.writeFileSync(path.join(ROOT, 'build/icon.ico'), ico)
  const png256 = images[images.length - 1]
  fs.writeFileSync(path.join(ROOT, 'build/icon.png'), png256)
  fs.writeFileSync(path.join(ROOT, 'public/icon.png'), png256)
  console.log(`icon.ico ${ico.length} bytes  sizes=${sizes.join('/')}`)
  console.log('wrote build/icon.ico  build/icon.png  public/icon.png')
}

const fromDir = process.argv[2] === '--from-dir' ? process.argv[3] : ''
if (fromDir) {
  const images = sizes.map((s) => {
    const p = path.join(fromDir, `${s}.png`)
    if (!fs.existsSync(p)) throw new Error(`missing ${p}`)
    return fs.readFileSync(p)
  })
  writeOutputs(images)
} else {
  const rasters = sizes.map((s) => renderPixels(s))
  writeOutputs(rasters.map((px, i) => toPng(sizes[i], px)))
}
