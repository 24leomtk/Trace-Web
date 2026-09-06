import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { defineConfig } from "drizzle-kit"

function loadDatabaseUrlFromEnvFiles() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = join(process.cwd(), filename)
    if (!existsSync(filepath)) continue

    for (const rawLine of readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue

      const separator = line.indexOf("=")
      if (separator === -1) continue

      const key = line.slice(0, separator).trim()
      if (key !== "DATABASE_URL" && key !== "NEXT_PUBLIC_DATABASE_URL") {
        continue
      }
      if (process.env[key]) continue

      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  }
}

loadDatabaseUrlFromEnvFiles()

const databaseUrl =
  process.env.DATABASE_URL ?? process.env.NEXT_PUBLIC_DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Set DATABASE_URL in .env.local or the shell."
  )
}

export default defineConfig({
  out: "./db/sql/migrations",
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
})
