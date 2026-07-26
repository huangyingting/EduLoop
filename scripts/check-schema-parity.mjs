import { readFile } from "node:fs/promises";

async function portableModelTokens(filename) {
  const schema = await readFile(filename, "utf8");
  return schema
    .replace(/datasource\s+db\s*\{[^}]+\}/s, "")
    .replace(/\s+/g, " ")
    .trim();
}

const sqlite = await portableModelTokens("prisma/schema.prisma");
const postgres = await portableModelTokens("prisma/postgresql/schema.prisma");

if (sqlite !== postgres) {
  console.error("SQLite and PostgreSQL model definitions have drifted. Update both Prisma schemas together.");
  process.exitCode = 1;
} else {
  console.log("SQLite and PostgreSQL model definitions match.");
}
