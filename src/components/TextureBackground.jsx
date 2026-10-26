import { useEffect, useRef } from 'react'

// The background: flickering pixel fields in Rhabit's purple, over a faint
// static dot grid.
//
// - Static grid: tight 6px dots near the top and bottom edges that dim and
//   thin out gradually towards the middle.
// - Flickering fields: most of the top and bottom is covered by larger pixel
//   dots (each exactly over a 2x2 block of grid dots) that stay in place and
//   flicker constantly. The fields are dense at the edges and thin out towards
//   the middle.
// - Both layers reach a little further towards the middle at the far left and
//   right, curving up into the corners, always fading out towards the centre.
//
// - Bright lights: random pixels across the fields slowly brighten and fade,
//   each in a colour from a blue-purple-pink gradient.
//
// No glow. With "reduce motion" on, the fields are drawn once and stay still.

const PITCH = 6 // static grid cell size in px
const DOT = 2 // static grid dot size in px (centred in its cell)
const BLOCK = 1 // field pixels sit on single grid cells
const PIXEL = 3 // field pixel size in px: small, like the texture design
const PIXEL_OFF = (BLOCK * PITCH - PIXEL) / 2
const FPS = 30

// bright lights: now and then a random pixel slowly brightens, holds, then
// fades back over several seconds
const FLARE_CHANCE = 0.00003 // per pixel per frame (about 0.5% lit at once)
const FLARE_MIN = 120 // frames (4s at 30fps)
const FLARE_MAX = 270 // frames (9s)

// colour gradient for the bright lights: each light starts somewhere along it
// and drifts a little further along as it brightens and fades
const FLARE_GRADIENT = [
  [122, 168, 255], // blue
  [176, 150, 255], // lilac
  [145, 111, 241], // Rhabit purple
  [214, 122, 255], // violet-pink
  [255, 140, 214] // pink
]
const FLARE_DRIFT = 0.3 // how far along the gradient a light moves in its life

// colour at position t (0–1) along the flare gradient
function gradientAt(t) {
  const x = Math.max(0, Math.min(1, t)) * (FLARE_GRADIENT.length - 1)
  const i = Math.min(FLARE_GRADIENT.length - 2, Math.floor(x))
  const f = x - i
  const a = FLARE_GRADIENT[i]
  const b = FLARE_GRADIENT[i + 1]
  return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f))
}

const FIELD_DEPTH = 0.42 // fields reach this share of the screen height from each edge
// how much further the textures reach towards the middle at the far left
// and right (1 = no change); they curve up into the corners
const CORNER_LIFT = 1.45

// 0 in the centre column, 1 at the left/right edge, eased
const sideness = nx => Math.pow(Math.abs(nx - 0.5) * 2, 2.2)
const reachAt = nx => 1 + (CORNER_LIFT - 1) * sideness(nx)

const BRIGHT = [214, 198, 255]
const MID = [150, 118, 245]
const GRID = [120, 92, 215]

const rand = (a, b) => a + Math.random() * (b - a)
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`

function TextureBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const grid = document.createElement('canvas')
    const gctx = grid.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let cols = 0 // in field blocks
    let rows = 0 // in field blocks
    let field = [] // flickering pixels
    let raf = 0
    let last = 0
    let time = 0

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      for (const [cv, cx] of [[canvas, ctx], [grid, gctx]]) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
        cx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      // static grid, drawn once: dims and thins out towards the middle
      gctx.clearRect(0, 0, w, h)
      const gridCols = Math.ceil(w / PITCH)
      const gridRows = Math.ceil(h / PITCH)
      const off = (PITCH - DOT) / 2
      // the reach curves up towards the left and right corners
      const colReach = Array.from({ length: gridCols }, (_, c) => 0.9 * reachAt(c / gridCols))
      for (let r = 0; r < gridRows; r++) {
        const edge = Math.min(r, gridRows - 1 - r) / (gridRows / 2) // 0 edge, 1 middle
        for (let c = 0; c < gridCols; c++) {
          const f = Math.max(0, 1 - edge / colReach[c])
          const fade = f * f * (3 - 2 * f)
          if (fade <= 0 || Math.random() >= fade) continue
          gctx.fillStyle = rgba(GRID, 0.05 + 0.17 * fade)
          gctx.fillRect(c * PITCH + off, r * PITCH + off, DOT, DOT)
        }
      }

      // flickering fields: one pixel per 2x2 block, densest at the edges
      cols = Math.ceil(w / (BLOCK * PITCH))
      rows = Math.floor(h / (BLOCK * PITCH))
      field = []
      for (let c = 0; c < cols; c++) {
        // deeper towards the left and right, curving up into the corners
        const depthRows = Math.min(rows / 2, Math.round(rows * FIELD_DEPTH * reachAt(c / cols)))
        for (let d = 0; d < depthRows; d++) {
          const t = d / depthRows // 0 at the edge, 1 at the field's inner limit
          const presence = Math.pow(1 - t, 1.5) * 0.8
          for (const dir of [1, -1]) {
            if (Math.random() > presence) continue
            field.push({
              c,
              r: dir === 1 ? d : rows - 1 - d,
              base: (0.25 + 0.45 * (1 - t)) * rand(0.55, 1),
              // each pixel flickers at its own pace, plus occasional hard blinks
              phase: Math.random() * Math.PI * 2,
              rate: rand(0.12, 0.45), // slow: one shimmer every ~15-50 seconds
              blink: 0,
              flare: 0, // frames left of a bright-light flare
              flareLen: 0,
              flareHue: 0 // where on FLARE_GRADIENT this light starts
            })
          }
        }
      }
    }

    function drawFrame() {
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(grid, 0, 0, w, h)

      // group by quantised alpha so each fillStyle is set once per level
      const buckets = new Map()
      const flares = [] // lit pixels, drawn on top in their own colours
      for (const p of field) {
        // slow shimmer, plus a rare, gentle fade out and back in
        if (p.blink > 0) p.blink--
        else if (Math.random() < 0.0004) p.blink = 40 + Math.floor(Math.random() * 40)
        const shimmer = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * p.rate + p.phase))
        const dip = p.blink > 0 ? Math.abs(Math.cos((p.blink / 80) * Math.PI)) : 1
        const a = p.base * shimmer * dip
        // bright light: eases up to near full brightness and back down,
        // shifting colour along the gradient as it goes
        if (p.flare > 0) {
          p.flare--
          const life = 1 - p.flare / p.flareLen
          const env = Math.sin(life * Math.PI)
          const fa = 0.95 * env * env * (3 - 2 * env)
          if (fa > a) {
            flares.push({ p, a: fa, color: gradientAt(p.flareHue + life * FLARE_DRIFT) })
            continue
          }
        } else if (Math.random() < FLARE_CHANCE) {
          p.flare = p.flareLen = FLARE_MIN + Math.floor(Math.random() * (FLARE_MAX - FLARE_MIN))
          p.flareHue = Math.random() * (1 - FLARE_DRIFT)
        }
        if (a < 0.02) continue
        const key = Math.round(a * 20)
        let list = buckets.get(key)
        if (!list) buckets.set(key, (list = []))
        list.push(p)
      }
      for (const [key, list] of buckets) {
        const a = key / 20
        ctx.fillStyle = rgba(a > 0.6 ? BRIGHT : MID, a)
        for (const p of list) ctx.fillRect(p.c * PITCH + PIXEL_OFF, p.r * PITCH + PIXEL_OFF, PIXEL, PIXEL)
      }
      for (const { p, a, color } of flares) {
        ctx.fillStyle = rgba(color, a)
        ctx.fillRect(p.c * PITCH + PIXEL_OFF, p.r * PITCH + PIXEL_OFF, PIXEL, PIXEL)
      }
    }

    function draw(now) {
      raf = requestAnimationFrame(draw)
      if (now - last < 1000 / FPS - 1) return
      last = now
      time += 1 / FPS

      drawFrame()
    }

    resize()
    if (reduceMotion) drawFrame()
    else raf = requestAnimationFrame(draw)

    const onResize = () => {
      resize()
      if (reduceMotion) drawFrame()
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className="matrix-rain" aria-hidden="true" />
}

export default TextureBackground
