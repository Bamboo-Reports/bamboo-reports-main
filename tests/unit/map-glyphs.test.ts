import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(process.cwd(), "public", "map-glyphs")

function glyphFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? glyphFiles(path) : path.endsWith(".pbf") ? [path] : []
  })
}

describe("hosted map glyphs", () => {
  const files = glyphFiles(ROOT)

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  // They are served without Content-Encoding, so MapLibre must get the raw
  // protobuf. A glyph file starts with field 1 (the font stack), 0x0a; a
  // gzipped one starts with 1f 8b and fails with "Unimplemented type: 7".
  it.each(files.map((file) => [file.slice(ROOT.length + 1), file]))("%s is uncompressed protobuf", (_name, file) => {
    const bytes = readFileSync(file)
    expect(bytes[0]).toBe(0x0a)
  })
})
