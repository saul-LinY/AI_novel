import { setTimeout as delay } from "node:timers/promises";

function hasKnownFact(state, factId) {
  return state.knownFactIds.includes(factId);
}

function hasItem(state, itemId) {
  return Boolean(state.inventory[itemId]);
}

function matches(action, pattern) {
  return pattern.test(action.replaceAll(/\s+/g, ""));
}

function result(prose, choices, delta = {}, memoryNotes = []) {
  return { prose, proposal: { choices, delta, memoryNotes } };
}

function umbrellaTurn(state) {
  const knownOwner = hasKnownFact(state, "red-umbrella-owner");
  return result(
    knownOwner
      ? "你把红伞转到灯下，先前被雨水遮住的伞骨内侧露出两道刻痕：一边是房号 207，另一边像仓促划下的箭头，指向旅店后院。林秋没有阻止你，只把手从电话听筒上慢慢移开。她显然知道这把伞留下的不只是住客姓名。"
      : "你提起红伞，折得极小的行李签便从伞带里滑落。正面写着“陈默，207”，背面沾着尚未干透的青苔和一小点黑色机油。林秋看见行李签，手指立刻压住登记簿的一角；她刚才声称陈默离店时没有带任何东西，现在这句话已经站不住了。",
    [
      { id: "ask-lin-umbrella", label: "追问林秋为何紧张", action: "我把行李签放到林秋面前，问她到底隐瞒了什么。" },
      { id: "go-courtyard", label: "去内院查青苔", action: "我带上红伞，去雨棚后的内院寻找同样的青苔。" },
      { id: "check-register", label: "核对登记时间", action: "我要求查看昨夜 207 号房的完整登记记录。" },
    ],
    {
      timeAdvanceMinutes: 4,
      learnFactIds: ["red-umbrella-owner"],
      relationshipChanges: knownOwner ? [] : [{ characterId: "lin-qiu", amount: -1, reason: "主角发现红伞与失踪住客有关" }],
    },
    ["红伞属于失踪的陈默", "伞带里的行李签沾有院墙青苔和机油"],
  );
}

function askGuestTurn(state) {
  const missingKeyKnown = hasKnownFact(state, "missing-key");
  return result(
    missingKeyKnown
      ? "你没有让林秋再把话题岔开。她盯着空荡的 207 钥匙钩，终于承认陈默昨夜并未从大门离开：停电后，她听见后办公室的门响过一次。她仍不肯说是谁拿走了钥匙，却在提到办公室时下意识看向柜台最下层的抽屉。"
      : "听见你问 207 的住客，林秋先说陈默在停电前已经退房，随后又改口说自己没看见他离开。你顺着她的视线看去，钥匙架上唯独 207 的位置空着，登记簿却没有退房签字。这个问题没有让她给出姓名之外的答案，反而暴露了钥匙和口供之间的矛盾。",
    [
      { id: "search-key", label: "检查钥匙架和抽屉", action: "我绕到前台侧面，检查 207 的钥匙钩和下面的抽屉。" },
      { id: "check-ledger", label: "核对登记簿", action: "我翻到昨夜的登记页，核对陈默入住和退房的时间。" },
      { id: "inspect-umbrella", label: "查看陈默留下的伞", action: "我转身检查门边那把可能属于陈默的红伞。" },
    ],
    {
      timeAdvanceMinutes: 4,
      learnFactIds: ["missing-key"],
      relationshipChanges: missingKeyKnown ? [] : [{ characterId: "lin-qiu", amount: -1, reason: "主角指出她对陈默去向的说法矛盾" }],
    },
    ["林秋对陈默是否离店前后改口", "207 号钥匙不在钥匙架上"],
  );
}

function keyTurn(state) {
  const alreadyHasKey = hasItem(state, "room-207-key");
  return result(
    alreadyHasKey
      ? "你把 207 号房钥匙放到前台灯下。铜牌一面被磨得发亮，另一面粘着细小的黑色木屑，齿槽里还残留着与红伞背面相同的机油。林秋盯着木屑，没再坚持钥匙一直由陈默带着；这把钥匙近期去过的地方，很可能不是 207 的门锁。"
      : "你绕到前台侧面，发现 207 的钥匙钩空着。最下层抽屉推到一半便被什么卡住，你从背板裂缝摸出一枚冰凉的铜牌。207 号房钥匙一直藏在夹层，而不是被住客带走；林秋伸手想关抽屉，动作却慢了半拍。",
    [
      { id: "use-key", label: "带钥匙去 207", action: "我拿着 207 号房钥匙上楼，检查那扇房门。" },
      { id: "question-key", label: "让林秋解释", action: "我把钥匙放在林秋面前，让她解释为什么要藏起来。" },
      { id: "inspect-key", label: "检查钥匙痕迹", action: "我借着台灯仔细检查钥匙齿槽和铜牌上的痕迹。" },
    ],
    {
      timeAdvanceMinutes: 5,
      addItemIds: alreadyHasKey ? [] : ["room-207-key"],
      learnFactIds: ["missing-key"],
      relationshipChanges: alreadyHasKey ? [] : [{ characterId: "lin-qiu", amount: -1, reason: "主角找到了被藏起的钥匙" }],
    },
    ["207 号房钥匙被藏在前台抽屉夹层", "钥匙牌上粘着黑色木屑和机油"],
  );
}

function upstairsTurn(state) {
  const footprintsKnown = hasKnownFact(state, "wet-footprints");
  return result(
    footprintsKnown
      ? "你再次踏上二楼，没有停在先前的脚印旁。走廊尽头的安全门正在缓慢回弹，门轴上的水珠还在颤动；有人刚从这里出去。207 门下却多出一线微弱的暖光，与停电后始终黑着的走廊格格不入。楼上和内院同时留下了必须取舍的动静。"
      : "楼梯每响一声，大堂的灯就暗一分。你在二楼转角停下，走廊尽头的窗没有关严，雨水吹进来，在地毯上留下一串断续的湿脚印。脚印没有通向大堂楼梯，而是从 207 号房门口拐向后面的安全门，说明那个人走了另一条路。",
    [
      { id: "open-207", label: "检查 207 房门", action: "我先检查 207 号房的门锁和门缝。" },
      { id: "follow-prints", label: "沿湿脚印追过去", action: "我沿着湿脚印走向走廊尽头的安全门。" },
      { id: "listen", label: "停下来听动静", action: "我关掉手机屏幕，站在原地听走廊里的声音。" },
    ],
    { locationId: "upstairs", timeAdvanceMinutes: 7, learnFactIds: ["wet-footprints"] },
    ["二楼湿脚印从 207 号房通向安全门", "脚印并未经过大堂楼梯"],
  );
}

function roomDoorTurn(state) {
  const hasKey = hasItem(state, "room-207-key");
  const hasReceipt = hasItem(state, "torn-receipt");
  let prose;
  if (hasKey) {
    prose = "你用找到的铜钥匙试探门锁，锁舌刚转半圈，门内便传来一声很轻的摩擦。你停手贴近门缝，看到一根细线从门把手牵向床边柜；贸然推门会扯动柜上的玻璃杯。陈默离开前把房间做成了一个会提醒他的简易警报。";
  } else if (hasReceipt) {
    prose = "你再次俯身检查 207 的门缝。原本夹着寄存单的位置只剩一道干燥的纸痕，门内却传来柜脚拖过地板的短响。你没有碰门，响声仍突然停住；这一次可以确定，房里有人知道你正站在外面。";
  } else {
    prose = "你没有直接推门。207 的锁孔边缘有几道新鲜划痕，门缝里夹着半张被撕开的寄存单。你用笔记本封皮把纸片挑出来，上面只剩“后院”和一个被墨水涂黑的柜号。门内没有回应，但地板上有人极轻地挪了一下脚。";
  }
  return result(
    prose,
    [
      { id: "find-room-key", label: "回前台找钥匙", action: "我先不惊动屋里的人，回前台寻找 207 号房钥匙。" },
      { id: "follow-room-prints", label: "追查门外脚印", action: "我沿着 207 门外的湿脚印走向安全门。" },
      { id: "speak-through-door", label: "隔门叫陈默名字", action: "我退开半步，隔着门低声叫陈默的名字。" },
    ],
    {
      locationId: "upstairs",
      timeAdvanceMinutes: 5,
      addItemIds: hasReceipt ? [] : ["torn-receipt"],
    },
    [hasKey ? "207 房门内设有牵动玻璃杯的警报线" : "207 门缝里夹着写有后院字样的寄存单", "207 房内可能有人"],
  );
}

function listenTurn(state) {
  const routeKnown = hasKnownFact(state, "courtyard-route");
  return result(
    routeKnown
      ? "你屏住呼吸，先分辨雨声之外的节奏。铁梯方向传来两次刻意放轻的落脚声，随后安全门的门把缓慢抬起，却没有真正压下去。门后的人也在听你。片刻后，楼下电话铃只响了半声，门把立刻松开；那通电话像是约定好的撤退信号。"
      : "你关掉手机屏幕，走廊随即只剩雨水敲窗的声音。几秒后，安全门外传来金属横档受力的轻颤，紧接着是鞋底擦过湿铁板的声音；有人正在沿外墙梯移动。楼下的林秋这时轻咳了一声，外面的动作立刻停住。两边显然能听见彼此。",
    [
      { id: "check-sound", label: "去查看金属声", action: "我立刻绕到雨棚后，查看刚才的金属碰撞声。" },
      { id: "watch-clerk", label: "观察林秋的反应", action: "我没有移动，只观察林秋听见声音后的反应。" },
      { id: "block-stairs", label: "守住楼梯", action: "我退到楼梯口，防止二楼的人趁机下来。" },
    ],
    { timeAdvanceMinutes: 3 },
    ["安全门外有人在铁梯上移动", "林秋的咳声可能是在传递信号"],
  );
}

function watchClerkTurn() {
  return result(
    "你留在原地，没有顺着声响转头。林秋也没有看向雨棚，她第一眼看的是柜台下那部电话；确认听筒仍离开底座后，她才故意朝二楼喊了一声“水管又松了”。金属声随即停下。她放回听筒时发现你正看着她，脸上的镇定第一次出现裂缝。",
    [
      { id: "inspect-phone", label: "检查前台电话", action: "我走到柜台边，检查林秋刚才动过的电话。" },
      { id: "confront-signal", label: "拆穿她的暗号", action: "我指出她刚才在用咳声和电话给外面的人传信。" },
      { id: "feint-courtyard", label: "假装去内院", action: "我故意说要去内院，然后藏在楼梯转角观察谁会行动。" },
    ],
    { timeAdvanceMinutes: 3, relationshipChanges: [{ characterId: "lin-qiu", amount: -1, reason: "主角识破了她与外面的联络信号" }] },
    ["林秋关注的是前台电话而非金属声", "她的咳声和喊话会让外面的人停止行动"],
  );
}

function blockStairsTurn() {
  return result(
    "你退到楼梯口，既能看住大堂，也挡住二楼唯一的内侧出口。上方那块吱响的木板沉默了几秒，随后脚步反而向走廊深处退去；几乎同时，雨棚后的铁梯重重一晃。对方没有下楼，而是改走安全门。林秋抓起电话，却发现你正好挡在通往柜台外侧的路上。",
    [
      { id: "chase-courtyard", label: "追向雨棚后方", action: "我立刻冲向内院，截住从铁梯下来的人。" },
      { id: "rush-upstairs", label: "返回二楼追人", action: "我转身上楼，追向走廊尽头的安全门。" },
      { id: "hold-and-question", label: "守住出口质问林秋", action: "我继续守住楼梯，让林秋说出谁在使用外墙铁梯。" },
    ],
    { timeAdvanceMinutes: 3 },
    ["楼上的人发现楼梯被守住后改走安全门", "内院铁梯连接着二楼"],
  );
}

function courtyardTurn(state) {
  const routeKnown = hasKnownFact(state, "courtyard-route");
  return result(
    routeKnown
      ? "你推开内院门时，旧铁梯还在雨里轻晃。赵山已经从梯脚退到雨棚阴影下，右手藏在雨衣后；地上的机油罐却来不及收走。你用红伞挡住回大堂的窄门，他只得停下。梯级上的水迹一路向上，而最下一级留下了刚踩过的完整鞋印。"
      : "你绕到雨棚后，金属声的来源立刻显现：一架贴着外墙的旧铁梯正在晃动，顶端直抵二楼安全门。扶手上有一层新鲜机油，雨水还没来得及冲散。值夜保安赵山站在梯脚，手里握着本该锁在工具间的扳手，见你出现便横身挡住去路。",
    [
      { id: "question-guard", label: "质问值夜保安", action: "我问赵山，刚才是谁使用了这架铁梯。" },
      { id: "inspect-ladder", label: "检查铁梯痕迹", action: "我避开赵山，检查铁梯上的鞋印和机油。" },
      { id: "climb-ladder", label: "沿铁梯上二楼", action: "我抓住铁梯扶手，从外墙直接爬向二楼安全门。" },
    ],
    {
      locationId: "courtyard",
      timeAdvanceMinutes: 5,
      learnFactIds: ["courtyard-route"],
      relationshipChanges: routeKnown ? [] : [{ characterId: "zhao-shan", amount: -1, reason: "主角闯入他试图封锁的内院" }],
    },
    ["内院旧铁梯可绕过前台直通二楼", "铁梯扶手上有新鲜机油"],
  );
}

function followFootprintsTurn(state) {
  const routeKnown = hasKnownFact(state, "courtyard-route");
  return result(
    routeKnown
      ? "你沿着新添的水印穿过安全门，脚印在铁梯顶端忽然变乱：一双鞋向下，另一双鞋却从梯边跨回走廊。有人在这里接应，也有人故意把追踪方向引向内院。栏杆上挂着一小片蓝色雨衣布，和赵山身上的颜色完全相同。"
      : "你沿湿脚印走到安全门，门闩没有锁，边缘还粘着一小块湿青苔。门外的旧铁梯贴墙通向内院，最上两级留着新鲜鞋印；脚印到这里并未消失，只是从木地板换到了被雨冲刷的铁板。楼下的人不必经过前台也能抵达 207。",
    [
      { id: "descend-ladder", label: "沿铁梯追到内院", action: "我沿着外墙铁梯下到内院，继续追查脚印。" },
      { id: "return-207", label: "返回 207 门口", action: "我记下鞋印形状，返回 207 号房门口检查。" },
      { id: "call-out-guard", label: "叫住院里的保安", action: "我从铁梯顶端叫住赵山，让他留在原地。" },
    ],
    { locationId: "upstairs", timeAdvanceMinutes: 5, learnFactIds: ["courtyard-route", "wet-footprints"] },
    ["湿脚印经安全门连到内院铁梯", routeKnown ? "铁梯处出现了两个人的鞋印" : "铁梯能绕过大堂直达二楼"],
  );
}

function clockTurn(state) {
  const known = hasKnownFact(state, "stopped-clock");
  return result(
    known
      ? "你把登记簿最后一页迎着台灯翻起，纸张下缘显出被撕后重新粘合的纤维。23:40 那一行压痕很浅，下面却叠着一个更早写下的时间：23:16。有人撕掉原页、照着内容重抄，却把停电后的假时间写得太用力，反而留下了两层不一致的笔迹。"
      : "登记簿最后一行写着 23:40，墨迹比前几行明显更深。你抬头时注意到大堂挂钟停在 23:17。林秋说停电后钟就坏了，可登记簿上那一行偏偏用了停电前已经用完的蓝黑墨水；23:40 不是当时留下的记录，而是后来补写的。",
    [
      { id: "ask-power", label: "追问停电经过", action: "我问林秋，昨晚 23:17 停电时谁在大堂。" },
      { id: "inspect-ledger", label: "检查登记簿纸张", action: "我仔细检查登记簿最后一页有没有被替换过。" },
      { id: "find-guard", label: "找值夜保安核对", action: "我去内院找赵山核对昨晚停电的时间。" },
    ],
    { timeAdvanceMinutes: 6, learnFactIds: ["stopped-clock"] },
    ["挂钟停在 23:17", known ? "登记簿原页可能被撕掉后重新誊写" : "登记簿中的 23:40 是事后补写"],
  );
}

function guardTurn() {
  return result(
    "赵山先说整夜没人动过铁梯，你把扶手上的新机油指给他看后，他又改口称自己在 23:20 检修过。这个时间正好晚于停电三分钟。他不肯说替谁开了安全门，却警告你别进后办公室；警告出口，他才意识到你从未提过办公室。",
    [
      { id: "press-guard", label: "追问后办公室", action: "我追问赵山，后办公室里藏着什么。" },
      { id: "compare-oil", label: "比对机油痕迹", action: "我把红伞和钥匙上的黑色痕迹与铁梯机油比对。" },
      { id: "enter-office", label: "返回旅店找办公室", action: "我不再争辩，返回大堂寻找后办公室的入口。" },
    ],
    { locationId: "courtyard", timeAdvanceMinutes: 4, relationshipChanges: [{ characterId: "zhao-shan", amount: -1, reason: "主角揭穿了他对铁梯的谎话" }] },
    ["赵山承认停电后动过铁梯", "赵山无意中提到了后办公室"],
  );
}

function questionKeyTurn() {
  return result(
    "你把铜钥匙推到林秋面前，问她为什么要藏起来。她没有再否认，只说陈默失踪后有人从后办公室打来电话，命令她把钥匙留在抽屉夹层。她声称没听出对方是谁，可电话就在柜台下面，听筒边缘还沾着和钥匙齿槽相同的黑色机油。",
    [
      { id: "inspect-phone", label: "检查前台电话", action: "我检查柜台下的电话和最近拨出的号码。" },
      { id: "enter-office", label: "寻找后办公室", action: "我返回大堂，寻找林秋提到的后办公室入口。" },
      { id: "inspect-key", label: "比对钥匙痕迹", action: "我仔细检查钥匙齿槽里的木屑和机油。" },
    ],
    { timeAdvanceMinutes: 4, relationshipChanges: [{ characterId: "lin-qiu", amount: -1, reason: "主角用藏起的钥匙迫使她交代电话指令" }] },
    ["林秋称藏钥匙的指令来自后办公室电话", "电话听筒边缘也有黑色机油"],
  );
}

function inspectKeyTurn() {
  return result(
    "你用纸角擦过钥匙齿槽，留下的不是门锁常见的黄铜粉，而是潮湿木屑和黑色机油。铜牌侧面还有一道半月形压痕，尺寸正好能卡进内院铁梯的检修锁。207 的钥匙被人当成工具使用过，它藏在抽屉里并不只是为了阻止别人开房门。",
    [
      { id: "compare-oil", label: "去铁梯比对机油", action: "我带着钥匙去内院，把齿槽里的机油与铁梯扶手比对。" },
      { id: "use-key", label: "去 207 试钥匙", action: "我拿着钥匙上楼，检查它还能否打开 207 号房。" },
      { id: "question-key", label: "追问林秋用途", action: "我让林秋解释这把房门钥匙为什么会留下铁梯检修痕迹。" },
    ],
    { timeAdvanceMinutes: 4 },
    ["207 钥匙沾有潮木屑和机油", "钥匙铜牌可能被用来打开铁梯检修锁"],
  );
}

function callThroughDoorTurn() {
  return result(
    "你隔着门低声叫出陈默的名字。房内没有说话，却有人用指节在门板下方敲了三次，停顿后又敲一次。紧接着，一张写着“办公室有副线”的纸角从门缝推出，尚未完全露出就被里面的人猛地扯回；走廊另一端同时响起安全门把手转动的声音。",
    [
      { id: "enter-office", label: "去查办公室副线", action: "我记下纸上的提示，返回大堂寻找后办公室的电话副线。" },
      { id: "find-room-key", label: "先找 207 钥匙", action: "我守住门口，设法让林秋把 207 号房钥匙交出来。" },
      { id: "follow-room-prints", label: "追安全门外的人", action: "我离开房门，追向刚被转动的安全门。" },
    ],
    { locationId: "upstairs", timeAdvanceMinutes: 4 },
    ["207 房内的人用敲击回应了陈默的名字", "房内纸条提到后办公室电话副线"],
  );
}

function inspectPhoneTurn() {
  return result(
    "你拿起前台电话，听筒里没有拨号音，只有很轻的电流声。按下重拨键后，铃声没有从线路远端传来，反而在大堂后墙响了两次；林秋立刻伸手切断电源。电话被接到旅店内部的副线上，刚才她的动作不是打给外面，而是在提醒后办公室里的人。",
    [
      { id: "enter-office", label: "循铃声找办公室", action: "我沿着后墙寻找铃声来源和后办公室入口。" },
      { id: "confront-signal", label: "拆穿内部联络", action: "我指出这部电话连着后办公室，让林秋交代里面是谁。" },
      { id: "block-stairs", label: "先封住楼梯出口", action: "我先退到楼梯口，防止收到信号的人从二楼离开。" },
    ],
    { timeAdvanceMinutes: 4 },
    ["前台电话的重拨铃声来自大堂后墙", "林秋用内部副线联络后办公室"],
  );
}

function confrontSignalTurn() {
  return result(
    "你点破咳声和电话都是暗号。林秋沉默片刻，承认她在提醒赵山，却说目的不是帮他逃跑，而是防止他惊动藏在 207 的陈默。她把一枚办公室门卡放到柜台上，要求你二选一：现在去看昨夜的电话记录，或继续追铁梯上的人。至少这一次，她给出了可以验证的东西。",
    [
      { id: "enter-office", label: "查看电话记录", action: "我拿上门卡，进入后办公室查看昨夜的电话记录。" },
      { id: "question-guard", label: "去内院对质赵山", action: "我去内院找赵山，核对林秋说的警告暗号。" },
      { id: "open-207", label: "先确认陈默是否在房内", action: "我先上楼检查 207 房门，确认林秋关于陈默的说法。" },
    ],
    { timeAdvanceMinutes: 4, relationshipChanges: [{ characterId: "lin-qiu", amount: 1, reason: "林秋交出办公室门卡供主角验证说法" }] },
    ["林秋承认用暗号提醒赵山", "林秋声称自己在保护藏于 207 的陈默"],
  );
}

function feintTurn() {
  return result(
    "你故意宣布要去内院，脚步却停在楼梯转角。林秋等了几秒，迅速拉开抽屉按下藏在里面的按钮；后墙随即传来门锁弹开的轻响。与此同时，二楼没有任何人移动。这个假动作奏效了：真正需要掩护的入口不在雨棚，而在大堂后方。",
    [
      { id: "enter-office", label: "趁机进入后办公室", action: "我立刻折返，推开刚刚解锁的后办公室门。" },
      { id: "inspect-phone", label: "检查抽屉内按钮", action: "我拦住林秋，检查抽屉里的按钮和电话线路。" },
      { id: "hold-and-question", label: "继续封住出口", action: "我守住楼梯和大门，让林秋说出后墙里的人是谁。" },
    ],
    { timeAdvanceMinutes: 3 },
    ["林秋抽屉里的按钮能解锁后办公室", "假装去内院时后墙入口暴露"],
  );
}

function inspectLadderTurn() {
  return result(
    "你蹲到铁梯侧面避开雨水。最下方两级各有一种鞋印：一双鞋底磨损严重，只向下；另一双较窄，沾着二楼地毯的红色纤维，既上过楼又返回内院。检修锁边缘的半月形刮痕则与 207 钥匙铜牌完全吻合，说明有人一直用房门钥匙开启这条通道。",
    [
      { id: "climb-ladder", label: "沿窄鞋印上楼", action: "我沿铁梯爬上二楼，追查带红色纤维的窄鞋印。" },
      { id: "question-guard", label: "让赵山解释鞋印", action: "我叫住赵山，让他解释铁梯上的两种鞋印。" },
      { id: "compare-oil", label: "比对钥匙与检修锁", action: "我拿出 207 钥匙，比对铜牌与铁梯检修锁的刮痕。" },
    ],
    { locationId: "courtyard", timeAdvanceMinutes: 4, learnFactIds: ["courtyard-route"] },
    ["铁梯上有两个人的鞋印", "207 钥匙铜牌可开启铁梯检修锁"],
  );
}

function climbLadderTurn() {
  return result(
    "你抓住湿滑的扶手向上攀爬，铁梯顶端正对二楼安全门。门没有上锁，内侧却系着一根延伸到 207 门框的细线；只要有人从外面开门，房内就会先得到警告。你侧身越过门槛时，看到窄鞋印消失在 207 门前，而另一串水迹刚刚转向楼梯。",
    [
      { id: "open-207", label: "检查警戒中的 207", action: "我避开警戒细线，检查 207 号房的门锁和门缝。" },
      { id: "listen", label: "先听两边动静", action: "我停在安全门内，听 207 房内和楼梯方向的动静。" },
      { id: "block-stairs", label: "抢先守住楼梯", action: "我赶到楼梯口，截住刚转向那里的脚步。" },
    ],
    { locationId: "upstairs", timeAdvanceMinutes: 5, learnFactIds: ["courtyard-route", "wet-footprints"] },
    ["安全门与 207 房门之间连有警戒细线", "窄鞋印从铁梯通向 207"],
  );
}

function powerTurn() {
  return result(
    "你追问 23:17 停电时谁在大堂。林秋回答赵山正在内院检查配电箱，可大堂后墙的应急灯记录显示，配电箱在停电前三分钟就被手动打开。更矛盾的是，停电后办公室副线仍有一次四十秒的通话。断掉的是客用电路，有人刻意保留了内部联络。",
    [
      { id: "inspect-ledger", label: "对照登记簿压痕", action: "我把停电记录与登记簿最后一页的笔迹和压痕对照。" },
      { id: "find-guard", label: "找赵山核对配电箱", action: "我去内院找赵山，问他为何提前打开配电箱。" },
      { id: "enter-office", label: "查办公室通话记录", action: "我进入后办公室，查看停电后的内部通话记录。" },
    ],
    { timeAdvanceMinutes: 5, learnFactIds: ["stopped-clock"] },
    ["配电箱在停电前三分钟被手动打开", "停电后办公室副线仍完成过一次通话"],
  );
}

function ledgerTurn() {
  return result(
    "你把登记簿末页斜对灯光，23:40 下方浮出上一张纸留下的压痕：原时间是 23:16，后面还写着“转后办”。末页纸张的装订孔也比其他页宽，证明原页被撕走后才补抄。陈默在停电前一分钟被带往后办公室，23:40 只是掩盖这次转移的假记录。",
    [
      { id: "enter-office", label: "去后办公室查原页", action: "我沿着登记簿的提示，进入后办公室寻找被撕走的原页。" },
      { id: "ask-power", label: "追问 23:17 停电", action: "我让林秋说明陈默被转移后为何立刻停电。" },
      { id: "inspect-umbrella", label: "核对陈默随身物", action: "我用门边的红伞和行李签核对陈默是否真的离店。" },
    ],
    { timeAdvanceMinutes: 5, learnFactIds: ["stopped-clock"] },
    ["登记簿原记录是 23:16 转后办公室", "23:40 是撕掉原页后的补写时间"],
  );
}

function pressGuardTurn() {
  return result(
    "你抓住赵山脱口而出的“后办公室”继续追问。他终于承认，停电后自己用铁梯把一个受伤的人送到二楼，随后又按林秋要求把陈默从大堂带进办公室。谁受了伤他不肯说，只交出一把沾机油的门卡，声称昨夜的电话录音能证明他没有参与失踪。",
    [
      { id: "enter-office", label: "用门卡进办公室", action: "我拿着赵山的门卡，返回大堂进入后办公室。" },
      { id: "compare-oil", label: "核对门卡和铁梯", action: "我比对门卡、207 钥匙和铁梯检修锁上的机油。" },
      { id: "climb-ladder", label: "追查受伤的人", action: "我沿铁梯上二楼，寻找赵山送上去的受伤者。" },
    ],
    { locationId: "courtyard", timeAdvanceMinutes: 5, relationshipChanges: [{ characterId: "zhao-shan", amount: 1, reason: "赵山交出办公室门卡并提供可验证的口供" }] },
    ["赵山承认停电后用铁梯送一名伤者上楼", "陈默在停电后被带进后办公室"],
  );
}

function compareOilTurn() {
  return result(
    "你把红伞行李签、207 钥匙和铁梯检修锁放在一起比对。三处黑色痕迹的气味和黏度完全相同，里面都混着后院老发电机特有的铜屑。钥匙先开过铁梯锁，随后被藏回前台；红伞则经过同一条路。陈默没有从正门离店，他至少到过内院和二楼之间。",
    [
      { id: "enter-office", label: "查发电机维护记录", action: "我进入后办公室，查找老发电机和铁梯的维护记录。" },
      { id: "open-207", label: "带证据去 207", action: "我带着比对结果上楼，再次检查 207 号房。" },
      { id: "confront-signal", label: "用结果质问林秋", action: "我把三处相同机油的结果告诉林秋，让她交代陈默走过的路线。" },
    ],
    { timeAdvanceMinutes: 5, learnFactIds: ["courtyard-route"] },
    ["红伞、207 钥匙和铁梯沾有同一种发电机油", "陈默曾经过内院铁梯路线"],
  );
}

function officeTurn(state) {
  const clockKnown = hasKnownFact(state, "stopped-clock");
  return result(
    clockKnown
      ? "你推开后办公室门，墙上的电话副机仍亮着通话灯。桌面摊着被撕走的登记簿原页，23:16 后面写着“陈默，转 207，等医生”，旁边却多出一个陌生人的鞋印拓样。文件柜最下层传来一次压抑的呼吸声；这间办公室现在并不只有你。"
      : "你沿大堂后墙找到一道与木饰板同色的窄门。办公室里亮着独立电源，电话副机停在通话计时界面，桌上压着半张被撕下的登记页：最后可辨的时间不是 23:40，而是 23:16。文件柜下还散着和铁梯扶手相同的黑色机油。",
    [
      { id: "inspect-ledger", label: "检查被撕的登记页", action: "我检查桌上的登记簿原页，辨认被改写的时间和备注。" },
      { id: "inspect-phone", label: "查看副机通话记录", action: "我查看办公室电话副机昨夜的通话记录。" },
      { id: "open-207", label: "带原记录去 207", action: "我带上登记原页，去 207 号房核对陈默的去向。" },
    ],
    { locationId: "office", timeAdvanceMinutes: 5, learnFactIds: clockKnown ? [] : ["stopped-clock"] },
    ["后办公室使用独立电源和内部电话副线", "办公室里藏着被撕走的登记原页"],
  );
}

function genericChoices(state) {
  if (state.locationId === "courtyard") {
    return [
      { id: "question-guard", label: "询问值夜保安", action: "我找赵山核对刚才发生的事情。" },
      { id: "inspect-ladder", label: "检查铁梯痕迹", action: "我检查内院铁梯上的鞋印、机油和检修锁。" },
      { id: "enter-office", label: "返回大堂查办公室", action: "我返回大堂，寻找后办公室的入口。" },
    ];
  }
  if (state.locationId === "upstairs" || state.locationId === "room-207") {
    return [
      { id: "open-207", label: "检查 207 房门", action: "我检查 207 号房的门锁和门缝。" },
      { id: "follow-prints", label: "追查湿脚印", action: "我沿着湿脚印追向安全门。" },
      { id: "listen", label: "分辨附近动静", action: "我停下来，仔细分辨房内和走廊里的声音。" },
    ];
  }
  if (state.locationId === "office") {
    return [
      { id: "inspect-ledger", label: "检查登记原页", action: "我检查办公室里的登记簿原页和修改痕迹。" },
      { id: "inspect-phone", label: "查看内部电话", action: "我查看办公室电话的通话记录。" },
      { id: "open-207", label: "返回 207 核对", action: "我带着办公室里的证据去 207 号房核对。" },
    ];
  }
  return [
    { id: "inspect-umbrella", label: "检查门边红伞", action: "我检查门边红伞留下的行李签和污迹。" },
    { id: "search-key", label: "检查前台抽屉", action: "我检查前台钥匙架和最下层抽屉。" },
    { id: "choice-upstairs", label: "上二楼继续调查", action: "我沿楼梯上二楼，查看 207 附近的情况。" },
  ];
}

function genericTurn(action, state) {
  const location = state.locationId;
  const actionText = action.replace(/[。！？!?]+$/u, "").slice(0, 42);
  const scene = {
    lobby: "大堂里，林秋的目光随着你移动，柜台下的电话线却仍微微绷紧",
    upstairs: "二楼走廊里，安全门灌入的冷风把湿脚印边缘吹得越来越淡",
    "room-207": "207 号房附近，墙内传来水管震动般的低响",
    office: "后办公室门外，纸张和潮木头的气味混在一起",
    courtyard: "内院里，雨水正把铁梯下的鞋印冲向排水沟",
  }[location] ?? "旅店里，雨声掩住了远处的一次轻响";
  return result(
    `你开始执行自己的打算：“${actionText}”。${scene}。这次试探没有立刻揭开答案，却逼出了一个可以确认的变化：刚才还保持沉默的人调整了位置，现场也多了一处来不及掩饰的新痕迹。你必须决定先追人，还是先保住眼前的证据。`,
    genericChoices(state),
    { timeAdvanceMinutes: 4 },
    [`主角采取了行动：${actionText}`, "行动迫使现场中的某个人改变了位置"],
  );
}

function turnForChoice(choiceId, state) {
  const handlers = {
    "choice-umbrella": umbrellaTurn,
    "choice-clerk": askGuestTurn,
    "ask-lin-umbrella": askGuestTurn,
    "go-courtyard": courtyardTurn,
    "check-register": clockTurn,
    "search-key": keyTurn,
    "check-ledger": ledgerTurn,
    "inspect-umbrella": umbrellaTurn,
    "use-key": roomDoorTurn,
    "question-key": questionKeyTurn,
    "inspect-key": inspectKeyTurn,
    "open-207": roomDoorTurn,
    "follow-prints": followFootprintsTurn,
    listen: listenTurn,
    "find-room-key": keyTurn,
    "follow-room-prints": followFootprintsTurn,
    "speak-through-door": callThroughDoorTurn,
    "check-sound": courtyardTurn,
    "watch-clerk": watchClerkTurn,
    "block-stairs": blockStairsTurn,
    "inspect-phone": inspectPhoneTurn,
    "confront-signal": confrontSignalTurn,
    "feint-courtyard": feintTurn,
    "chase-courtyard": courtyardTurn,
    "rush-upstairs": upstairsTurn,
    "hold-and-question": confrontSignalTurn,
    "question-guard": guardTurn,
    "inspect-ladder": inspectLadderTurn,
    "climb-ladder": climbLadderTurn,
    "descend-ladder": courtyardTurn,
    "return-207": roomDoorTurn,
    "call-out-guard": guardTurn,
    "ask-power": powerTurn,
    "inspect-ledger": ledgerTurn,
    "find-guard": guardTurn,
    "press-guard": pressGuardTurn,
    "compare-oil": compareOilTurn,
    "enter-office": officeTurn,
    "choice-upstairs": upstairsTurn,
  };
  return handlers[choiceId]?.(state) ?? null;
}

export function createDemoTurn({ action, choiceId = null, state }) {
  const selectedTurn = choiceId ? turnForChoice(choiceId, state) : null;
  if (selectedTurn) return selectedTurn;
  const normalized = action.toLowerCase();

  if (matches(normalized, /后办公室|办公室入口|内部副线|电话记录/)) return officeTurn(state);
  if (matches(normalized, /检查.*电话|重拨|听筒|电话线路/)) return inspectPhoneTurn();
  if (matches(normalized, /暗号|传信|联络信号/)) return confrontSignalTurn();
  if (matches(normalized, /检查.*铁梯|铁梯.*(鞋印|机油|痕迹|检修锁)/)) return inspectLadderTurn();
  if (matches(normalized, /沿.*铁梯.*(上|爬)|爬.*铁梯/)) return climbLadderTurn();
  if (matches(normalized, /隔.*门.*(陈默|名字)|叫.*陈默/)) return callThroughDoorTurn();
  if (matches(normalized, /观察.*林秋|林秋.*反应|没有移动.*观察/)) return watchClerkTurn();
  if (matches(normalized, /守住.*楼梯|堵住.*楼梯|楼梯口.*防止/)) return blockStairsTurn();
  if (matches(normalized, /听.*动静|站在原地听|关掉手机|屏住呼吸/)) return listenTurn(state);
  if (matches(normalized, /沿.*脚印|追.*脚印|脚印.*安全门/)) return followFootprintsTurn(state);
  if (matches(normalized, /检查.*207.*(门|锁|门缝)|207.*(门锁|门缝)|打开.*207|进入.*207/)) return roomDoorTurn(state);
  if (matches(normalized, /问.*(赵山|保安)|质问.*保安|赵山.*(铁梯|时间)/)) return guardTurn();
  if (matches(normalized, /金属.*声|雨棚|内院|铁梯|梯子/)) return courtyardTurn(state);
  if (matches(normalized, /(问|询问|追问|质问|解释|隐瞒).*(林秋|陈默|住客|207)|(林秋|陈默|住客|207).*(去了哪里|怎么回事|为什么)/)) {
    return askGuestTurn(state);
  }
  if (matches(normalized, /检查.*登记|登记.*(纸|页|压痕|笔迹)/)) return ledgerTurn();
  if (matches(normalized, /问.*停电|停电.*谁|配电箱/)) return powerTurn();
  if (matches(normalized, /登记|挂钟|时钟|停电|23[:：]?17|23[:：]?40/)) return clockTurn(state);
  if (matches(normalized, /比对.*(机油|痕迹)|相同.*机油/)) return compareOilTurn();
  if (matches(normalized, /钥匙|抽屉|钥匙架|铜牌/)) return keyTurn(state);
  if (matches(normalized, /红伞|雨伞|伞带|行李签|门边.*伞/)) return umbrellaTurn(state);
  if (matches(normalized, /二楼|楼梯|上楼|207/)) return upstairsTurn(state);
  return genericTurn(action, state);
}

export async function generateDemoTurn({ action, choiceId, state, onDelta }) {
  const turn = createDemoTurn({ action, choiceId, state });
  for (const chunk of turn.prose.match(/.{1,12}/gu) ?? [turn.prose]) {
    onDelta(chunk);
    await delay(24);
  }
  return { ...turn, piEntryId: null };
}
