import { getDashboardData } from "@/app/actions/data"
import { promisify } from "node:util"
import { gzip as gzipCb } from "node:zlib"

const gzip = promisify(gzipCb)

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const start = Date.now()
  const acceptEncoding = request.headers.get("accept-encoding") || ""

  const queryStart = Date.now()
  const data = await getDashboardData()
  const queryMs = Date.now() - queryStart

  const json = JSON.stringify(data)
  const rawSize = json.length

  console.log(`[/api/dashboard] DB queries: ${queryMs}ms`)
  console.log(`[/api/dashboard] Raw JSON: ${(rawSize / 1024 / 1024).toFixed(1)}MB`)

  // Async gzip if client supports it (non-blocking)
  if (acceptEncoding.includes("gzip")) {
    const compressStart = Date.now()
    const compressed = await gzip(Buffer.from(json))
    const compressMs = Date.now() - compressStart

    console.log(`[/api/dashboard] Gzip'd: ${(compressed.length / 1024 / 1024).toFixed(1)}MB (${compressMs}ms to compress)`)
    console.log(`[/api/dashboard] Total: ${Date.now() - start}ms`)

    return new Response(compressed, {
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
    })
  }

  console.log(`[/api/dashboard] No gzip support, sending raw`)
  console.log(`[/api/dashboard] Total: ${Date.now() - start}ms`)

  return new Response(json, {
    headers: { "Content-Type": "application/json" },
  })
}
