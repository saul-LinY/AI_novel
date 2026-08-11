const elements = {
  actionForm: document.querySelector("#action-form"),
  actionInput: document.querySelector("#action-input"),
  branchList: document.querySelector("#branch-list"),
  branchPanel: document.querySelector("#branch-panel"),
  branchToggle: document.querySelector("#branch-toggle"),
  characterCount: document.querySelector("#character-count"),
  characterList: document.querySelector("#character-list"),
  choiceList: document.querySelector("#choice-list"),
  choicesSection: document.querySelector("#choices-section"),
  clueList: document.querySelector("#clue-list"),
  composerCount: document.querySelector("#composer-count"),
  inventoryList: document.querySelector("#inventory-list"),
  panelScrim: document.querySelector("#panel-scrim"),
  resetStory: document.querySelector("#reset-story"),
  runtimeStatus: document.querySelector("#runtime-status"),
  sceneEyebrow: document.querySelector("#scene-eyebrow"),
  sceneTitle: document.querySelector("#scene-title"),
  sendAction: document.querySelector("#send-action"),
  stateLocation: document.querySelector("#state-location"),
  statePanel: document.querySelector("#state-panel"),
  stateTime: document.querySelector("#state-time"),
  stateToggle: document.querySelector("#state-toggle"),
  stopAction: document.querySelector("#stop-action"),
  storyLocation: document.querySelector("#story-location"),
  storyScroll: document.querySelector("#story-scroll"),
  storySubtitle: document.querySelector("#story-subtitle"),
  storyTimeline: document.querySelector("#story-timeline"),
  storyTitle: document.querySelector("#story-title"),
  threadList: document.querySelector("#thread-list"),
  toast: document.querySelector("#toast"),
  turnCounter: document.querySelector("#turn-counter"),
};

let story = null;
let generating = false;
let toastTimer = null;
const mobilePanels = window.matchMedia("(max-width: 880px)");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function showToast(message, type = "info") {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible${type === "error" ? " error" : ""}`;
  toastTimer = setTimeout(() => {
    elements.toast.className = "toast";
  }, 3200);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function relationLabel(attitude) {
  if (attitude >= 2) return { label: "信任", className: "warm" };
  if (attitude === 1) return { label: "友善", className: "warm" };
  if (attitude <= -2) return { label: "敌意", className: "cold" };
  if (attitude === -1) return { label: "警惕", className: "cold" };
  return { label: "观望", className: "" };
}

function syncPanelAccessibility() {
  const branchHidden = mobilePanels.matches && !document.body.classList.contains("branch-open");
  const stateHidden = mobilePanels.matches && !document.body.classList.contains("state-open");
  elements.branchPanel.inert = branchHidden;
  elements.statePanel.inert = stateHidden;
  if (mobilePanels.matches) {
    elements.branchPanel.setAttribute("aria-hidden", String(branchHidden));
    elements.statePanel.setAttribute("aria-hidden", String(stateHidden));
  } else {
    elements.branchPanel.removeAttribute("aria-hidden");
    elements.statePanel.removeAttribute("aria-hidden");
  }
}

function closePanels() {
  document.body.classList.remove("branch-open", "state-open");
  elements.panelScrim.hidden = true;
  syncPanelAccessibility();
}

function openPanel(panel) {
  closePanels();
  document.body.classList.add(`${panel}-open`);
  elements.panelScrim.hidden = false;
  syncPanelAccessibility();
}

function renderRuntimeStatus() {
  const isPi = story.runtimeMode === "pi";
  elements.runtimeStatus.dataset.mode = story.runtimeMode;
  elements.runtimeStatus.querySelector("span:last-child").textContent = isPi ? "Pi 实时生成" : "演示写作";
  elements.runtimeStatus.title = isPi ? "使用 Pi 和当前已配置模型" : "使用内置演示剧情";
}

function renderBranches() {
  elements.branchList.innerHTML = story.branches
    .map((branch) => {
      const active = branch.id === story.currentBranchId;
      return `<button class="branch-item${active ? " active" : ""}" type="button" data-branch-id="${escapeHtml(branch.id)}" ${active ? 'aria-current="true"' : ""}>
        <span class="branch-symbol"><i data-lucide="${branch.parentBranchId ? "git-fork" : "route"}"></i></span>
        <span class="branch-copy">
          <strong>${escapeHtml(branch.name)}</strong>
          <small>${branch.turnCount === 0 ? "序章" : `${branch.turnCount} 个回合`}</small>
        </span>
        <span class="branch-chevron"><i data-lucide="chevron-right"></i></span>
      </button>`;
    })
    .join("");
}

function renderTimeline() {
  elements.storyTimeline.innerHTML = story.events
    .map((event) => {
      const isOpening = event.turn === 0;
      return `<article class="story-entry" data-event-id="${escapeHtml(event.id)}">
        ${isOpening ? "" : `<div class="player-action"><i data-lucide="circle-user-round"></i><span>${escapeHtml(event.action)}</span></div>`}
        <div class="entry-meta">
          <span>${isOpening ? "序章" : `回合 ${event.turn}`}</span>
          <button class="branch-from-button" type="button" data-branch-event-id="${escapeHtml(event.id)}" aria-label="从这里创建分支" title="从这里创建分支">
            <i data-lucide="git-branch-plus"></i>
          </button>
        </div>
        <p class="story-prose">${escapeHtml(event.prose)}</p>
      </article>`;
    })
    .join("");
}

function renderChoices() {
  const head = story.events.at(-1);
  const choices = head?.choices ?? [];
  elements.choicesSection.hidden = choices.length === 0 || generating;
  elements.choiceList.innerHTML = choices
    .map(
      (choice, index) => `<button class="choice-button" type="button" data-choice-id="${escapeHtml(choice.id)}">
        <span class="choice-number">${index + 1}</span>
        <span class="choice-label">${escapeHtml(choice.label)}</span>
        <i data-lucide="arrow-up-right"></i>
      </button>`,
    )
    .join("");
}

function renderState() {
  elements.stateLocation.textContent = story.state.location?.name ?? "未知";
  elements.stateTime.textContent = story.state.time;
  elements.characterCount.textContent = story.state.characters.length;
  elements.characterList.innerHTML = story.state.characters
    .map((character) => {
      const relation = relationLabel(character.attitude);
      return `<div class="character-item">
        <span class="character-avatar">${escapeHtml(character.name.slice(0, 1))}</span>
        <span class="character-copy">
          <strong>${escapeHtml(character.name)}</strong>
          <small>${escapeHtml(character.role)} · ${escapeHtml(character.status === "missing" ? "失踪" : character.location)}</small>
        </span>
        <span class="attitude ${relation.className}">${relation.label}</span>
      </div>`;
    })
    .join("");

  elements.inventoryList.innerHTML = story.state.inventory.length
    ? story.state.inventory
        .map((item) => `<span class="item-tag">${escapeHtml(item.name)}${item.count > 1 ? `<b>×${item.count}</b>` : ""}</span>`)
        .join("")
    : '<p class="empty-state">暂时没有随身物品</p>';

  elements.clueList.innerHTML = story.state.knownFacts.length
    ? story.state.knownFacts.map((fact) => `<div class="clue-item">${escapeHtml(fact.text)}</div>`).join("")
    : '<p class="empty-state">还没有确认的线索</p>';

  elements.threadList.innerHTML = story.state.threads
    .map((thread) => `<div class="thread-item ${escapeHtml(thread.status)}">${escapeHtml(thread.title)}</div>`)
    .join("");
}

function render() {
  if (!story) return;
  const turn = story.events.length - 1;
  elements.storySubtitle.textContent = story.story.subtitle;
  elements.storyTitle.textContent = story.story.title;
  elements.sceneTitle.textContent = story.story.title;
  elements.sceneEyebrow.textContent = story.story.subtitle.split("·")[1]?.trim() ?? "第一幕";
  elements.storyLocation.textContent = `${story.state.location?.name ?? "未知地点"} · ${story.state.time}`;
  elements.turnCounter.textContent = turn === 0 ? "序章" : `第 ${turn} 回合`;
  renderRuntimeStatus();
  renderBranches();
  renderTimeline();
  renderChoices();
  renderState();
  elements.actionInput.disabled = generating;
  elements.sendAction.disabled = generating;
  elements.sendAction.hidden = generating;
  elements.stopAction.hidden = !generating;
  refreshIcons();
}

function appendPendingEntry(action) {
  const entry = document.createElement("article");
  entry.className = "story-entry pending";
  entry.innerHTML = `<div class="player-action"><i data-lucide="circle-user-round"></i><span>${escapeHtml(action)}</span></div>
    <div class="entry-meta"><span>正在生成</span></div>
    <p class="story-prose"></p>`;
  elements.storyTimeline.append(entry);
  elements.choicesSection.hidden = true;
  refreshIcons();
  return entry.querySelector(".story-prose");
}

async function submitAction(action) {
  const normalized = action.trim();
  if (!normalized || generating) return;
  generating = true;
  render();
  const pendingProse = appendPendingEntry(normalized);
  elements.actionInput.value = "";
  updateComposer();
  elements.storyScroll.scrollTo({ top: elements.storyScroll.scrollHeight, behavior: "smooth" });

  try {
    const response = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: normalized, branchId: story.currentBranchId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "生成失败");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedComplete = false;

    const processLine = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === "delta") {
        pendingProse.textContent += event.text;
        elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
      } else if (event.type === "complete") {
        story = event.story;
        receivedComplete = true;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
      if (done) break;
    }
    if (buffer) processLine(buffer);
    if (!receivedComplete) throw new Error("没有收到完整故事结果");
    showToast("本回合已保存");
  } catch (error) {
    showToast(error.message || "本回合生成失败", "error");
  } finally {
    generating = false;
    render();
    elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
    elements.actionInput.focus();
  }
}

function updateComposer() {
  const length = elements.actionInput.value.length;
  elements.composerCount.textContent = `${length} / 300`;
  elements.actionInput.style.height = "auto";
  elements.actionInput.style.height = `${Math.min(elements.actionInput.scrollHeight, 126)}px`;
}

elements.actionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAction(elements.actionInput.value);
});

elements.actionInput.addEventListener("input", updateComposer);
elements.actionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submitAction(elements.actionInput.value);
  }
});

elements.choiceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-choice-id]");
  if (!button || !story) return;
  const choice = story.events.at(-1)?.choices.find((item) => item.id === button.dataset.choiceId);
  if (choice) submitAction(choice.action);
});

elements.branchList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-branch-id]");
  if (!button || button.dataset.branchId === story.currentBranchId || generating) return;
  try {
    const result = await requestJson("/api/branches/select", {
      method: "POST",
      body: JSON.stringify({ branchId: button.dataset.branchId }),
    });
    story = result.story;
    closePanels();
    render();
    elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.storyTimeline.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-branch-event-id]");
  if (!button || generating) return;
  const source = story.events.find((item) => item.id === button.dataset.branchEventId);
  if (!source) return;
  const name = window.prompt("给新分支取一个名字", `从第 ${source.turn} 回合开始`);
  if (name === null) return;
  try {
    const result = await requestJson("/api/branches", {
      method: "POST",
      body: JSON.stringify({ eventId: source.id, name }),
    });
    story = result.story;
    render();
    showToast("新分支已创建");
    elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.stopAction.addEventListener("click", async () => {
  try {
    await requestJson("/api/cancel", { method: "POST", body: "{}" });
    showToast("正在停止生成");
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.resetStory.addEventListener("click", async () => {
  if (generating || !window.confirm("重置后会回到雨夜旅店的开场。确定继续吗？")) return;
  try {
    const result = await requestJson("/api/reset", { method: "POST", body: "{}" });
    story = result.story;
    render();
    elements.storyScroll.scrollTop = 0;
    showToast("故事已重置");
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.branchToggle.addEventListener("click", () => openPanel("branch"));
elements.stateToggle.addEventListener("click", () => openPanel("state"));
elements.panelScrim.addEventListener("click", closePanels);
document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", closePanels));
mobilePanels.addEventListener("change", closePanels);

async function initialize() {
  refreshIcons();
  syncPanelAccessibility();
  try {
    story = await requestJson("/api/story");
    render();
    if (story.events.length > 1) {
      requestAnimationFrame(() => {
        elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
      });
    }
  } catch (error) {
    showToast(error.message || "无法载入故事", "error");
    elements.storyTimeline.innerHTML = '<p class="empty-state">故事暂时无法载入。</p>';
  }
}

initialize();
