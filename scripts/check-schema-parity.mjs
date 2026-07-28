import { readdir, readFile } from "node:fs/promises";

async function portableModelTokens(filename) {
  const schema = await readFile(filename, "utf8");
  return schema
    .replace(/datasource\s+db\s*\{[^}]+\}/s, "")
    .replace(/\s+/g, " ")
    .trim();
}

const sqlite = await portableModelTokens("prisma/schema.prisma");
const postgres = await portableModelTokens("prisma/postgresql/schema.prisma");

async function migrationNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

const [sqliteMigrations, postgresMigrations, sqliteLock, postgresLock] = await Promise.all([
  migrationNames("prisma/migrations"),
  migrationNames("prisma/postgresql/migrations"),
  readFile("prisma/migrations/migration_lock.toml", "utf8"),
  readFile("prisma/postgresql/migrations/migration_lock.toml", "utf8"),
]);

const errors = [];
if (sqlite !== postgres) errors.push("SQLite and PostgreSQL model definitions have drifted. Update both Prisma schemas together.");
if (JSON.stringify(sqliteMigrations) !== JSON.stringify(postgresMigrations)) {
  errors.push(`Migration histories have drifted: SQLite=${sqliteMigrations.join(",")} PostgreSQL=${postgresMigrations.join(",")}.`);
}
if (!/provider\s*=\s*"sqlite"/.test(sqliteLock)) errors.push("SQLite migration lock has the wrong provider.");
if (!/provider\s*=\s*"postgresql"/.test(postgresLock)) errors.push("PostgreSQL migration lock has the wrong provider.");

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`SQLite and PostgreSQL schemas and ${sqliteMigrations.length} migration stages match.`);
}
