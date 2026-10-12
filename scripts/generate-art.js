#!/usr/bin/env node

// Batch art generation for a story package.
//
//   node scripts/generate-art.js <manifest.json> [--only id,id] [--group name] [--force] [--concurrency N] [--dry-run]
//
// The manifest lists jobs: { id, group, prompt | promptFile, size, refs?: [path], output, after?: id }.
// `style` (string) is prefixed to every prompt. Jobs with refs use the edit endpoint so the model keeps
// character identity. A job with `after` waits for that job and may reference its output in refs.
// Existing outputs are skipped unless --force. Results are appended to report.json beside the manifest.

import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gatewayConfig, loadDotEnv, requestEdit, requestGenerate, saveImage } from './imagegen.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MAX_ATTEMPTS = 3;

function parseArgs(argv) {
  const options = { manifest: null, only: null, group: null, force: false, concurrency: 3, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--only') options.only = new Set(argv[++index].split(','));
    else if (arg === '--group') options.group = argv[++index];
    else if (arg === '--force') options.force = true;
    else if (arg === '--concurrency') options.concurrency = Math.max(1, Number(argv[++index]) || 1);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (!options.manifest) options.manifest = arg;
    else throw new Error(`unexpected argument "${arg}"`);
  }
  if (!options.manifest) throw new Error('usage: generate-art.js <manifest.json> [--only ids] [--group name] [--force]');
  return options;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function promptFor(job, manifest, manifestDir) {
  const body = job.promptFile ? await readFile(path.resolve(manifestDir, job.promptFile), 'utf8') : job.prompt;
  return [manifest.style, job.groupStyle, body].filter(Boolean).join('\n\n').trim();
}

async function runJob(job, manifest, manifestDir, config, options) {
  const output = path.resolve(ROOT, job.output);
  if (!options.force && await exists(output)) return { id: job.id, status: 'skipped', output: job.output };
  const prompt = await promptFor(job, manifest, manifestDir);
  const refs = (job.refs ?? []).map((ref) => path.resolve(ROOT, ref));
  if (options.dryRun) {
    console.log(`--- ${job.id} (${job.size}, refs: ${job.refs?.join(', ') || 'none'})\n${prompt}\n`);
    return { id: job.id, status: 'dry-run' };
  }
  for (const ref of refs) {
    if (!await exists(ref)) throw new Error(`${job.id}: missing reference ${ref}`);
  }
  const request = { model: manifest.model ?? 'gpt-image-2', prompt, size: job.size ?? '1024x1024', n: 1, images: refs };
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    try {
      const data = refs.length ? await requestEdit(request, config) : await requestGenerate(request, config);
      await saveImage(data[0], output);
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`✓ ${job.id} → ${job.output} (${seconds}s, attempt ${attempt})`);
      return { id: job.id, status: 'generated', output: job.output, attempt, seconds: Number(seconds), at: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      console.warn(`… ${job.id} attempt ${attempt} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
  return { id: job.id, status: 'failed', output: job.output, error: lastError?.message };
}

async function main() {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const manifestDir = path.dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const groupStyles = manifest.groupStyles ?? {};
  const jobs = manifest.jobs
    .filter((job) => !options.only || options.only.has(job.id))
    .filter((job) => !options.group || job.group === options.group)
    .map((job) => ({ ...job, groupStyle: groupStyles[job.group] }));
  const config = options.dryRun ? null : gatewayConfig({});

  const done = new Map();
  const pending = new Map(jobs.map((job) => [job.id, job]));
  const results = [];
  const running = new Set();

  const launch = (job) => {
    pending.delete(job.id);
    const task = runJob(job, manifest, manifestDir, config, options)
      .catch((error) => ({ id: job.id, status: 'failed', output: job.output, error: error.message }))
      .then((result) => {
        results.push(result);
        done.set(job.id, result);
        running.delete(task);
      });
    running.add(task);
  };

  while (pending.size || running.size) {
    for (const job of [...pending.values()]) {
      if (running.size >= options.concurrency) break;
      const dependency = job.after;
      const ready = !dependency || !pending.has(dependency) && !jobs.some((j) => j.id === dependency && !done.has(j.id));
      if (ready) launch(job);
    }
    if (running.size) await Promise.race(running);
    else if (pending.size) throw new Error(`unresolvable dependencies: ${[...pending.keys()].join(', ')}`);
  }

  if (!options.dryRun) {
    const reportPath = path.join(manifestDir, 'report.json');
    const previous = await exists(reportPath) ? JSON.parse(await readFile(reportPath, 'utf8')) : {};
    for (const result of results) if (result.status !== 'skipped') previous[result.id] = result;
    await writeFile(reportPath, `${JSON.stringify(previous, null, 2)}\n`);
  }
  const failed = results.filter((result) => result.status === 'failed');
  console.log(`\n${results.length} jobs: ${results.filter((r) => r.status === 'generated').length} generated, ${results.filter((r) => r.status === 'skipped').length} skipped, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`generate-art: ${error.message}`);
  process.exitCode = 1;
});
