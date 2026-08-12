import assert from "node:assert/strict";
import test from "node:test";
import { collapseRepeatedProse, validateTurnQuality } from "../src/story-quality.js";

const prose = "你沿着走廊向前检查，门后的脚步突然停住。安全门外传来新的响动，说明有人已经改变了原定路线。";
const proposal = {
  choices: [
    { id: "one", label: "检查安全门", action: "我检查安全门有没有刚被打开。" },
    { id: "two", label: "返回房门", action: "我返回房门前确认里面的动静。" },
  ],
  delta: { timeAdvanceMinutes: 3 },
};

test("质量校验拒绝重复近期正文", () => {
  assert.throws(
    () => validateTurnQuality({ action: "继续检查", prose, proposal, recentEvents: [{ prose, choices: [] }] }),
    /正文与近期回合重复/,
  );
});

test("质量校验拒绝单回合内部整段重复", () => {
  assert.equal(collapseRepeatedProse(prose.repeat(2)), prose);
  assert.throws(
    () => validateTurnQuality({ action: "继续检查", prose: prose.repeat(2), proposal, recentEvents: [] }),
    /同一回合内整段重复/,
  );
});

test("重复折叠不会误伤短句或正常的长正文", () => {
  assert.equal(collapseRepeatedProse("哈哈哈哈"), "哈哈哈哈");
  assert.equal(collapseRepeatedProse(prose), prose);
});

test("质量校验拒绝整组重复的下一步选项", () => {
  assert.throws(
    () =>
      validateTurnQuality({
        action: "继续检查",
        prose: `${prose}柜台方向又传来一声咳嗽。`,
        proposal,
        recentEvents: [{ prose: "此前发生了另一件足够长且完全不同的事情。", choices: proposal.choices }],
      }),
    /选项与上一回合完全重复/,
  );
});

test("质量校验允许隔回合回到相同的行动集合", () => {
  assert.doesNotThrow(() =>
    validateTurnQuality({
      action: "返回走廊",
      prose: `${prose}这一次门已经打开。`,
      proposal,
      recentEvents: [
        { prose: "较早的走廊回合有一段足够长的正文内容。", choices: proposal.choices },
        { prose: "刚才玩家去了另一个地点，并在那里得到了新的信息。", choices: [] },
      ],
    }),
  );
});

test("质量校验接受有新后果和新选项的回合", () => {
  assert.doesNotThrow(() => validateTurnQuality({ action: "继续检查", prose, proposal, recentEvents: [] }));
});
