import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_PIPELINE_CONFIG, readPipelineConfig, validatePipelineConfig } from "../src/pipeline-config.js";

test("流水线默认强制节奏与伏笔校验，并开启连续性记录员", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-novel-pipeline-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const config = await readPipelineConfig(dataDir, {});
  assert.deepEqual({ ...config }, { ...DEFAULT_PIPELINE_CONFIG });
  assert.equal(config.narrative, "enforce");
  assert.equal(config.recorder, "agent");
  assert.equal(config.choices, "inline");
});

test("配置文件生效，环境变量优先于文件", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-novel-pipeline-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await writeFile(join(dataDir, "pipeline.json"), JSON.stringify({ narrative: "advise", recorder: "off", choices: "parallel", beats: false }));
  const fromFile = await readPipelineConfig(dataDir, {});
  assert.equal(fromFile.narrative, "advise");
  assert.equal(fromFile.recorder, "off");
  assert.equal(fromFile.choices, "parallel");
  assert.equal(fromFile.beats, false);
  const overridden = await readPipelineConfig(dataDir, { AI_NOVEL_NARRATIVE: "off", AI_NOVEL_RECORDER: "agent", AI_NOVEL_BEATS: "on", AI_NOVEL_QUALITY: "enforce" });
  assert.equal(overridden.narrative, "off");
  assert.equal(overridden.recorder, "agent");
  assert.equal(overridden.beats, true);
  assert.equal(overridden.quality, "enforce");
});

test("非法配置直接报错，不静默回退", () => {
  assert.throws(() => validatePipelineConfig({ choices: "sometimes" }), /choices/);
  assert.throws(() => validatePipelineConfig({ narrative: "strict" }), /narrative/);
  assert.throws(() => validatePipelineConfig({ recorder: "post" }), /recorder/);
  assert.throws(() => validatePipelineConfig({ recorderTimeoutMs: 5 }), /recorderTimeoutMs/);
  assert.throws(() => validatePipelineConfig({ beats: "yes" }), /beats/);
});
