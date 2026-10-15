import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MEMORY_CONFIG, readMemoryConfig, createStoryMemory } from '../src/memory/story-memory.js';
import { loadStoryPackage, resolvePlayableRole } from '../src/story-package.js';
import { StoryStore } from '../src/story-store.js';
import { readGraphitiConfig } from '../src/memory/graphiti-memory.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.AI_NOVEL_DATA_DIR ?? join(root, '.ai-novel');
const configPath = join(dataDir, 'memory', 'config.json');
const action = process.argv[2] ?? 'status';
if (action === 'setup') {
  const config = { ...await readMemoryConfig(dataDir), enabled: true };
  await mkdir(dirname(configPath), { recursive: true });
  const settings = Object.fromEntries(Object.keys(DEFAULT_MEMORY_CONFIG).map((key) => [key, config[key]]));
  await writeFile(configPath, JSON.stringify(settings, null, 2));
  console.log(JSON.stringify({ configured: true, configPath, retriever: 'bm25', networkRequired: false }, null, 2));
} else if (action === 'status') {
  const config = await readMemoryConfig(dataDir);
  const graphiti = await readGraphitiConfig(dataDir);
  console.log(JSON.stringify({ enabled: config.enabled, retriever: 'bm25', networkRequired: config.enabled && graphiti.enabled, graphiti: { enabled: config.enabled && graphiti.enabled, url: graphiti.url }, indexDirectory: join(dataDir, 'memory', 'bm25'), configPath }, null, 2));
} else if (action === 'probe') {
  const { BM25Index } = await import('../src/memory/bm25.js');
  console.log(JSON.stringify({ retriever: 'bm25', ok: new BM25Index([{ id: 'probe', text: '本地记忆检索', ordinal: 0 }]).search('记忆', 1).length === 1, remoteRequests: 0 }));
} else if (action === 'index') {
  let storyPackage = await loadStoryPackage(root, 'dragon-raja');
  const store = await new StoryStore(dataDir, storyPackage).load();
  if (store.story.selectedPlayerCharacterId) storyPackage = resolvePlayableRole(storyPackage, store.story.selectedPlayerCharacterId);
  const memory = await createStoryMemory({ dataDir });
  if (!memory.config.enabled) throw new Error('Run npm run memory:setup first.');
  try { console.log(JSON.stringify(await memory.sync({ store, storyPackage }), null, 2)); }
  finally { memory.close(); }
} else throw new Error('Usage: node scripts/memory-local.js setup|status|probe|index');
