#!/usr/bin/env node

// Build story-package comic data from the storyboard in stories/<id>/art/comic-script.json:
//   - comic/pages.json            (player-facing script: titles, captions, panels, image)
//   - background/beats.json       (causal chain + visual continuity, one beat per page)
//   - art/comic-manifest.json     (image jobs; each page refs the cast model sheets and the previous page)
//
//   node scripts/build-comic.js [storyId] [--image-dir /assets/comic/<storyId>]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const storyId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dragon-raja';
const imageDirArg = process.argv.indexOf('--image-dir');
const imageDir = imageDirArg > -1 ? process.argv[imageDirArg + 1] : `/assets/comic/${storyId}`;
const storyRoot = path.join(ROOT, 'stories', storyId);
const MAX_REFS = 6;

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const write = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

function letterPanel(panel, index) {
  const lines = panel.lines.map((line) => {
    if (line.speaker === '旁白') return `  Caption box (narration): 「${line.text}」`;
    if (line.speaker === '绘梨衣') return `  Erii's notebook note (square box with a small notebook icon): 「${line.text}」`;
    if (line.speaker === '警报') return `  Red alarm text box: 「${line.text}」`;
    return `  Speech balloon from ${line.speakerEn ?? line.speaker}: 「${line.text}」`;
  });
  return `Panel ${index + 1}: ${panel.shot}\n${lines.join('\n')}`;
}

const SHEET_NAMES = {
  'lu-mingfei': 'Lu Mingfei', erii: 'Uesugi Erii', 'gen-chisei': 'Gen Chisei', caesar: 'Caesar Gattuso', 'chu-zihang': 'Chu Zihang', 'tachibana-masamune': 'Tachibana Masamune',
};

const SPEAKERS = {
  路明非: 'Lu Mingfei', 凯撒: 'Caesar', 楚子航: 'Chu Zihang', 源稚生: 'Gen Chisei', 橘政宗: 'Tachibana Masamune', 守卫: 'the guard',
};

async function main() {
  const script = await json(path.join(storyRoot, 'art/comic-script.json'));
  const pages = [];
  const beats = [];
  const jobs = [];

  script.pages.forEach((page, index) => {
    const number = String(index + 1).padStart(2, '0');
    const imagePath = `${imageDir}/page-${number}.png`;
    pages.push({
      id: page.id,
      title: page.title,
      caption: page.caption,
      panels: page.panels.map((panel, panelIndex) => ({ id: `p${panelIndex + 1}`, scene: panel.scene, lines: panel.lines })),
      image: { src: imagePath, alt: `漫画第 ${index + 1} 页：${page.title}` },
    });
    beats.push({
      id: `beat-${number}`,
      order: index + 1,
      comicPageId: page.id,
      location: page.location,
      characterIds: page.characters,
      cause: page.cause,
      event: page.caption,
      effect: page.effect,
      visualContinuity: [page.continuity, `时间：${page.time}`],
      sourceStatus: 'current-adaptation',
    });

    const previous = index > 0 ? `public${imageDir}/page-${String(index).padStart(2, '0')}.png` : null;
    const sheets = page.characters
      .filter((id) => id !== 'gen-chinu')
      .map((id) => `stories/${storyId}/art/model-sheets/${id}.png`);
    const refs = [...sheets.slice(0, previous ? MAX_REFS - 1 : MAX_REFS), ...(previous ? [previous] : [])];
    const refNote = refs.map((ref, refIndex) => {
      if (ref === previous) return `Reference image ${refIndex + 1}: the PREVIOUS comic page — match its rendering style, colour grading, lettering style and continuity; do not copy its layout.`;
      return `Reference image ${refIndex + 1}: character model sheet for ${SHEET_NAMES[path.basename(ref, '.png')]} — keep this exact face, hair and outfit.`;
    });
    const panels = page.panels.map((panel) => ({
      ...panel,
      lines: panel.lines.map((line) => ({ ...line, speakerEn: SPEAKERS[line.speaker] })),
    }));
    const prompt = [
      `Page ${index + 1} of 18 — "${page.title}". Setting: ${page.location}, ${page.time}. Continuity: ${page.continuity}`,
      `Layout: ${panels.length} panels, ${panels.length === 4 ? 'a 2-row × 2 grid or 4 stacked tiers' : 'tiers of 1–2 panels'}, varied panel sizes for rhythm.`,
      ...refNote,
      ...panels.map(letterPanel),
    ].join('\n');
    jobs.push({
      id: `comic-${number}`,
      group: 'comic',
      size: '1024x1536',
      refs,
      after: index > 0 ? `comic-${String(index).padStart(2, '0')}` : undefined,
      output: `public${imagePath}`,
      prompt,
    });
  });

  const artManifest = await json(path.join(storyRoot, 'art/manifest.json'));
  await write(path.join(storyRoot, 'comic/pages.json'), pages);
  await write(path.join(storyRoot, 'background/beats.json'), beats);
  await write(path.join(storyRoot, 'art/comic-manifest.json'), {
    model: artManifest.model,
    style: artManifest.style,
    groupStyles: { comic: artManifest.groupStyles.comic },
    jobs,
  });
  console.log(`built ${pages.length} pages, ${beats.length} beats, ${jobs.length} comic jobs`);
}

main().catch((error) => {
  console.error(`build-comic: ${error.message}`);
  process.exitCode = 1;
});
