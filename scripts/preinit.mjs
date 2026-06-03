#!/usr/bin/env node

const { execSync } = await import("child_process")
const { existsSync, readFileSync } = await import("fs")
const { resolve } = await import("path")

const ESC = "\x1b"
const BOLD = `${ESC}[1m`
const DIM = `${ESC}[2m`
const ITALIC = `${ESC}[3m`
const RESET = `${ESC}[0m`

// 256-color palette
const C = {
  orange: `${ESC}[38;5;208m`,
  gold: `${ESC}[38;5;220m`,
  green: `${ESC}[38;5;42m`,
  teal: `${ESC}[38;5;37m`,
  cyan: `${ESC}[38;5;45m`,
  blue: `${ESC}[38;5;33m`,
  purple: `${ESC}[38;5;135m`,
  magenta: `${ESC}[38;5;199m`,
  pink: `${ESC}[38;5;212m`,
  red: `${ESC}[38;5;196m`,
  yellow: `${ESC}[38;5;214m`,
  white: `${ESC}[38;5;255m`,
  grey: `${ESC}[38;5;59m`,
  darkGrey: `${ESC}[38;5;239m`,
}

const BG = {
  green: `${ESC}[48;5;42m`,
  red: `${ESC}[48;5;196m`,
  yellow: `${ESC}[48;5;214m`,
  blue: `${ESC}[48;5;33m`,
  purple: `${ESC}[48;5;135m`,
  dark: `${ESC}[48;5;235m`,
}

const ERASE_LINE = `${ESC}[2K`

const { version } = JSON.parse(readFileSync(resolve("package.json"), "utf-8"))

const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
]

const OPTIONAL_ENV_KEYS = [
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_MAPTILER_KEY",
  "NEXT_PUBLIC_LOGO_DEV_KEY",
  "DIRECT_URL",
  "NEXT_PUBLIC_ENVIRONMENT_LABEL",
  "NEXT_PUBLIC_MAINTENANCE_MODE",
  "NEXT_PUBLIC_NOTIFICATIONS_ENABLED",
]

function banner() {
  const lines = [
    [
      "  ▗▄▄▖  ▗▄▖ ▗▖  ▗▖▗▄▄▖  ▗▄▖  ▗▄▖     ▗▄▄▖ ▗▄▄▄▖▗▄▄▖  ▗▄▖ ▗▄▄▖▗▄▄▄▖▗▄▄▖",
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.blue,
      C.purple,
      C.magenta,
      C.pink,
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.blue,
      C.purple,
      C.magenta,
    ],
    [
      "  ▐▌ ▐▌▐▌ ▐▌▐▛▚▞▜▌▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌    ▐▌ ▐▌▐▌   ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌ █ ▐▌   ",
      C.blue,
      C.purple,
      C.magenta,
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.cyan,
      C.blue,
      C.purple,
      C.magenta,
      C.orange,
      C.gold,
      C.green,
      C.teal,
    ],
    [
      "  ▐▛▀▚▖▐▛▀▜▌▐▌  ▐▌▐▛▀▚▖▐▌ ▐▌▐▌ ▐▌    ▐▛▀▚▖▐▛▀▀▘▐▛▀▘ ▐▌ ▐▌▐▛▀▚▖ █  ▝▀▚▖",
      C.purple,
      C.magenta,
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.cyan,
      C.blue,
      C.purple,
      C.magenta,
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.cyan,
    ],
    [
      "  ▐▙▄▞▘▐▌ ▐▌▐▌  ▐▌▐▙▄▞▘▝▚▄▞▘▝▚▄▞▘    ▐▌ ▐▌▐▙▄▄▖▐▌   ▝▚▄▞▘▐▌ ▐▌ █ ▗▄▄▞▘",
      C.magenta,
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.cyan,
      C.blue,
      C.purple,
      C.magenta,
      C.orange,
      C.gold,
      C.green,
      C.teal,
      C.cyan,
      C.blue,
    ],
  ]
  for (const [text, ...colors] of lines) {
    let out = ""
    const chars = [...text]
    for (let i = 0; i < chars.length; i++) {
      const color = colors[i % colors.length]
      out += color + BOLD + chars[i]
    }
    console.log(out + RESET)
  }
  console.log(`  ${DIM}${C.grey}By ResearchNXT  v${version}${RESET}`)
  console.log()
}

function coloredBadge(text, bgColor, fgColor = C.white) {
  return `${bgColor}${BOLD}${fgColor} ${text} ${RESET}`
}

function log(category, label, statusFn) {
  const status = statusFn()
  let badge
  let statusColor
  if (status === "ok") {
    badge = coloredBadge("\u2713", BG.green)
    statusColor = C.green
  } else if (status === "fail") {
    badge = coloredBadge("\u2717", BG.red)
    statusColor = C.red
  } else {
    badge = coloredBadge("\u2014", BG.yellow, C.darkGrey)
    statusColor = C.yellow
  }
  const stepBadge = coloredBadge(category, BG.dark, C.cyan)
  const dot = `${statusColor}\u25CF${RESET}`
  console.log(`  ${badge} ${stepBadge} ${label}`)
}

function logSpinner(category, label) {
  const stepBadge = coloredBadge(category, BG.dark, C.cyan)
  process.stdout.write(`  ${coloredBadge("\u25E6", BG.yellow, C.darkGrey)} ${stepBadge} ${label} ...`)
}

function logSpinnerDone(status) {
  process.stdout.write(`\r${ERASE_LINE}`)
  if (status === "ok") {
    log("PRISMA", "client generated", () => "ok")
  } else {
    log("PRISMA", "generation failed", () => "fail")
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadEnv() {
  const envPath = resolve(".env")
  const envExamplePath = resolve(".env.example")
  if (!existsSync(envPath)) {
    return { exists: false, exampleExists: existsSync(envExamplePath), vars: {} }
  }
  const content = readFileSync(envPath, "utf-8")
  const vars = {}
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key) vars[key] = value
  }
  return { exists: true, exampleExists: existsSync(envExamplePath), vars }
}

function checkEnvVars(env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => {
    const val = env.vars[key]
    return !val || val === "" || val.startsWith("your_")
  })
  return { missing }
}

function checkPrismaClient() {
  const generatedPath = resolve("lib/generated/prisma/client.ts")
  return existsSync(generatedPath)
}

function runPrismaGenerate() {
  try {
    execSync("npx prisma generate", {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      encoding: "utf-8",
    })
    return true
  } catch {
    return false
  }
}

function checkDependencies() {
  try {
    execSync("node -e \"require('next')\"", { stdio: "ignore", timeout: 10000 })
    execSync("node -e \"require('react')\"", { stdio: "ignore", timeout: 10000 })
    return true
  } catch {
    return false
  }
}

async function main() {
  console.clear()
  banner()
  await wait(200)

  // ── Step 1: .env file ──────────────────────────────────────────
  const env = loadEnv()
  let envOk = true
  if (!env.exists) {
    log("ENV", `${C.red}${BOLD}.env file not found${RESET}`, () => "fail")
    envOk = false
  } else {
    log("ENV", `${C.green}.env file found${RESET}`, () => "ok")
  }
  if (!env.exampleExists) {
    log("ENV", `${C.yellow}.env.example not found${RESET}`, () => "skip")
  }
  await wait(150)

  // ── Step 2: Environment variables ──────────────────────────────
  if (env.exists) {
    const { missing } = checkEnvVars(env)
    if (missing.length > 0) {
      log("VARS", `${C.red}${BOLD}missing:${RESET} ${missing.join(", ")}`, () => "fail")
      envOk = false
    } else {
      log("VARS", `${C.green}all required vars present${RESET}`, () => "ok")
    }

    for (const key of OPTIONAL_ENV_KEYS) {
      const val = env.vars[key]
      if (val && !val.startsWith("your_")) {
        const display = key.startsWith("NEXT_PUBLIC_") ? key.slice(12) : key
        log("VARS", `${C.teal}${display}${RESET} ${DIM}configured${RESET}`, () => "ok")
      }
    }
  }
  await wait(150)

  // ── Step 3: Dependencies ───────────────────────────────────────
  const depsOk = checkDependencies()
  if (depsOk) {
    log("DEPS", `${C.green}node_modules installed${RESET}`, () => "ok")
  } else {
    log("DEPS", `${C.red}node_modules missing \u2014 run npm install${RESET}`, () => "fail")
  }
  await wait(150)

  // ── Step 4: Prisma client ──────────────────────────────────────
  const prismaOk = checkPrismaClient()
  if (prismaOk) {
    log("PRISMA", `${C.green}client generated${RESET}`, () => "ok")
  } else if (depsOk) {
    await wait(100)
    logSpinner("PRISMA", `${C.yellow}generating${RESET}`)
    const generated = runPrismaGenerate()
    logSpinnerDone(generated ? "ok" : "fail")
  } else {
    log("PRISMA", `${C.yellow}skip (deps missing)${RESET}`, () => "skip")
  }
  await wait(200)

  // ── Summary ────────────────────────────────────────────────────
  console.log()
  if (envOk && depsOk) {
    const bar = `${BG.green}${BOLD}${C.white}  READY  ${RESET}`
    console.log(
      `  ${C.green}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${RESET}`
    )
    console.log(
      `  ${bar}  ${C.white}${BOLD}Dashboard initialized \u2713${RESET}  ${C.grey}${DIM}everything looks good${RESET}`
    )
    console.log(
      `  ${C.green}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${RESET}`
    )
    console.log()
  } else if (!envOk) {
    const bar = `${BG.red}${BOLD}${C.white}  FAIL  ${RESET}`
    console.log(
      `  ${C.red}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${RESET}`
    )
    console.log(`  ${bar}  ${C.red}${BOLD}Setup incomplete${RESET}`)
    console.log(`  ${DIM}${C.grey}Copy .env.example to .env and fill in required values${RESET}`)
    console.log(
      `  ${C.red}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${RESET}`
    )
    console.log()
    process.exit(1)
  } else {
    const bar = `${BG.yellow}${BOLD}${C.darkGrey}  SKIP  ${RESET}`
    console.log(
      `  ${C.yellow}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${RESET}`
    )
    console.log(`  ${bar}  ${C.yellow}${BOLD}Dependencies missing${RESET}`)
    console.log(`  ${DIM}${C.grey}Run npm install and try again${RESET}`)
    console.log(
      `  ${C.yellow}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${RESET}`
    )
    console.log()
    process.exit(1)
  }
}

main()
