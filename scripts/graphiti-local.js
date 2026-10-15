import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GRAPHITI_CONFIG, createGraphitiMemory } from '../src/memory/graphiti-memory.js';
import { buildGraphSnapshot, verifyGraphHits, graphLifecycle } from '../src/memory/graphiti-projection.js';
import { buildMemoryCorpus } from '../src/memory/cards.js';
import { loadStoryPackage, resolvePlayableRole } from '../src/story-package.js';
import { StoryStore } from '../src/story-store.js';
import { readMemoryConfig } from '../src/memory/story-memory.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(process.env.AI_NOVEL_DATA_DIR ?? join(root, '.ai-novel'));
const graphDir = join(dataDir, 'graphiti');
const python = join(graphDir, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const action = process.argv[2] ?? 'status';
const json = async (path, fallback) => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    const stop = (signal) => child.kill(signal);
    const term = () => stop('SIGTERM');
    const interrupt = () => stop('SIGINT');
    process.once('SIGTERM', term); process.once('SIGINT', interrupt);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.off('SIGTERM', term); process.off('SIGINT', interrupt);
      if (code === 0 || signal) resolve(); else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function input() {
  let storyPackage = await loadStoryPackage(root, process.env.AI_NOVEL_STORY_ID ?? 'dragon-raja');
  const store = await new StoryStore(dataDir, storyPackage).load();
  if (store.story.selectedPlayerCharacterId) storyPackage = resolvePlayableRole(storyPackage, store.story.selectedPlayerCharacterId);
  const context = { store, storyPackage, branchId: store.currentBranchId, instanceId: dataDir };
  const corpus = buildMemoryCorpus(context);
  return { corpus, snapshot: { ...buildGraphSnapshot(corpus, context), ...graphLifecycle(context) } };
}

if (action === 'setup') {
  await mkdir(graphDir, { recursive: true, mode: 0o700 });
  if (!existsSync(python)) await run('uv', ['venv', '--python', '3.11', join(graphDir, 'venv')]);
  await run('uv', ['pip', 'sync', '--python', python, join(root, 'services/graphiti/requirements.lock')]);
  const envPath = join(graphDir, 'service.env');
  if (!existsSync(envPath)) {
    const agentDir = process.env.PI_AGENT_DIR ?? join(homedir(), '.pi/agent');
    const models = await json(join(agentDir, 'models.json'), {});
    const auth = await json(join(agentDir, 'auth.json'), {});
    const providerId = process.env.PI_STORY_PROVIDER ?? 'pi-gateway';
    const provider = models.providers?.[providerId];
    const apiKey = process.env.GRAPHITI_LLM_API_KEY ?? auth[providerId]?.key;
    const baseUrl = process.env.GRAPHITI_LLM_BASE_URL ?? provider?.baseUrl;
    const model = process.env.GRAPHITI_LLM_MODEL ?? process.env.PI_STORY_MODEL ?? 'deepseek-v4.1-flash:cloud';
    if (!apiKey || !baseUrl) throw new Error('Set GRAPHITI_LLM_API_KEY and GRAPHITI_LLM_BASE_URL, or configure the Pi provider.');
    const values = { GRAPHITI_API_TOKEN: randomBytes(32).toString('hex'), GRAPHITI_LLM_API_KEY: apiKey, GRAPHITI_LLM_BASE_URL: baseUrl, GRAPHITI_LLM_MODEL: model };
    await writeFile(envPath, Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  }
  // Check connection configuration exists before enabling the integration.
  await readFile(join(dataDir, 'neo4j/connection.env'), 'utf8');
  await writeFile(join(graphDir, 'config.json'), JSON.stringify({ ...DEFAULT_GRAPHITI_CONFIG, ...await json(join(graphDir, 'config.json'), {}), enabled: true }, null, 2) + '\n');
  await mkdir(join(dataDir, 'memory'), { recursive: true });
  await writeFile(join(dataDir, 'memory/config.json'), JSON.stringify({ ...await readMemoryConfig(dataDir), enabled: true }, null, 2) + '\n');
  console.log('Graphiti configured. Run npm run graphiti:serve, then npm run graphiti:index.');
} else if (action === 'serve') {
  const env = { ...process.env, ...parseEnv(await readFile(join(dataDir, 'neo4j/connection.env'), 'utf8')), ...parseEnv(await readFile(join(graphDir, 'service.env'), 'utf8')), GRAPHITI_DATA_DIR: graphDir, EMBEDDING_DIM: '512', GRAPHITI_TELEMETRY_ENABLED: 'false', HF_HUB_DISABLE_XET: '1' };
  const config = await json(join(graphDir, 'config.json'), DEFAULT_GRAPHITI_CONFIG);
  const port = new URL(config.url).port || '4320';
  await run(python, ['-m', 'uvicorn', 'app:app', '--app-dir', join(root, 'services/graphiti'), '--host', '127.0.0.1', '--port', port, '--no-access-log'], { env });
} else {
  const graph = await createGraphitiMemory({ dataDir });
  if (!graph) throw new Error('Run npm run graphiti:setup first.');
  try {
    if (action === 'status') {
      console.log(JSON.stringify({ health: await graph.request('/health'), ...await graph.request('/status') }, null, 2));
    } else if (action === 'index') {
      const { snapshot } = await input();
      console.log(JSON.stringify(await graph.request('/sync', snapshot, 10000), null, 2));
    } else if (action === 'history') {
      const entity = process.argv[3];
      if (!entity) throw new Error('Usage: npm run graphiti:history -- <entity-id> [global|environment|character:id]');
      const view = process.argv[4] ?? 'global';
      const { corpus, snapshot } = await input();
      const stream = snapshot.streams.find((s) => s.view === view);
      if (!stream) throw new Error('No authorized records for this perspective');
      const result = await graph.request('/history?' + new URLSearchParams({ scope: stream.scope, view, entity, fingerprint: stream.fingerprint }));
      const { hits, rejected } = verifyGraphHits({ hits: result.entries }, corpus.records.filter((r) => r.view === view));
      console.log(JSON.stringify({ entity, view, state: result.state, rejected, entries: hits.map(({ record }) => record) }, null, 2));
    } else throw new Error('Usage: graphiti-local.js setup|serve|status|index|history');
  } finally { graph.close(); }
}
