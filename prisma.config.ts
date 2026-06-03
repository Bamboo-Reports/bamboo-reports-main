import "dotenv/config"
import { defineConfig } from "prisma/config"

const datasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: datasourceUrl ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
})
