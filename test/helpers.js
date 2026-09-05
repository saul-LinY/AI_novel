import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStoryPackage } from "../src/story-package.js";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function proposal(overrides = {}) {
  const base = {
    normalizedAction: {
      intent: "检查眼前的情况",
      steps: ["走近目标", "检查可见痕迹"],
      stoppedAtStep: 2,
      stopReason: "检查完成后需要决定下一步",
    },
    outcome: {
      type: "success",
      summary: "角色完成了检查。",
      reasons: ["目标在当前位置可接近，行动不需要未知信息。"],
    },
    choices: [
      { id: "ask", label: "询问在场人物", action: "我询问在场的人刚才发生了什么。" },
      { id: "leave", label: "换个地点", action: "我暂时离开，去别处查看。" },
    ],
    delta: { timeAdvanceMinutes: 5 },
    npcIntents: [],
    memoryNotes: [],
  };
  return {
    ...base,
    ...overrides,
    normalizedAction: { ...base.normalizedAction, ...(overrides.normalizedAction ?? {}) },
    outcome: { ...base.outcome, ...(overrides.outcome ?? {}) },
    delta: overrides.delta ?? base.delta,
  };
}

export function rejectedProposal(summary = "玩家不能直接命令 NPC 行动。") {
  return proposal({
    normalizedAction: {
      intent: "要求 NPC 服从命令",
      steps: ["要求 NPC 服从命令"],
      stoppedAtStep: 1,
      stopReason: "玩家没有提供能影响 NPC 的角色行动",
    },
    outcome: {
      type: "action_not_allowed",
      summary,
      reasons: ["玩家只能控制自己的角色。"],
    },
    choices: [],
    delta: {},
  });
}

export function ending(type) {
  return {
    type,
    coreQuestionResponse: "角色以自己的选择回应了故事的核心问题。",
    keyChoice: "角色承担了不可撤回的选择。",
    directConsequences: ["眼前局势因此发生了直接变化。"],
    longTermConsequences: ["人物之后必须长期面对这次选择。"],
    costs: ["角色失去了一条原本可走的路线。"],
    resolvedQuestions: ["当前危机如何收束"],
    unresolvedQuestions: ["人物关系之后如何修复"],
  };
}

export async function packageById(id = "dragon-raja") {
  return loadStoryPackage(projectRoot, id);
}
