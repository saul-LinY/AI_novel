import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Turn-pipeline switches. Pacing and foreshadowing are enforced at the
// proposal gate by default; the continuity recorder costs one extra model call
// per turn, after the prose is already on screen.
export const DEFAULT_PIPELINE_CONFIG = Object.freeze({
  beats: true,
  outcomeSummary: true,
  choices: 'inline',
  narrative: 'enforce',
  recorder: 'agent',
  quality: 'warn',
  slimContext: true,
  recorderTimeoutMs: 30000,
  maxResumes: 5,
});

const ENV_OVERRIDES = [
  ['AI_NOVEL_BEATS', 'beats', 'boolean'],
  ['AI_NOVEL_OUTCOME_SUMMARY', 'outcomeSummary', 'boolean'],
  ['AI_NOVEL_CHOICES', 'choices', 'string'],
  ['AI_NOVEL_NARRATIVE', 'narrative', 'string'],
  ['AI_NOVEL_RECORDER', 'recorder', 'string'],
  ['AI_NOVEL_QUALITY', 'quality', 'string'],
  ['AI_NOVEL_SLIM_CONTEXT', 'slimContext', 'boolean'],
];

function parseBoolean(value, name) {
  if (['on', 'true', '1'].includes(value)) return true;
  if (['off', 'false', '0'].includes(value)) return false;
  throw new Error(`Invalid ${name}: ${value}`);
}

export async function readPipelineConfig(dataDir, env = process.env) {
  let config = {};
  try { config = JSON.parse(await readFile(join(dataDir, 'pipeline.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const [name, key, type] of ENV_OVERRIDES) {
    const value = env[name];
    if (value === undefined || value === '') continue;
    config[key] = type === 'boolean' ? parseBoolean(value, name) : value;
  }
  return validatePipelineConfig(config);
}

export function validatePipelineConfig(input = {}) {
  const config = Object.fromEntries(Object.entries(DEFAULT_PIPELINE_CONFIG).map(([key, fallback]) => [key, input[key] ?? fallback]));
  for (const key of ['beats', 'outcomeSummary', 'slimContext']) {
    if (typeof config[key] !== 'boolean') throw new Error(`Invalid pipeline ${key}`);
  }
  if (!['inline', 'parallel'].includes(config.choices)) throw new Error('Invalid pipeline choices: inline | parallel');
  if (!['enforce', 'advise', 'off'].includes(config.narrative)) throw new Error('Invalid pipeline narrative: enforce | advise | off');
  if (!['agent', 'off'].includes(config.recorder)) throw new Error('Invalid pipeline recorder: agent | off');
  if (!['enforce', 'warn', 'off'].includes(config.quality)) throw new Error('Invalid pipeline quality: enforce | warn | off');
  for (const [key, min, max] of [['recorderTimeoutMs', 1000, 120000], ['maxResumes', 1, 20]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`Invalid pipeline ${key}`);
  }
  return Object.freeze(config);
}
