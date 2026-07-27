import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectDirectory = process.cwd();
const standaloneDirectory = path.join(projectDirectory, ".next", "standalone");
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(projectDirectory, ".env"));
if (process.env.DATABASE_URL?.startsWith("file:./")) {
  process.env.DATABASE_URL = `file:${path.join(projectDirectory, "prisma", process.env.DATABASE_URL.slice("file:./".length))}`;
}
await mkdir(path.join(standaloneDirectory, ".next"), { recursive: true });
await cp(path.join(projectDirectory, ".next", "static"), path.join(standaloneDirectory, ".next", "static"), { recursive: true, force: true });
await cp(path.join(projectDirectory, "public"), path.join(standaloneDirectory, "public"), { recursive: true, force: true });

const server = spawn(process.execPath, [path.join(standaloneDirectory, "server.js")], {
  cwd: standaloneDirectory,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 0 : 1));
});
