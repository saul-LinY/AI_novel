import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createInitialState } from "../src/story-engine.js";
import { resolvePlayableRole, validateStoryPackage } from "../src/story-package.js";
import { packageById } from "./helpers.js";

const storyIds = ["dragon-raja"];
const expectedRoles = ["expose", "choice", "cost", "investigation", "commitment", "climax", "consequence"];

for (const storyId of storyIds) {
  test(`${storyId} 通过统一故事包契约并可通用初始化`, async () => {
    const storyPackage = await packageById(storyId);
    const state = createInitialState(storyPackage);

    assert.equal(storyPackage.id, storyId);
    assert.ok(storyPackage.packageHash);
    assert.equal(storyPackage.characters.length, 12);
    assert.deepEqual(storyPackage.stages.map((stage) => stage.role), expectedRoles);
    assert.equal(storyPackage.foreshadows.length >= 3 && storyPackage.foreshadows.length <= 5, true);
    assert.deepEqual(new Set(storyPackage.ending.allowedTypes), new Set(["normal", "failure", "early", "deviation"]));
    if (storyPackage.onboarding.mode === "comic-role-select") {
      assert.equal(storyPackage.onboarding.comicPages.length, 18);
      assert.equal(storyPackage.onboarding.characterProfiles.length, 4);
      assert.equal(storyPackage.onboarding.npcProfiles.length, 8);
      assert.equal(storyPackage.onboarding.roleSelection.roles.length, 4);
      for (const profile of [
        ...storyPackage.onboarding.characterProfiles,
        ...storyPackage.onboarding.npcProfiles,
      ]) {
        assert.ok(profile.id);
        assert.ok(profile.publicSummary);
        assert.equal(Object.hasOwn(profile, "summary"), false);
      }
      for (const item of [
        ...storyPackage.onboarding.comicPages,
        ...storyPackage.onboarding.characterProfiles,
        ...storyPackage.onboarding.roleSelection.roles,
      ]) {
        await access(resolve(import.meta.dirname, "..", "public", item.image.src.replace(/^\//, "")));
      }
    } else {
      assert.equal(storyPackage.onboarding.slides.at(-1).kind, "handoff");
      for (const slide of storyPackage.onboarding.slides) {
        await access(resolve(import.meta.dirname, "..", "public", slide.image.src.replace(/^\//, "")));
      }
    }
    for (const location of storyPackage.locations) {
      await access(resolve(import.meta.dirname, "..", "public", location.fallbackImage.replace(/^\//, "")));
      for (const scene of location.states) {
        await access(resolve(import.meta.dirname, "..", "public", scene.image.src.replace(/^\//, "")));
      }
    }
    assert.equal(state.storyProgress.currentStageId, storyPackage.stages[0].id);
    assert.equal(state.storyProgress.stages[0].status, "active");
    assert.equal(state.storyProgress.stages.slice(1).every((stage) => stage.status === "pending"), true);
  });
}

test("龙族绘梨衣线的四个角色生成不同的玩家知识、物品、关系、地点和开场", async () => {
  const storyPackage = await packageById("dragon-raja");
  const roles = storyPackage.playableRoles.characterIds.map((characterId) => resolvePlayableRole(storyPackage, characterId));

  assert.deepEqual(roles.map((role) => role.playerCharacterId), ["lu-mingfei", "erii", "gen-chisei", "caesar"]);
  assert.equal(new Set(roles.map((role) => role.opening.prose)).size, 4);
  assert.equal(new Set(roles.map((role) => role.initialInventory.map((item) => item.itemId).join(","))).size, 4);
  assert.equal(new Set(roles.map((role) => role.world.locationId)).size, 3);
  for (const role of roles) {
    const state = createInitialState(role);
    assert.deepEqual(
      state.characters[role.playerCharacterId].knowledgeFactIds,
      storyPackage.characters.find((character) => character.id === role.playerCharacterId).knowledgeFactIds,
    );
  }
});

test("故事包校验拒绝坏引用、重复 ID 和缺失结局类型", async () => {
  const valid = await packageById();

  const badReference = structuredClone(valid);
  delete badReference.packageHash;
  delete badReference.packagePath;
  badReference.characters[1].locationId = "nowhere";
  assert.throws(() => validateStoryPackage(badReference), /人物地点不存在/);

  const duplicate = structuredClone(valid);
  delete duplicate.packageHash;
  delete duplicate.packagePath;
  duplicate.items[1].id = duplicate.items[0].id;
  assert.throws(() => validateStoryPackage(duplicate), /物品 ID 不能重复/);

  const missingEnding = structuredClone(valid);
  delete missingEnding.packageHash;
  delete missingEnding.packagePath;
  missingEnding.ending.allowedTypes = ["normal"];
  assert.throws(() => validateStoryPackage(missingEnding), /fewer than 4 items|必须明确允许/);
});
