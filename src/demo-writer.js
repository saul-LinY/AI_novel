import { setTimeout as delay } from "node:timers/promises";

function hasKnownFact(state, factId) {
  return state.knownFactIds.includes(factId);
}

export async function generateDemoTurn({ action, state, onDelta }) {
  const normalized = action.toLowerCase();
  let prose;
  let proposal;

  if (normalized.includes("伞")) {
    prose = hasKnownFact(state, "red-umbrella-owner")
      ? "你再次撑开红伞，伞骨内侧那道浅浅的划痕正好与登记簿上的房号重合。林秋没有阻止你，只把手从电话听筒上慢慢移开。她显然知道你已经看懂了什么。"
      : "你提起红伞时，一张折得很小的行李签从伞带里滑了出来。签上写着“陈默，207”，背面却沾着尚未干透的院墙青苔。林秋看见那张签，手指立刻按住了登记簿的一角。";
    proposal = {
      choices: [
        { id: "ask-lin", label: "追问林秋为何紧张", action: "我把行李签放到林秋面前，问她到底隐瞒了什么。" },
        { id: "go-courtyard", label: "去内院查看青苔", action: "我带上红伞，去内院寻找同样的青苔。" },
        { id: "check-register", label: "核对登记簿", action: "我要求查看昨夜 207 号房的完整登记记录。" },
      ],
      delta: {
        timeAdvanceMinutes: 4,
        learnFactIds: ["red-umbrella-owner"],
        relationshipChanges: [{ characterId: "lin-qiu", amount: -1, reason: "主角发现了她想隐藏的关联" }],
      },
      memoryNotes: ["红伞属于失踪的陈默", "伞带里藏着沾有院墙青苔的行李签"],
    };
  } else if (normalized.includes("钥匙") || normalized.includes("抽屉") || normalized.includes("前台")) {
    const alreadyHasKey = Boolean(state.inventory["room-207-key"]);
    prose = alreadyHasKey
      ? "你把 207 号房钥匙放到前台灯下。铜制钥匙牌的一面被磨得发亮，另一面却粘着细小的黑色木屑，像是刚从某个夹层里取出来。林秋盯着木屑，没有再说钥匙一直挂在原处。"
      : "你绕到前台侧面，发现钥匙架上只有 207 的位置空着。最下层抽屉推到一半便被卡住，你伸手摸进夹层，碰到一枚冰凉的铜牌。207 号房钥匙一直藏在这里，而不是被住客带走。";
    proposal = {
      choices: [
        { id: "use-key", label: "带钥匙上二楼", action: "我拿着 207 号房钥匙走上二楼。" },
        { id: "question-clerk", label: "让林秋解释", action: "我把钥匙放在林秋面前，让她解释为什么要藏起来。" },
        { id: "inspect-key", label: "检查钥匙上的痕迹", action: "我借着台灯仔细检查钥匙和铜牌上的痕迹。" },
      ],
      delta: {
        timeAdvanceMinutes: 5,
        addItemIds: alreadyHasKey ? [] : ["room-207-key"],
        learnFactIds: ["missing-key"],
        relationshipChanges: [{ characterId: "lin-qiu", amount: -1, reason: "主角发现了被藏起的钥匙" }],
      },
      memoryNotes: ["207 号房钥匙被藏在前台抽屉夹层", "钥匙牌上粘着黑色木屑"],
    };
  } else if (normalized.includes("二楼") || normalized.includes("楼梯") || normalized.includes("207")) {
    prose =
      "楼梯每响一声，大堂的灯就像跟着暗了一分。你在二楼转角停下，走廊尽头的窗没有关严，雨水吹进来，在地毯上留下一串断断续续的湿脚印。脚印没有通向楼梯，而是从 207 号房门口拐向了后面的安全门。";
    proposal = {
      choices: [
        { id: "open-207", label: "查看 207 号房", action: "我先检查 207 号房的门锁和门缝。" },
        { id: "follow-prints", label: "沿湿脚印追过去", action: "我沿着湿脚印走向走廊尽头的安全门。" },
        { id: "listen", label: "停下来听动静", action: "我关掉手机屏幕，站在原地听走廊里的声音。" },
      ],
      delta: {
        locationId: "upstairs",
        timeAdvanceMinutes: 7,
        learnFactIds: ["wet-footprints"],
      },
      memoryNotes: ["二楼湿脚印从 207 号房通向安全门", "脚印并未经过大堂楼梯"],
    };
  } else if (normalized.includes("时间") || normalized.includes("钟") || normalized.includes("登记")) {
    prose =
      "登记簿最后一行写着 23:40，墨迹比前几行明显更深。你抬头时才注意到，大堂挂钟的秒针停在 23:17。林秋说停电后钟就坏了，可登记簿上那一行，偏偏是用停电前已经用完的蓝黑墨水写的。";
    proposal = {
      choices: [
        { id: "ask-power", label: "追问停电经过", action: "我问林秋，昨晚 23:17 停电时谁在大堂。" },
        { id: "inspect-ledger", label: "检查登记簿纸张", action: "我仔细检查登记簿最后一页有没有被替换过。" },
        { id: "find-guard", label: "去找值夜保安", action: "我去内院找赵山核对昨晚的时间。" },
      ],
      delta: { timeAdvanceMinutes: 6, learnFactIds: ["stopped-clock"] },
      memoryNotes: ["挂钟停在 23:17", "登记簿中的 23:40 可能是事后补写"],
    };
  } else {
    prose =
      "林秋没有立刻回答。她先看了一眼二楼，又把登记簿往自己这边拉了半寸。雨声填满短暂的沉默，门外忽然传来金属碰撞声，像有人在雨棚后放下了一架梯子。你的行动没有得到直接答案，却让旅店里的某个人提前动了起来。";
    proposal = {
      choices: [
        { id: "check-sound", label: "去查看金属声", action: "我立刻绕到雨棚后，查看刚才的金属碰撞声。" },
        { id: "watch-clerk", label: "观察林秋的反应", action: "我没有移动，只观察林秋听见声音后的反应。" },
        { id: "block-stairs", label: "守住楼梯", action: "我退到楼梯口，防止二楼的人趁机下来。" },
      ],
      delta: { timeAdvanceMinutes: 4 },
      memoryNotes: ["雨棚后出现了金属碰撞声", "玩家行动后旅店里有人提前移动"],
    };
  }

  for (const chunk of prose.match(/.{1,12}/gu) ?? [prose]) {
    onDelta(chunk);
    await delay(24);
  }

  return { prose, proposal, piEntryId: null };
}

