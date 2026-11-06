// Guards the first load: an image pasted into an SVG once made the logo 1.44 MB.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const LIMIT_KB = 200
const ASSETS = path.resolve('src/assets')

// fonts are big by nature, so only images and icons are checked
const images = fs.readdirSync(ASSETS, { recursive: true })
  .filter(file => /\.(svg|png|jpe?g|webp)$/i.test(file))

describe('image sizes', () => {
  it('finds the images', () => {
    expect(images.length).toBeGreaterThan(0)
  })

  it.each(images)(`%s is under ${LIMIT_KB} kB`, file => {
    expect(fs.statSync(path.join(ASSETS, file)).size).toBeLessThan(LIMIT_KB * 1024)
  })
})
