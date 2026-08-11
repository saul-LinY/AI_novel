import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const piRoot = join(projectRoot, "vendor", "pi");
const piPackage = join(piRoot, "packages", "coding-agent", "package.json");
const piEntry = join(piRoot, "packages", "coding-agent", "dist", "index.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, cwd) {
  const result = spawnSync(npmCommand, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(piPackage)) {
  throw new Error("找不到 vendor/pi 中的 Pi 源码");
}

const { version } = JSON.parse(readFileSync(piPackage, "utf8"));
console.log(`[AI novel] installing Pi source dependencies (v${version})`);
run(["ci", "--ignore-scripts"], piRoot);

console.log("[AI novel] preparing Pi model catalog data");
run(["run", "hydrate:model-data"], piRoot);

console.log("[AI novel] building the local Pi source");
run(["run", "build:offline"], piRoot);

console.log("[AI novel] installing app dependencies");
run(["install", "--ignore-scripts"], projectRoot);

if (!existsSync(piEntry)) {
  throw new Error("Pi 构建完成后仍找不到 dist/index.js");
}

console.log(`[AI novel] local Pi is ready: ${piEntry}`);
