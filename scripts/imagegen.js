#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_SIZE = '1024x1024';

const HELP = `Usage:
  node scripts/imagegen.js generate --prompt <text> --output <file.png> [options]
  node scripts/imagegen.js edit --prompt <text> --output <file.png> --image <file.png> [--image <file.png>...] [options]

Options:
  --model <model>       Image model, default: ${DEFAULT_MODEL}
  --size <size>         Image size, default: ${DEFAULT_SIZE}
  --n <count>           Number of images, default: 1
  --base-url <url>      Gateway base URL, default: SUB2API_BASE_URL
  --api-key <key>       Gateway API key, default: SUB2API_API_KEY then OPENAI_API_KEY
  --help                Show this help

Environment:
  SUB2API_BASE_URL      Required unless --base-url is provided
  SUB2API_API_KEY       Preferred API key
  OPENAI_API_KEY        Fallback API key
`;

function loadDotEnv() {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function printHelp() {
  process.stdout.write(HELP);
}

function fail(message) {
  console.error(`imagegen: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    return { help: true };
  }
  if (!['generate', 'edit'].includes(command)) {
    throw new Error(`unknown command "${command}"`);
  }

  const options = {
    command,
    model: DEFAULT_MODEL,
    size: DEFAULT_SIZE,
    n: 1,
    images: [],
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument "${arg}"`);
    }

    const equalsIndex = arg.indexOf('=');
    const name = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      const value = rest[index];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`missing value for ${name}`);
      }
      return value;
    };

    switch (name) {
      case '--prompt':
        options.prompt = takeValue();
        break;
      case '--output':
        options.output = takeValue();
        break;
      case '--model':
        options.model = takeValue();
        break;
      case '--size':
        options.size = takeValue();
        break;
      case '--n':
        options.n = Number(takeValue());
        break;
      case '--base-url':
        options.baseUrl = takeValue();
        break;
      case '--api-key':
        options.apiKey = takeValue();
        break;
      case '--image':
        options.images.push(takeValue());
        break;
      default:
        throw new Error(`unknown option "${name}"`);
    }
  }

  return options;
}

function requireOption(options, property, flag) {
  if (!options[property]) {
    throw new Error(`missing required ${flag}`);
  }
}

function gatewayConfig(options) {
  const baseUrl = (options.baseUrl ?? process.env.SUB2API_BASE_URL ?? '').replace(/\/+$/, '');
  const apiKey = options.apiKey ?? process.env.SUB2API_API_KEY ?? process.env.OPENAI_API_KEY ?? '';

  if (!baseUrl) {
    throw new Error('set SUB2API_BASE_URL in .env or pass --base-url');
  }
  if (!apiKey) {
    throw new Error('set SUB2API_API_KEY or OPENAI_API_KEY in .env, or pass --api-key');
  }

  return { baseUrl, apiKey };
}

async function parseApiResponse(response) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? text ?? `HTTP ${response.status}`;
    throw new Error(`gateway request failed (${response.status}): ${message}`);
  }
  if (!Array.isArray(body.data) || body.data.length === 0) {
    throw new Error('gateway returned no image data');
  }
  return body.data;
}

async function requestGenerate(options, config) {
  const response = await fetch(`${config.baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      n: options.n,
      size: options.size,
    }),
  });
  return parseApiResponse(response);
}

async function requestEdit(options, config) {
  const form = new FormData();
  form.set('model', options.model);
  form.set('prompt', options.prompt);
  form.set('size', options.size);
  form.set('n', String(options.n));

  for (const imagePath of options.images) {
    await access(imagePath);
    const name = path.basename(imagePath);
    const buffer = await readFile(imagePath);
    form.append('image', new Blob([buffer], { type: mimeType(name) }), name);
  }

  const response = await fetch(`${config.baseUrl}/v1/images/edits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });
  return parseApiResponse(response);
}

function mimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function outputPathFor(requestedPath, index, total) {
  if (total <= 1) {
    return path.resolve(requestedPath);
  }
  const resolved = path.resolve(requestedPath);
  const extension = path.extname(resolved);
  const stem = resolved.slice(0, -extension.length || undefined);
  return `${stem}-${index + 1}${extension || '.png'}`;
}

async function saveImage(result, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (result.b64_json) {
    await writeFile(outputPath, Buffer.from(result.b64_json, 'base64'));
    return;
  }

  if (result.url) {
    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok || !imageResponse.body) {
      throw new Error(`failed to download image (${imageResponse.status})`);
    }
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(outputPath);
      Readable.fromWeb(imageResponse.body).pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return;
  }

  throw new Error('gateway image item has neither b64_json nor url');
}

async function run() {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  requireOption(options, 'prompt', '--prompt');
  requireOption(options, 'output', '--output');
  if (!Number.isInteger(options.n) || options.n < 1) {
    throw new Error('--n must be a positive integer');
  }
  if (options.command === 'edit' && options.images.length === 0) {
    throw new Error('edit requires at least one --image');
  }

  const config = gatewayConfig(options);
  const data = options.command === 'generate'
    ? await requestGenerate(options, config)
    : await requestEdit(options, config);

  for (const [index, result] of data.entries()) {
    const outputPath = outputPathFor(options.output, index, data.length);
    await saveImage(result, outputPath);
    console.log(outputPath);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  run().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
