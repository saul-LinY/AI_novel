import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const storyRoot = join(projectRoot, "stories", "dragon-raja");
const legacy = JSON.parse(await readFile(join(storyRoot, "story.json"), "utf8"));

async function writeJson(relativePath, value) {
  const target = join(storyRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeMarkdown(relativePath, value) {
  const target = join(storyRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${value.trim()}\n`, "utf8");
}

const backgroundSummary = `# 前情提要

卡塞尔学院派出路明非、凯撒和楚子航前往东京执行危险的水下任务。负责接待他们的蛇岐八家表面合作，实际上隐瞒了神代遗迹、白王血统和家族内部的秘密。任务失控后，双方关系破裂，三人也从客人变成了被追捕者。

蛇岐八家的上杉家主绘梨衣拥有极其危险的言灵“审判”。她被称为家主，却长期生活在源氏重工深处，由药物、监控和哥哥源稚生共同维持安全。源稚生真心想保护妹妹，但家族一直把她当作最强的武器；橘政宗控制的治疗记录里还藏着未被解释的采血和药物缺口。

绘梨衣从监控中看见路明非正在逃亡，第一次没有等待命令，独自离开了家。她在东京雨夜找到路明非，两人暂时躲进主题旅馆，也短暂体验了电车、快餐店、游戏厅和城市灯火组成的普通生活。对绘梨衣来说，这不是一次任务，而是第一次亲自选择要去哪里、相信谁。

现在最后一支稳定血统的药放在桌上。凯撒要求把绘梨衣带离日本，源稚生正在寻找妹妹，隐藏在治疗记录背后的计划也在收紧。任何选择都必须同时面对自由、生命、责任和信任的代价。`;

const beatLocations = [
  "东京上空与机场",
  "源氏重工",
  "绘梨衣的房间",
  "蛇岐八家训练场",
  "源氏重工医疗层",
  "深海与指挥船",
  "风雨中的海面",
  "源氏重工出口",
  "绘梨衣的房间与电梯",
  "东京雨夜街区",
  "东京主题旅馆",
  "旅馆与两处指挥点",
  "东京主题旅馆",
  "东京电车与快餐店",
  "东京游戏厅",
  "东京高空展望台",
  "源氏重工与卡塞尔安全屋",
  "东京主题旅馆",
];
const beatCharacters = [
  ["lu-mingfei", "caesar", "chu-zihang", "gen-chisei"],
  ["lu-mingfei", "caesar", "chu-zihang", "gen-chisei"],
  ["erii", "gen-chisei"],
  ["erii", "gen-chisei"],
  ["erii", "gen-chisei", "tachibana-masamune"],
  ["lu-mingfei", "caesar", "chu-zihang", "gen-chisei", "erii"],
  ["lu-mingfei", "caesar", "chu-zihang", "gen-chisei", "erii"],
  ["lu-mingfei", "caesar", "chu-zihang", "gen-chisei"],
  ["erii", "gen-chisei"],
  ["lu-mingfei", "erii"],
  ["lu-mingfei", "erii"],
  ["lu-mingfei", "erii", "caesar", "gen-chisei"],
  ["lu-mingfei", "erii"],
  ["lu-mingfei", "erii"],
  ["lu-mingfei", "erii"],
  ["lu-mingfei", "erii"],
  ["gen-chisei", "tachibana-masamune", "caesar", "chu-zihang"],
  ["lu-mingfei", "erii", "caesar", "gen-chisei"],
];

const beats = legacy.onboarding.comicPages.map((page, index, pages) => ({
  id: `beat-${String(index + 1).padStart(2, "0")}`,
  order: index + 1,
  comicPageId: page.id,
  location: beatLocations[index],
  characterIds: beatCharacters[index],
  cause: index === 0 ? "卡塞尔学院向东京派出行动小组。" : pages[index - 1].caption,
  event: page.caption,
  effect: pages[index + 1]?.caption ?? "玩家从这里接管人物的下一步选择。",
  visualContinuity: [
    `保持${beatLocations[index]}的天气、光线与空间方向连续`,
    `沿用本页人物造型和随身物品，不凭空改变服装或伤势`,
    index === pages.length - 1 ? "桌上的血清、本子和手机必须延续到互动开场" : "下一页必须承接本页造成的关系或风险变化",
  ],
  sourceStatus: "current-adaptation",
}));

const spineNodes = [
  {
    id: "see-countdown",
    role: "expose",
    title: "看见倒计时",
    purpose: "确认追踪、药效或治疗记录中至少一项正在逼近的危险。",
    prerequisites: [],
    expectedResults: ["玩家理解继续停留并非没有代价", "至少一条危机从背景变成可行动的信息"],
    blockConditions: ["玩家主动切断全部追踪且获得新的安全药物来源"],
    compatibleRejoinNodeIds: ["own-the-choice", "pay-for-time"],
    requiredGoalCount: 1,
    goals: [{ id: "find-immediate-risk", title: "发现一项足以改变计划的危险", completion: { factIdsAny: ["serum-reaction", "medical-record-gap", "tracking-ping", "white-king-vessel"] } }],
  },
  {
    id: "own-the-choice",
    role: "choice",
    title: "谁来决定",
    purpose: "明确绘梨衣本人的愿望与当前角色愿意承担的责任。",
    prerequisites: ["see-countdown"],
    expectedResults: ["绘梨衣的意愿成为计划约束", "当前角色表明安全、自由或任务的优先级"],
    blockConditions: ["绘梨衣失去表达能力且没有可信代理人"],
    compatibleRejoinNodeIds: ["pay-for-time", "investigate-the-gap"],
    requiredGoalCount: 1,
    goals: [
      { id: "hear-erii", title: "让绘梨衣的选择真正进入计划", completion: { factIdsAny: ["notebook-wish"] } },
      { id: "declare-priority", title: "明确安全、自由或任务的优先顺序", completion: { evidenceAllowed: true } },
    ],
  },
  {
    id: "pay-for-time",
    role: "cost",
    title: "为时间付费",
    purpose: "让藏匿、治疗、调查或撤离消耗药物、时间、位置安全或人物信任。",
    prerequisites: ["own-the-choice"],
    expectedResults: ["至少一项资源或关系发生真实变化", "不存在免费的完美拖延"],
    blockConditions: ["玩家已经选择立即结束东京路线"],
    compatibleRejoinNodeIds: ["investigate-the-gap", "irreversible-route"],
    requiredGoalCount: 1,
    goals: [{ id: "accept-real-cost", title: "承担一项不可忽略的现实代价", completion: { evidenceAllowed: true } }],
  },
  {
    id: "investigate-the-gap",
    role: "investigation",
    title: "治疗记录的缺口",
    purpose: "让至少一方发现保护方案背后存在被隐瞒的采血、药物或身份风险。",
    prerequisites: ["pay-for-time"],
    expectedResults: ["橘政宗控制的信息开始失去可信度", "玩家获得选择路线所需但不完整的真相"],
    blockConditions: ["玩家永久销毁记录并拒绝其他调查来源"],
    compatibleRejoinNodeIds: ["irreversible-route", "red-well-convergence"],
    requiredGoalCount: 1,
    goals: [{ id: "trace-medical-gap", title: "确认治疗体系中存在人为隐瞒", completion: { factIdsAny: ["medical-record-gap", "white-king-vessel"] } }],
  },
  {
    id: "irreversible-route",
    role: "commitment",
    title: "不可逆的路线",
    purpose: "在离开日本、返回家族、继续藏匿或追查幕后计划之间作出不能轻易撤回的决定。",
    prerequisites: ["own-the-choice"],
    expectedResults: ["路线产生直接阻力", "角色承担选择而不是等待所有信息完美"],
    blockConditions: ["局势已被上一节点推入无法选择的灾难"],
    compatibleRejoinNodeIds: ["red-well-convergence", "answer-loneliness"],
    requiredGoalCount: 1,
    goals: [{ id: "choose-erii-route", title: "决定绘梨衣的去处并面对直接阻力", completion: { evidenceAllowed: true } }],
  },
  {
    id: "red-well-convergence",
    role: "climax",
    title: "红井之前",
    purpose: "让家族、卡塞尔与幕后计划的冲突在仍然合乎当前因果的位置汇合。",
    prerequisites: ["irreversible-route"],
    expectedResults: ["白王计划被阻止、改变或按原著方向发生", "主要人物的立场转化为行动"],
    blockConditions: ["玩家已使红井事件不可能发生"],
    compatibleRejoinNodeIds: ["answer-loneliness"],
    requiredGoalCount: 1,
    goals: [{ id: "settle-red-well", title: "结算白王计划与绘梨衣命运的直接冲突", completion: { evidenceAllowed: true } }],
  },
  {
    id: "answer-loneliness",
    role: "consequence",
    title: "孤独者的回答",
    purpose: "结算绘梨衣的生命与自由、角色的责任以及各方信任。",
    prerequisites: ["irreversible-route"],
    expectedResults: ["交代绘梨衣是否活着并拥有选择权", "交代当前角色付出的长期代价"],
    blockConditions: [],
    compatibleRejoinNodeIds: [],
    requiredGoalCount: 1,
    goals: [{ id: "settle-erii-fate", title: "完整结算选择、代价与长期后果", completion: { evidenceAllowed: true } }],
  },
];

const addedCharacters = [
  {
    id: "tachibana-masamune", name: "橘政宗", aliases: ["大家长"], role: "蛇岐八家大家长", tagline: "以父亲般的姿态维持秩序，掌握着最危险的隐瞒", publicSummary: "蛇岐八家的大家长，是源稚生信赖的长辈，也是绘梨衣治疗体系的最高知情者。", traits: ["温和权威", "信息控制", "长期布局"], appearance: "头发灰白、仪态克制的年长男性，常穿整洁和服或深色正装。", abilities: ["家族权威", "医学与血统研究知识"], speech: "语气平稳慈祥，习惯用家族责任包装命令。", personality: "耐心、善于伪装和控制，把他人当作长期计划中的资源。", goal: "维持自己对蛇岐八家和白王计划的控制。", background: "以橘政宗身份领导家族；其更深身份属于受知识门槛保护的核心真相。", locationId: "genji-command", status: "active", attitude: 0, knowledgeFactIds: legacy.facts.map((fact) => fact.id), knownToPlayer: true,
    soul: ["永远先维持可信长辈的表象，再推动目标。", "不会无理由公开自己的真实身份或最终计划。", "关怀可以是真实的表演，但不能压过对进化计划的执念。"],
  },
  {
    id: "gen-chinu", name: "源稚女", aliases: ["风间琉璃"], role: "猛鬼众龙王", tagline: "在被抛弃的记忆与重新被承认的愿望之间行动", publicSummary: "与源稚生有深刻旧怨的猛鬼众核心人物，能以风间琉璃的身份活动。", traits: ["舞台感", "复仇", "渴望和解"], appearance: "容貌精致的年轻日本男性，风间琉璃身份常着华丽戏服或考究正装。", abilities: ["高纯度皇血", "言灵·梦貘"], speech: "措辞华丽而锋利，情绪越深越显得从容。", personality: "敏感、骄傲、带有表演性，仇恨哥哥却仍渴望被理解。", goal: "向源稚生追讨过去，并摆脱王将对自己的控制。", background: "源稚生的弟弟，以风间琉璃身份成为猛鬼众的重要人物。", locationId: "red-well", status: "active", attitude: -1, knowledgeFactIds: ["family-search", "medical-record-gap", "white-king-vessel"], knownToPlayer: true,
    soul: ["复仇与和解必须同时存在，不能写成单纯嗜杀。", "风间琉璃是生存与反击的身份，不是毫无联系的另一个人。", "面对源稚生时，旧日亲情会改变他的判断节奏。"],
  },
  {
    id: "lu-mingze", name: "路鸣泽", aliases: ["小魔鬼"], role: "路明非意识边界中的神秘男孩", tagline: "总在代价最昂贵的时候提供看似唯一的选择", publicSummary: "只在路明非最孤独或最危险的时候出现，力量、目的和身份都无法被正常规则解释。", traits: ["交易", "洞察", "危险援助"], appearance: "衣着讲究的少年，面容与路明非有微妙相似，神态远比年龄沉静。", abilities: ["以生命比例为代价的力量交换", "非常规领域干预"], speech: "亲昵、从容，像早已知道回答，关键条件从不含糊。", personality: "冷静、洞悉人心，对路明非表现出近乎偏执的亲近。", goal: "推动路明非接受交易，并让他在失去时承认真正欲望。", background: "其存在方式与真实身份保持未知，不能由其他角色凭空确认。", locationId: "theme-hotel", status: "missing", attitude: 1, knowledgeFactIds: legacy.facts.map((fact) => fact.id), knownToPlayer: false,
    soul: ["只在重大失去或交易临界点介入。", "帮助永远附带明确代价，不能成为免费解决方案。", "不会替路明非作出是否交易的最终决定。"],
  },
  {
    id: "uesugi-yue", name: "上杉越", aliases: ["越师傅"], role: "蛇岐八家前任影皇", tagline: "想过普通生活的旧皇，在太晚的时候面对自己的血脉", publicSummary: "在东京经营拉面摊的老人，过去与蛇岐八家有无法切断的联系。", traits: ["隐退", "强悍", "迟来的责任"], appearance: "身材高大结实的老人，平日穿拉面店工作服，目光仍带旧日威势。", abilities: ["皇血", "丰富战斗经验"], speech: "粗粝直接，常以市井口吻掩饰沉重往事。", personality: "厌倦权力、外粗内细，害怕自己的血统再次伤害下一代。", goal: "保护自己的孩子并终结白王血统造成的灾难。", background: "蛇岐八家前任影皇，长期隐姓埋名经营拉面摊。", locationId: "tokyo-street", status: "active", attitude: 0, knowledgeFactIds: ["judgment-power", "serum-limit", "family-search"], knownToPlayer: true,
    soul: ["厌恶家族权力，但危险来临时不会逃避自己的责任。", "得知亲缘真相后，保护欲必须伴随迟到与愧疚。", "力量强大但不能凭一人消除全部政治和血统后果。"],
  },
  {
    id: "sakura-yabuki", name: "矢吹樱", aliases: ["樱"], role: "源稚生的执行秘书", tagline: "把情感藏进精准执行里的人", publicSummary: "源稚生最信任的助手，负责情报、联络与行动协调。", traits: ["冷静", "忠诚", "情报执行"], appearance: "黑发利落、身形修长的年轻女性，常穿便于行动的深色职业装。", abilities: ["忍者训练", "情报与行动协调"], speech: "简短准确，不用情绪替代事实。", personality: "沉着克制，以行动表达关心，对源稚生忠诚但并非没有判断。", goal: "帮助源稚生控制局势，并保护他不被家族责任吞没。", background: "蛇岐八家执行成员和源稚生的秘书，是其最可靠的现场协作者。", locationId: "genji-command", status: "active", attitude: 1, knowledgeFactIds: ["judgment-power", "serum-limit", "family-search", "medical-record-gap"], knownToPlayer: true,
    soul: ["忠诚对象首先是源稚生本人，而不是抽象命令。", "不会用长篇告白表达感情，关键态度体现在风险承担上。", "面对证据时会协助查证，不盲目替家族掩盖。"],
  },
  {
    id: "mai-sakatoku", name: "酒德麻衣", aliases: ["长腿"], role: "秘密行动执行者", tagline: "在舞台外推动关键人物走到选择面前", publicSummary: "行动能力极强的神秘女性，偶尔在卡塞尔小组最危险时提供无法解释的协助。", traits: ["潜入", "战斗", "幕后协助"], appearance: "身材高挑、黑色长发的年轻女性，行动时穿贴身深色装备。", abilities: ["潜入作战", "武器与现场控制"], speech: "干脆、带调侃，不解释幕后雇主不允许公开的内容。", personality: "专业、敏捷，有幽默感，对任务之外的人仍保留同情。", goal: "按幕后计划保证路明非活到关键选择，同时尽量保护无辜者。", background: "受秘密团队调度的执行者，与苏恩曦长期合作。", locationId: "tokyo-street", status: "active", attitude: 0, knowledgeFactIds: ["cassell-order", "tracking-ping", "white-king-vessel"], knownToPlayer: true,
    soul: ["可以创造行动窗口，但不能替路明非作出核心选择。", "不主动暴露雇主、路鸣泽或计划全貌。", "执行任务时果断，对绘梨衣不能只有工具性态度。"],
  },
  {
    id: "sue-enxi", name: "苏恩曦", aliases: ["薯片妞"], role: "秘密团队后勤与情报中枢", tagline: "用资金、屏幕和抱怨维持一场看不见的救援", publicSummary: "擅长远程调度资金、情报和路线的神秘后勤人员。", traits: ["资源调度", "网络情报", "风险计算"], appearance: "年轻女性，常在堆满屏幕与零食的远程工作间指挥行动。", abilities: ["资金与交通调度", "网络情报分析"], speech: "语速快、抱怨具体，谈到成本和风险时极其清醒。", personality: "务实、精于计算，嘴上计较成本但不会轻易放弃队友。", goal: "让幕后计划按节点推进，并降低行动人员无法承受的损失。", background: "与酒德麻衣配合的远程后勤和情报人员。", locationId: "cassell-safehouse", status: "active", attitude: 0, knowledgeFactIds: ["cassell-order", "tracking-ping", "white-king-vessel"], knownToPlayer: true,
    soul: ["任何资源都有来源、成本与到达时间。", "不会凭空提供万能撤离或治疗。", "调侃不能消解风险，也不能泄露不该公开的幕后真相。"],
  },
];

const originalCharacters = legacy.characters.map((character) => ({
  ...character,
  aliases: character.id === "erii" ? ["上杉家主", "月读命"] : [],
  tagline: legacy.onboarding.characterProfiles.find((item) => item.characterId === character.id)?.tagline ?? character.goal,
  publicSummary: legacy.onboarding.characterProfiles.find((item) => item.characterId === character.id)?.summary ?? character.background,
  traits: legacy.onboarding.characterProfiles.find((item) => item.characterId === character.id)?.traits ?? ["关键人物", "东京任务"],
  abilities: {
    "lu-mingfei": ["临场应变", "无法按常规解释的潜力"],
    erii: ["言灵·审判", "敏锐直觉", "书写交流"],
    "gen-chisei": ["皇血", "家族指挥", "近身战斗"],
    caesar: ["言灵·镰鼬", "战术领导", "资源调度"],
    "chu-zihang": ["言灵·君焰", "战术分析", "近身战斗"],
  }[character.id],
  speech: {
    "lu-mingfei": "常用自嘲和玩笑缓冲恐惧，真正承诺时句子反而短。",
    erii: "通常用本子、动作和表情交流；开口必须受到言灵风险限制。",
    "gen-chisei": "语气克制简洁，习惯先说明责任与风险，很少公开私人软弱。",
    caesar: "自信直接，喜欢把局面说成可以执行的计划，但不轻视当事人的尊严。",
    "chu-zihang": "陈述事实和判断，极少用夸张修辞，关心通常表现为行动。",
  }[character.id],
  soul: {
    "lu-mingfei": ["可以退缩和犯错，但无法对明确向自己求助的人彻底无动于衷。", "勇敢必须付出代价，不能突然变成全知全能英雄。", "具体选择与内心结论始终由玩家决定。"],
    erii: ["单纯不等于没有判断，她有清楚的喜恶和选择权。", "力量极强但身体和言灵控制都存在真实边界。", "任何亲密关系都不能自动治愈她的血统问题。"],
    "gen-chisei": ["保护妹妹与履行家族责任必须同时存在。", "不能把他写成单纯囚禁绘梨衣的反派。", "证据足够时会怀疑权威，但转向需要承担组织后果。"],
    caesar: ["骄傲建立在承担责任和兑现承诺上。", "会制定强势计划，但不能替绘梨衣定义自由。", "面对学院隐瞒时优先保护队员和当事人。"],
    "chu-zihang": ["行动以可验证事实和风险为基础。", "沉默不等于冷漠，对同伴的保护落实为具体行为。", "不会为了推动剧情无依据猜中隐藏真相。"],
  }[character.id],
}));

const allCharacters = [...originalCharacters, ...addedCharacters];
const profileImages = new Map(legacy.onboarding.characterProfiles.map((profile) => [profile.characterId, profile.image]));

const sceneDescriptions = {
  "theme-hotel": "清晨的东京主题旅馆套房，厚重窗帘、深色木墙和黑色石桌形成临时避难所；桌上能放置血清、本子与手机，门外走廊是持续威胁。",
  "tokyo-street": "雨后东京街区，电车高架、便利店、游戏厅和密集行人共享同一视野；它既是普通生活的入口，也是监控与搜索最容易交汇的地方。",
  "sky-observatory": "高空展望台俯瞰东京灯火，落地玻璃映出人物与城市；开阔景观放大自由感，也让接近的警灯和追踪路线无处隐藏。",
  "genji-command": "源氏重工高层指挥区，长桌、城市监控墙、医疗记录终端和封闭电梯共同体现家族秩序；这里适合调度，也适合隐藏信息。",
  "cassell-safehouse": "临时安全屋由地图、通讯设备、装备箱和遮光窗帘组成；凯撒与楚子航在这里把零散情报变成可执行撤离方案。",
  rendezvous: "地下停车区连接城市道路、货运电梯和撤离车辆，多方路线在混凝土柱与监控盲区间交错；任何会合都可能同时变成包围。",
  "red-well": "藏骸之井位于被破坏的工业与地下设施之间，红色应急光照亮积水、钢架和深井边缘；白王秘密、家族谎言与人物命运在这里汇合。",
};

const sceneTitles = {
  "theme-hotel": "借来的安全",
  "tokyo-street": "普通世界",
  "sky-observatory": "城市灯火",
  "genji-command": "家族中枢",
  "cassell-safehouse": "撤离方案",
  rendezvous: "路线交汇",
  "red-well": "真红之土",
};

const manifest = {
  schemaVersion: 2,
  id: legacy.id,
  version: 2,
  title: legacy.title,
  subtitle: legacy.subtitle,
  premise: legacy.premise,
  sourcePolicy: {
    basis: "public-cross-check-and-current-adaptation",
    primarySources: [
      "https://www.sanmin.com.tw/product/index/010197443",
      "https://book.douban.com/subject/34949317/",
    ],
    copyright: "只保存重新表述的梗概与设定，不抓取或复写原著正文。",
  },
  files: {
    backgroundSummary: "background/summary.md",
    backgroundBeats: "background/beats.json",
    comicPages: "comic/pages.json",
    canonTruths: "canon/truths.json",
    canonKnowledge: "canon/knowledge.json",
    plotSpine: "plot/spine.json",
  },
  characterIds: allCharacters.map((character) => character.id),
  locationIds: legacy.locations.map((location) => location.id),
  runtime: {
    playerCharacterId: legacy.playerCharacterId,
    visual: legacy.visual,
    opening: legacy.opening,
    playableRoles: legacy.playableRoles,
    narration: legacy.narration,
    world: legacy.world,
    items: legacy.items,
    initialInventory: legacy.initialInventory,
    threads: legacy.threads,
    foreshadows: legacy.foreshadows,
    ending: legacy.ending,
    roleSelection: legacy.onboarding.roleSelection,
  },
};

await writeJson("manifest.json", manifest);
await writeMarkdown("background/summary.md", backgroundSummary);
await writeJson("background/beats.json", beats);
await writeJson("comic/pages.json", legacy.onboarding.comicPages);
await writeJson("canon/truths.json", legacy.facts);
await writeJson("canon/knowledge.json", {
  initialByCharacterId: Object.fromEntries(allCharacters.map((character) => [character.id, character.knowledgeFactIds])),
  protectedTerms: legacy.facts.filter((fact) => fact.knowledgeGateTerms?.length).map((fact) => ({ truthId: fact.id, terms: fact.knowledgeGateTerms })),
});
await writeJson("plot/spine.json", { nodes: spineNodes });

for (const character of allCharacters) {
  await writeJson(`characters/${character.id}/profile.json`, {
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    role: character.role,
    selectable: legacy.playableRoles.characterIds.includes(character.id),
    onboardingVisible: true,
    tagline: character.tagline,
    publicSummary: character.publicSummary,
    traits: character.traits,
    appearance: character.appearance,
    abilities: character.abilities,
    speech: character.speech,
    image: profileImages.get(character.id) ?? null,
  });
  await writeJson(`characters/${character.id}/initial-state.json`, {
    personality: character.personality,
    goal: character.goal,
    background: character.background,
    locationId: character.locationId,
    status: character.status,
    attitude: character.attitude,
    knowledgeFactIds: character.knowledgeFactIds,
    knownToPlayer: character.knownToPlayer,
  });
  await writeMarkdown(`characters/${character.id}/soul.md`, `# ${character.name} · 灵魂档案

## 核心驱动力

${character.goal}

## 性格与表达

${character.personality}

${character.speech}

## 能力边界

${character.abilities.map((ability) => `- ${ability}`).join("\n")}

## 不可违背的原则

${character.soul.map((rule) => `- ${rule}`).join("\n")}`);
}

for (const location of legacy.locations) {
  const imageSrc = `/assets/scenes/dragon-raja/${location.id}.png`;
  await writeMarkdown(`locations/${location.id}/description.md`, `# ${location.name}

${sceneDescriptions[location.id]}

## 叙事用途

${location.description}`);
  await writeJson(`locations/${location.id}/states.json`, {
    id: location.id,
    name: location.name,
    description: sceneDescriptions[location.id],
    defaultStateId: "default",
    fallbackImage: "/assets/scenes/dragon-raja/fallback.png",
    states: [{
      id: "default",
      title: sceneTitles[location.id],
      description: sceneDescriptions[location.id],
      image: { src: imageSrc, alt: `${location.name}的环境画面` },
    }],
  });
}

console.log(`Story package v2 written to ${storyRoot}`);
