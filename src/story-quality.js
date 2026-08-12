function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/[\p{P}\p{S}\s]+/gu, "");
}

function choiceSignature(choices) {
  return choices
    .map((choice) => `${normalizeText(choice.label)}:${normalizeText(choice.action)}`)
    .sort()
    .join("|");
}

export function collapseRepeatedProse(value) {
  const text = String(value ?? "").trim();
  for (let repeatCount = 4; repeatCount >= 2; repeatCount -= 1) {
    if (text.length % repeatCount !== 0) continue;
    const unit = text.slice(0, text.length / repeatCount);
    if (normalizeText(unit).length >= 40 && unit.repeat(repeatCount) === text) return unit.trim();
  }
  return text;
}

export function validateTurnQuality({ action, prose, proposal, recentEvents = [] }) {
  const normalizedAction = normalizeText(action);
  const normalizedProse = normalizeText(prose);
  if (!normalizedAction) throw new Error("本回合没有有效行动");
  if (normalizedProse.length < 40) throw new Error("生成正文过短，没有形成完整的故事进展");
  if (collapseRepeatedProse(prose) !== String(prose).trim()) {
    throw new Error("生成正文在同一回合内整段重复，请重试本次行动");
  }

  const previousEvent = recentEvents.at(-1);
  if (previousEvent && normalizeText(previousEvent.prose) === normalizedProse) {
    throw new Error("生成正文与近期回合重复，请重试本次行动");
  }

  const choices = proposal?.choices;
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 4) {
    throw new Error("生成结果必须提供 2 到 4 个下一步选项");
  }
  const uniqueChoices = new Set(choices.map((choice) => `${normalizeText(choice.label)}:${normalizeText(choice.action)}`));
  if (uniqueChoices.size !== choices.length) throw new Error("生成结果包含重复选项");

  const signature = choiceSignature(choices);
  if (Array.isArray(previousEvent?.choices) && choiceSignature(previousEvent.choices) === signature) {
    throw new Error("生成的下一步选项与上一回合完全重复，请重试本次行动");
  }
}
