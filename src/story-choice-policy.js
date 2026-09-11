import { Type } from "typebox";
import Schema from "typebox/schema";

const referenceId = Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-zA-Z0-9:_-]+$" });
export const CHOICE_PLAN_SCHEMA = Type.Array(Type.Object({
  choiceId: referenceId,
  targetKind: Type.Union([Type.Literal("thread"), Type.Literal("goal")]),
  targetId: referenceId,
  approach: Type.Union(["investigate", "confront", "commit", "maneuver", "protect"].map((value) => Type.Literal(value))),
  expectedChange: Type.String({ minLength: 12, maxLength: 240 }),
  risk: Type.String({ minLength: 8, maxLength: 200 }),
}), { minItems: 2, maxItems: 4 });

const planValidator = Schema.Compile(CHOICE_PLAN_SCHEMA);
const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");

export const CHOICE_POLICY = `推荐选项是推进故事的行动，不是给当前气氛换三种说法。
非结局回合提供2到4项选择，通常3项。每一项都必须针对回合结束后仍未解决的一个目标或玩家已知线索，并给出具体对象、手段及要争取的变化。
推进是获得能改变计划的新证据、迫使一方表态或行动、作出有代价的承诺、交换稀缺资源、改变行动路线或处理正在发生的威胁；至少两种不同的行动方式，结果、代价与人物立场要有实质区别。
优先把已经明确的意愿推进到执行，不要连续用确认、再问、再核实拖延决定。查证要有具体证据或交易对象，并明确查证要争取什么；人物已经表态时，不要换个措辞再次询问同一个态度。至少一项应让玩家主动出发、交涉、提交证据、承担交换条件或采取保护措施，而非三项都停在观察与确认。
纯吃饭、看风景、重复安慰、泛泛问以后去哪、没有目标地等待，不得单独成为推荐选项。日常或温柔的行动也可以推荐，但必须同时触及具体冲突并改变局面，例如借早餐核对两份矛盾的治疗记录，而不是再次一起吃早餐。
label简短有力；action写玩家现在能实际尝试的行动，让玩家读得出目的与取舍。不得预定成功、控制NPC、泄露未知事实、凭空添加袭击或复活已经解决的危机。不要把刚完成的行动换个措辞再推荐。
为每个选项在顶层choicePlan提交{choiceId,targetKind,targetId,approach,expectedChange,risk}。targetKind为thread时只能引用仍open且玩家已知的线索ID，为goal时只能引用当前有效阶段尚未完成的目标ID；按本回合delta和storyProgress生效后的状态设计。approach为investigate/confront/commit/maneuver/protect；expectedChange说明下一步可能造成的具体局面变化，risk说明实际代价或不确定性。计划是内部校验，不写进正文或按钮。
已经完成的目标不能再次提交completeGoalIds。完成最后一个阶段必须同时提交结构化ending并令choices=[]，省略choicePlan；不可只在正文声称故事结束却继续推荐生活片段。`;

export function choiceContext(state, storyPackage) {
  const progress = state.storyProgress.stages.find((stage) => stage.id === state.storyProgress.currentStageId);
  const node = storyPackage.stages.find((stage) => stage.id === progress?.id);
  const knownIds = new Set(state.characters[storyPackage.playerCharacterId].knowledgeFactIds);
  return {
    currentNode: node ? { ...node, progress } : null,
    openThreads: Object.values(state.threads).filter((thread) => thread.knownToPlayer && thread.status === "open")
      .map(({ id, title }) => ({ id, title })),
    availableGoals: progress?.status === "active"
      ? node.goals.filter((goal) => !progress.completedGoalIds.includes(goal.id)).map(({ id, title }) => ({ id, title })) : [],
    knownFacts: [...storyPackage.facts, ...Object.values(state.generatedFacts)].filter((fact) => knownIds.has(fact.id))
      .map((fact) => ({ id: fact.id, text: fact.truth ?? fact.text })),
    finalStageComplete: state.storyProgress.stages.at(-1)?.status === "completed",
  };
}

// Validate before prose is streamed. Plans describe possible consequences, never force them to happen.
export function validateChoicePlan({ proposal, stateAfter, storyPackage, recentEvents = [] }) {
  if (proposal.outcome.type === "action_not_allowed" || proposal.ending) return;
  const context = choiceContext(stateAfter, storyPackage);
  if (context.finalStageComplete) throw new Error("最终阶段已经完成：请提交ending并清空choices，不得继续生成尾声选项");
  const [valid] = planValidator.Errors(proposal.choicePlan);
  if (!valid) throw new Error("每个推荐选项都必须在choicePlan中给出推进目标、行动方式、具体变化和代价");
  const choices = proposal.choices;
  if (proposal.choicePlan.length !== choices.length || new Set(proposal.choicePlan.map((plan) => plan.choiceId)).size !== choices.length) {
    throw new Error("choicePlan必须与choices逐项对应，不能缺失或重复");
  }
  const targets = { thread: new Set(context.openThreads.map((thread) => thread.id)), goal: new Set(context.availableGoals.map((goal) => goal.id)) };
  const previousActions = new Set(recentEvents.slice(-4).map((event) => normalize(event.action)).filter(Boolean));
  const actions = new Set();
  for (const choice of choices) {
    const plan = proposal.choicePlan.find((item) => item.choiceId === choice.id);
    if (!plan) throw new Error(`选项 ${choice.id} 缺少对应的推进计划`);
    if (!targets[plan.targetKind].has(plan.targetId)) throw new Error(`选项 ${choice.id} 必须针对仍未解决且可用的目标，不能使用 ${plan.targetId}`);
    const action = normalize(choice.action);
    if (actions.has(action)) throw new Error("推荐选项不能用不同标题重复同一个行动");
    if (previousActions.has(action)) throw new Error("推荐选项不能重复近期已经执行的行动");
    actions.add(action);
  }
  if (new Set(proposal.choicePlan.map((plan) => plan.approach)).size < 2) {
    throw new Error("推荐选项至少需要两种不同的行动方式，不能都是同一种处理的改写");
  }
  const previousChoices = new Set((recentEvents.at(-1)?.choices ?? []).map((choice) => normalize(choice.action)));
  if (actions.size === previousChoices.size && [...actions].every((action) => previousChoices.has(action))) {
    throw new Error("整组推荐行动与上一回合相同：请根据本回合的新局面重新设计选择，不要重复之前的菜单");
  }
}
