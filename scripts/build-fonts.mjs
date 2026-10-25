// Generates Rhabit's custom typeface: very wide, flat, blocky letters built
// from bars, in the style of corporate logos from Cyberpunk-style UIs.
//
//   Rhabit Display - extra-wide, heavy strokes, for titles
//   Rhabit Text    - the same shapes at a narrower width, in three weights
//                    (regular hairline, medium, bold) for everything else
//
// Glyphs are defined as polygons on a simple grid (see GLYPHS below), so
// the shapes are easy to tweak. Run with: npm run build:fonts
// Output: src/assets/fonts/rhabit-*.otf
import opentype from 'opentype.js'
import polygonClipping from 'polygon-clipping'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'fonts')

const UPM = 1000
const CAP = 520 // cap height: short and flat relative to the em

// Per-weight settings: stroke thickness, standard letter width, chamfer size
const WEIGHTS = {
  display: { family: 'Rhabit Display', stroke: 118, width: 900, chamfer: 70, gap: 95 },
  text: { family: 'Rhabit Text', stroke: 52, width: 640, chamfer: 44, gap: 90 },
  'text-medium': { family: 'Rhabit Text Medium', stroke: 76, width: 640, chamfer: 48, gap: 92 },
  'text-bold': { family: 'Rhabit Text Bold', stroke: 104, width: 650, chamfer: 54, gap: 95 }
}

// ---- shape helpers (coordinates: x right, y up from the baseline) ----
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const poly = (...pts) => pts

// a parallelogram stroke from (x1,y1) to (x2,y2), thickness t measured horizontally
const diag = (x1, y1, x2, y2, t) => [[x1, y1], [x1 + t, y1], [x2 + t, y2], [x2, y2]]

// Builds every glyph for one weight. Each entry: [polygons, width]
function glyphs({ stroke: t, width: W, chamfer: c }) {
  const H = CAP
  const m = (H - t) / 2 // y of the middle bar
  const top = H - t
  const right = W - t
  const g = {}

  // vertical / horizontal bars
  const vl = (y0 = 0, y1 = H) => rect(0, y0, t, y1 - y0)
  const vr = (y0 = 0, y1 = H, w = W) => rect(w - t, y0, t, y1 - y0)
  const hb = (y, x0 = 0, x1 = W) => rect(x0, y, x1 - x0, t)

  // left vertical with a chamfered top-left corner
  const vlChamTop = (y0 = 0) => poly([0, y0], [t, y0], [t, H], [c, H], [0, H - c])
  // top bar with chamfered top-right corner
  const hbTopChamRight = (x0 = 0, x1 = W) => poly([x0, top], [x1, top], [x1, H - c], [x1 - c, H], [x0, H])
  // bottom bar with chamfered bottom-right corner
  const hbBotChamRight = (x0 = 0, x1 = W) => poly([x0, 0], [x1 - c, 0], [x1, c], [x1, t], [x0, t])

  g.A = [[vlChamTop(), hb(top, t), vr(), hb(m, t, right)], W]
  // B: upper bowl slightly narrower than the lower one
  g.B = [[vl(), hb(top, t, W - c), rect(W - c - t, m + t, t, top - m - t), hb(m, t, right), vr(0, m + t), hb(0, t, right)], W]
  g.C = [[vlChamTop(), hb(top, t), hb(0, t)], W]
  // D: large chamfers on both right corners so it never reads as O
  const cD = Math.max(c * 1.9, t * 1.6)
  g.D = [[vl(), poly([t, top], [W - cD, top], [W - cD, H], [t, H]), poly([W - cD, top], [W - t, top - cD + t], [W, top - cD + t], [W - cD, H]),
    vr(cD, top - cD + t), poly([t, 0], [W - cD, 0], [W, cD], [W - t, cD], [W - cD, t], [t, t])], W]
  g.E = [[vl(), hb(top, t), hb(m, t, W * 0.8), hb(0, t)], W]
  g.F = [[vl(), hb(top, t), hb(m, t, W * 0.8)], W]
  g.G = [[vlChamTop(), hb(top, t), hb(0, t), vr(t, m + t), hb(m, W * 0.5, right)], W]
  g.H = [[vl(), vr(), hb(m, t, right)], W]
  g.I = [[vl()], t]
  g.J = [[vr(), hb(0, 0, right), vl(t, H * 0.38)], W]
  g.K = [[vl(), hb(m, t, W * 0.55),
    diag(W * 0.55 - t * 0.2, m + t, right, H, t), diag(right, 0, W * 0.55 - t * 0.2, m, t)], W]
  g.L = [[vl(), hb(0, t)], W]
  const WM = W * 1.22
  g.M = [[vl(), hb(top, t, WM), rect((WM - t) / 2, 0, t, top), vr(0, top, WM)], WM]
  g.N = [[vl(), hbTopChamRight(t), vr(0, top)], W]
  g.O = [[vlChamTop(t), hb(top, t), vr(t, top), hbBotChamRight(0), rect(0, t, t, 0)], W]
  g.P = [[vl(), hb(top, t), vr(m + t, top), hb(m, t, right)], W]
  g.Q = [[vlChamTop(t), hb(top, t), vr(t, top), hb(0, 0, right), rect(right, 0, t + t * 0.9, t)], W + t * 0.9]
  // R: leg runs from the middle bar down to the bottom right
  g.R = [[vl(), hb(top, t), vr(m + t, top), hb(m, t, right), diag(right, 0, W * 0.42, m, t)], W]
  g.S = [[hbTopChamRight(0), vl(m, top), hb(m, 0, right), vr(t, m), hb(0, 0, right)], W]
  g.T = [[hb(top), rect((W - t) / 2, 0, t, top)], W]
  g.U = [[vl(t), vr(t), hb(0)], W]
  g.V = [[vl(H * 0.42), vr(H * 0.42), diag(0, H * 0.42, W * 0.5 - t * 0.5, 0, t), diag(right, H * 0.42, W * 0.5 - t * 0.5, 0, t)], W]
  g.W = [[vl(t), hb(0, 0, WM), rect((WM - t) / 2, t, t, H - t), vr(t, H, WM)], WM]
  g.X = [[diag(0, 0, right, H, t), diag(right, 0, 0, H, t)], W]
  g.Y = [[vl(m, H), vr(m, H), hb(m), rect((W - t) / 2, 0, t, m)], W]
  g.Z = [[hb(top), diag(0, t, right, top, t), hb(0)], W]

  const WD = W * 0.82 // digits are a little narrower
  g['0'] = [[vl(), hb(top, t, WD), vr(0, top, WD), hb(0, t, WD - t), diag(t, t * 1.2, WD - t * 2, top - t * 0.2, t * 0.7)], WD]
  // 1: a short flag on a vertical, set in a narrow box so it can't read as 7
  const flag = Math.max(t * 1.2, W * 0.2)
  const W1 = t + flag
  g['1'] = [[rect(W1 - t, 0, t, H), rect(0, H - t - flag * 0.35, flag, t)], W1]
  g['2'] = [[hb(top, 0, WD), vr(m, top, WD), hb(m, 0, WD), vl(t, m), hb(0, 0, WD)], WD]
  g['3'] = [[hb(top, 0, WD - t), vr(0, H, WD), hb(m, WD * 0.25, WD - t), hb(0, 0, WD - t)], WD]
  g['4'] = [[vl(m, H), hb(m, 0, WD - t), vr(0, H, WD)], WD]
  g['5'] = [[hb(top, 0, WD), vl(m, top), hb(m, 0, WD), vr(t, m, WD), hb(0, 0, WD)], WD]
  g['6'] = [[vl(), hb(top, t, WD), hb(m, t, WD - t), vr(0, m + t, WD), hb(0, t, WD - t)], WD]
  g['7'] = [[hb(top, 0, WD - t), vr(0, H, WD)], WD]
  g['8'] = [[vl(), hb(top, t, WD - t), vr(0, H, WD), hb(m, t, WD - t), hb(0, t, WD - t)], WD]
  g['9'] = [[vl(m, H), hb(top, t, WD - t), hb(m, t, WD - t), vr(0, H, WD), hb(0, 0, WD - t)], WD]

  // punctuation and symbols
  const dot = t * 1.05
  g['.'] = [[rect(0, 0, dot, dot)], dot]
  g[','] = [[rect(0, -t * 0.6, dot, dot + t * 0.6)], dot]
  g[':'] = [[rect(0, 0, dot, dot), rect(0, H * 0.55, dot, dot)], dot]
  g[';'] = [[rect(0, -t * 0.6, dot, dot + t * 0.6), rect(0, H * 0.55, dot, dot)], dot]
  g['!'] = [[rect(0, 0, dot, dot), rect(0, dot + t * 0.8, dot, H - dot - t * 0.8)], dot]
  const WQ = WD * 0.8
  g['?'] = [[hb(top, 0, WQ), vr(m, top, WQ), hb(m, WQ * 0.4, WQ), rect(WQ * 0.4, dot + t * 0.7, t, m - dot - t * 0.7), rect(WQ * 0.4, 0, dot, dot)], WQ]
  g["'"] = [[rect(0, H * 0.62, t * 0.8, H * 0.38)], t * 0.8]
  g['’'] = g["'"]
  g['"'] = [[rect(0, H * 0.62, t * 0.8, H * 0.38), rect(t * 1.8, H * 0.62, t * 0.8, H * 0.38)], t * 2.6]
  g['-'] = [[rect(0, m, W * 0.45, t)], W * 0.45]
  g['–'] = [[rect(0, m, W * 0.7, t)], W * 0.7]
  g['—'] = [[rect(0, m, W * 1.1, t)], W * 1.1]
  g['_'] = [[rect(0, -t * 1.5, W * 0.8, t)], W * 0.8]
  g['/'] = [[diag(0, 0, W * 0.5 - t, H, t)], W * 0.5]
  g['('] = [[rect(t * 0.6, 0, t, H), rect(t * 0.6, H - t * 0.6, t * 1.4, t * 0.6), rect(t * 0.6, 0, t * 1.4, t * 0.6)], t * 2.2]
  g[')'] = [[rect(0.2 * t, 0, t, H), rect(-0.2 * t, H - t * 0.6, t * 1.4, t * 0.6), rect(-0.2 * t, 0, t * 1.4, t * 0.6)], t * 1.4]
  g['['] = g['(']
  g[']'] = g[')']
  g['+'] = [[rect(0, m, W * 0.6, t), rect(W * 0.3 - t / 2, m - W * 0.2, t, W * 0.4 + t)], W * 0.6]
  g['='] = [[rect(0, m - t * 0.9, W * 0.6, t), rect(0, m + t * 0.9, W * 0.6, t)], W * 0.6]
  g['%'] = [[rect(0, H * 0.6, t * 1.4, H * 0.4), rect(W * 0.7 - t * 1.4, 0, t * 1.4, H * 0.4), diag(t * 0.4, 0, W * 0.7 - t * 1.4, H, t)], W * 0.7]
  g['·'] = [[rect(0, m, dot, dot)], dot]
  g['&'] = g.E
  g['@'] = g.O
  g['#'] = [[rect(W * 0.15, 0, t, H), rect(W * 0.55 - t, 0, t, H), rect(0, H * 0.25, W * 0.7, t), rect(0, H * 0.65 - t, W * 0.7, t)], W * 0.7]
  g['*'] = [[rect(W * 0.2 - t / 2, H * 0.45, t, H * 0.55), rect(0, H * 0.7, W * 0.4, t)], W * 0.4]
  g['<'] = [[diag(0, m, W * 0.45 - t, H * 0.85, t), diag(W * 0.45 - t, H * 0.15, 0, m, t)], W * 0.45]
  g['>'] = [[diag(0, H * 0.85, W * 0.45 - t, m, t), diag(W * 0.45 - t, m, 0, H * 0.15, t)], W * 0.45]
  g['|'] = [[rect(0, -t, t, H + 2 * t)], t]
  return g
}

function buildFont({ family, ...weight }) {
  const G = glyphs(weight)
  const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: weight.width, path: new opentype.Path() })
  const space = new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: weight.width * 0.75, path: new opentype.Path() })
  const nbsp = new opentype.Glyph({ name: 'nbsp', unicode: 160, advanceWidth: weight.width * 0.75, path: new opentype.Path() })
  const list = [notdef, space, nbsp]

  const make = (char, unicode) => {
    const [polys, width] = G[char]
    const p = new opentype.Path()
    // union the overlapping bars into clean outlines (outer rings
    // counter-clockwise, holes clockwise), so no overlap artefacts render
    const rings = polys.filter(pts => pts.length >= 3).map(pts => [pts.map(([x, y]) => [Math.round(x), Math.round(y)])])
    const merged = rings.length ? polygonClipping.union(...rings) : []
    for (const polygon of merged) {
      for (const ring of polygon) {
        const pts = ring.slice(0, -1) // last point repeats the first
        pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
        p.close()
      }
    }
    return new opentype.Glyph({
      name: `u${unicode.toString(16).padStart(4, '0')}`,
      unicode,
      // gap = space after each letter (side bearing)
      advanceWidth: Math.round(width + weight.gap),
      path: p
    })
  }

  for (const char of Object.keys(G)) {
    list.push(make(char, char.codePointAt(0)))
    // lowercase letters reuse the capital shapes (unicase, like the logos)
    if (/[A-Z]/.test(char)) list.push(make(char, char.toLowerCase().codePointAt(0)))
  }

  return new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: 780,
    descender: -220,
    glyphs: list
  })
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const [key, weight] of Object.entries(WEIGHTS)) {
  const font = buildFont(weight)
  const file = path.join(OUT_DIR, `rhabit-${key}.otf`)
  fs.writeFileSync(file, Buffer.from(font.toArrayBuffer()))
  console.log(`wrote ${path.relative(process.cwd(), file)} (${font.glyphs.length} glyphs)`)
}
