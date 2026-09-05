const elements = {
  actionForm: document.querySelector("#action-form"),
  actionInput: document.querySelector("#action-input"),
  appShell: document.querySelector("#app-shell"),
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
  immersiveOnboarding: document.querySelector("#immersive-onboarding"),
  onboarding: document.querySelector("#onboarding"),
  onboardingBody: document.querySelector("#onboarding-body"),
  onboardingDots: document.querySelector("#onboarding-dots"),
  onboardingImage: document.querySelector("#onboarding-image"),
  onboardingKicker: document.querySelector("#onboarding-kicker"),
  onboardingNext: document.querySelector("#onboarding-next"),
  onboardingNextLabel: document.querySelector("#onboarding-next-label"),
  onboardingPrevious: document.querySelector("#onboarding-previous"),
  onboardingProgressLabel: document.querySelector("#onboarding-progress-label"),
  onboardingReplay: document.querySelector("#onboarding-replay"),
  onboardingSkip: document.querySelector("#onboarding-skip"),
  onboardingStage: document.querySelector("#onboarding-stage"),
  onboardingStoryTitle: document.querySelector("#onboarding-story-title"),
  onboardingTitle: document.querySelector("#onboarding-title"),
  panelScrim: document.querySelector("#panel-scrim"),
  resetStory: document.querySelector("#reset-story"),
  sceneEyebrow: document.querySelector("#scene-eyebrow"),
  sceneImage: document.querySelector("#scene-image"),
  sceneTitle: document.querySelector("#scene-title"),
  sceneVisual: document.querySelector("#scene-visual"),
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
let selectingRole = false;
let toastTimer = null;
let onboardingIndex = 0;
let replayingOnboarding = false;
let activeTurnId = null;
let activeTurnSeq = 0;
let turnPrepared = false;
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
    elements.toast.textContent = "";
  }, 3200);
}

function onboardingStorageKey() {
  if (!story?.story?.onboarding) return null;
  return `ai-novel:onboarding:${story.story.id}:v${story.story.onboarding.version}`;
}

function hasSeenOnboarding() {
  const key = onboardingStorageKey();
  if (!key) return true;
  try {
    return window.localStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}

function setOnboardingSeen(seen) {
  const key = onboardingStorageKey();
  if (!key) return;
  try {
    if (seen) window.localStorage.setItem(key, "seen");
    else window.localStorage.removeItem(key);
  } catch {
    // Private browsing can deny storage; the story remains usable for this visit.
  }
}

function usesRoleOnboarding() {
  return story?.story?.onboarding?.mode === "comic-role-select";
}

function needsRoleSelection() {
  return Boolean(story?.story?.roleSelection?.required && !story.story.roleSelection.selectedCharacterId);
}

function immersiveSteps() {
  const onboarding = story?.story?.onboarding;
  if (onboarding?.mode !== "comic-role-select") return [];
  return [
    { type: "background", data: onboarding.background },
    ...onboarding.comicPages.map((page) => ({ type: "comic", data: page })),
    ...onboarding.characterProfiles.map((profile) => ({ type: "character", data: profile })),
    { type: "npcs", data: onboarding.npcProfiles },
    { type: "roles", data: onboarding.roleSelection },
  ];
}

function animateOnboardingStage(stage) {
  stage.classList.remove("slide-visible");
  requestAnimationFrame(() => stage.classList.add("slide-visible"));
}

function renderSlideOnboarding() {
  const slides = story?.story?.onboarding?.slides ?? [];
  if (!slides.length) return;
  onboardingIndex = Math.max(0, Math.min(onboardingIndex, slides.length - 1));
  const slide = slides[onboardingIndex];
  const isLast = onboardingIndex === slides.length - 1;

  elements.onboardingStoryTitle.textContent = story.story.title;
  elements.onboardingProgressLabel.textContent = `${onboardingIndex + 1} / ${slides.length}`;
  elements.onboardingKicker.textContent = slide.kicker;
  elements.onboardingTitle.textContent = slide.title;
  elements.onboardingBody.textContent = slide.body;
  elements.onboardingImage.src = slide.image.src;
  elements.onboardingImage.alt = slide.image.alt;
  elements.onboardingImage.style.objectPosition = slide.image.position ?? "center";
  elements.onboardingStage.dataset.kind = slide.kind;
  elements.onboardingStage.hidden = false;
  elements.immersiveOnboarding.hidden = true;
  elements.onboardingNext.hidden = false;
  elements.onboardingPrevious.disabled = onboardingIndex === 0;
  elements.onboardingNextLabel.textContent = isLast ? "进入故事" : "继续";
  elements.onboardingSkip.textContent = replayingOnboarding ? "返回剧情" : "跳过前情";
  elements.onboardingDots.innerHTML = slides
    .map(
      (item, index) => `<button type="button" data-onboarding-index="${index}" aria-label="第 ${index + 1} 页：${escapeHtml(item.title)}" ${index === onboardingIndex ? 'aria-current="step"' : ""}></button>`,
    )
    .join("");

  animateOnboardingStage(elements.onboardingStage);
  const nextSlide = slides[onboardingIndex + 1];
  if (nextSlide) new Image().src = nextSlide.image.src;
  refreshIcons();
}

function renderImmersiveOnboarding() {
  const steps = immersiveSteps();
  if (!steps.length) return;
  onboardingIndex = Math.max(0, Math.min(onboardingIndex, steps.length - 1));
  const step = steps[onboardingIndex];
  const comicCount = story.story.onboarding.comicPages.length;
  const profileCount = story.story.onboarding.characterProfiles.length;
  const selectedId = story.story.roleSelection?.selectedCharacterId;

  elements.onboardingStage.hidden = true;
  elements.immersiveOnboarding.hidden = false;
  elements.onboardingStoryTitle.textContent = story.story.title;
  elements.onboardingPrevious.disabled = onboardingIndex === 0 || selectingRole;
  elements.onboardingNext.hidden = step.type === "roles";
  elements.onboardingNext.disabled = selectingRole;
  elements.onboardingNextLabel.textContent = "继续";
  elements.onboardingSkip.textContent = needsRoleSelection()
    ? step.type === "roles" ? "必须选择角色" : "跳到选角"
    : replayingOnboarding ? "返回剧情" : "进入故事";
  elements.onboardingSkip.disabled = selectingRole || (needsRoleSelection() && step.type === "roles");

  if (step.type === "background") {
    elements.onboardingProgressLabel.textContent = "故事背景";
    elements.immersiveOnboarding.innerHTML = `<section class="background-intro">
      <span>STORY SO FAR</span>
      <h1>${escapeHtml(step.data.title)}</h1>
      <div>${escapeHtml(step.data.body).split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}</div>
    </section>`;
  } else if (step.type === "comic") {
    const pageIndex = steps.slice(0, onboardingIndex + 1).filter((item) => item.type === "comic").length;
    elements.onboardingProgressLabel.textContent = `漫画 ${pageIndex} / ${comicCount}`;
    elements.immersiveOnboarding.innerHTML = `<figure class="comic-page">
      <div class="comic-page-art"><img src="${escapeHtml(step.data.image.src)}" alt="${escapeHtml(step.data.image.alt)}" /></div>
      <figcaption>
        <span>第 ${String(pageIndex).padStart(2, "0")} 页</span>
        <strong>${escapeHtml(step.data.title)}</strong>
        ${step.data.caption ? `<p>${escapeHtml(step.data.caption)}</p>` : ""}
        ${step.data.panels?.length ? `<ol class="comic-script">
          ${step.data.panels.map((panel, panelIndex) => `<li>
            <small>格 ${panelIndex + 1} · ${escapeHtml(panel.scene)}</small>
            ${panel.lines.map((line) => `<p><b>${escapeHtml(line.speaker)}</b>${escapeHtml(line.text)}</p>`).join("")}
          </li>`).join("")}
        </ol>` : ""}
      </figcaption>
    </figure>`;
  } else if (step.type === "character") {
    const profileIndex = steps.slice(0, onboardingIndex + 1).filter((item) => item.type === "character").length;
    elements.onboardingProgressLabel.textContent = `人物 ${profileIndex} / ${profileCount}`;
    elements.immersiveOnboarding.innerHTML = `<section class="character-intro">
      <figure><img src="${escapeHtml(step.data.image.src)}" alt="${escapeHtml(step.data.image.alt)}" /></figure>
      <article>
        <span class="character-intro-index">人物 ${String(profileIndex).padStart(2, "0")}</span>
        <h1>${escapeHtml(step.data.name)}</h1>
        <strong>${escapeHtml(step.data.role)}</strong>
        <p class="character-tagline">${escapeHtml(step.data.tagline)}</p>
        <p>${escapeHtml(step.data.publicSummary)}</p>
        <div class="character-traits">${step.data.traits.map((trait) => `<span>${escapeHtml(trait)}</span>`).join("")}</div>
      </article>
    </section>`;
  } else if (step.type === "npcs") {
    elements.onboardingProgressLabel.textContent = `其他人物 ${step.data.length} 位`;
    elements.immersiveOnboarding.innerHTML = `<section class="npc-intro">
      <header><span>故事中的其他人</span><h1>他们也会推动故事</h1><p>这些人物不能选择扮演；这里只展示你在开场时有理由知道的部分。</p></header>
      <div class="npc-grid">${step.data.map((profile) => `<article class="npc-card">
        <span>${escapeHtml(profile.role)}</span>
        <h2>${escapeHtml(profile.name)}</h2>
        <p>${escapeHtml(profile.publicSummary)}</p>
        <div class="character-traits">${profile.traits.map((trait) => `<span>${escapeHtml(trait)}</span>`).join("")}</div>
      </article>`).join("")}</div>
    </section>`;
  } else {
    const profiles = new Map(story.story.onboarding.characterProfiles.map((profile) => [profile.id, profile]));
    elements.onboardingProgressLabel.textContent = selectedId ? "已选角色" : "选择角色";
    elements.immersiveOnboarding.innerHTML = `<section class="role-selection">
      <header>
        <span>系统推荐角色</span>
        <h1>${escapeHtml(step.data.title)}</h1>
        <p>${escapeHtml(step.data.body)}</p>
      </header>
      <div class="role-grid">
        ${step.data.roles.map((role) => {
          const profile = profiles.get(role.characterId);
          const selected = selectedId === role.characterId;
          return `<article class="role-card${selected ? " selected" : ""}">
            <figure><img src="${escapeHtml(role.image.src)}" alt="${escapeHtml(role.image.alt)}" /></figure>
            <div class="role-card-body">
              <div class="role-card-heading"><span>${escapeHtml(profile.role)}</span>${selected ? "<b>当前身份</b>" : ""}</div>
              <h2>${escapeHtml(profile.name)}</h2>
              <p>${escapeHtml(role.hook)}</p>
              <div class="role-strengths">${role.strengths.map((strength) => `<span>${escapeHtml(strength)}</span>`).join("")}</div>
              <small>${escapeHtml(role.pressure)}</small>
              <button type="button" data-role-id="${escapeHtml(role.characterId)}" ${selectingRole || (!story.story.roleSelection.canSelect && !selected) ? "disabled" : ""}>
                ${selectingRole ? "正在进入…" : selected ? "以这个身份继续" : `扮演${escapeHtml(profile.name)}`}
                <i data-lucide="arrow-right"></i>
              </button>
            </div>
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }

  elements.onboardingDots.innerHTML = steps
    .map((item, index) => `<button type="button" data-onboarding-index="${index}" aria-label="${item.type === "background" ? "故事背景" : item.type === "comic" ? "漫画" : item.type === "character" ? "人物" : item.type === "npcs" ? "其他人物" : "选角"}第 ${index + 1} 页" ${index === onboardingIndex ? 'aria-current="step"' : ""}></button>`)
    .join("");
  elements.immersiveOnboarding.scrollTop = 0;
  animateOnboardingStage(elements.immersiveOnboarding);
  const nextStep = steps[onboardingIndex + 1];
  if (nextStep?.data?.image?.src) new Image().src = nextStep.data.image.src;
  refreshIcons();
}

function renderOnboarding() {
  if (usesRoleOnboarding()) renderImmersiveOnboarding();
  else renderSlideOnboarding();
}

function openOnboarding({ replay = false } = {}) {
  const onboarding = story?.story?.onboarding;
  if (!onboarding || (!onboarding.slides?.length && !immersiveSteps().length)) {
    openStory();
    return;
  }
  closePanels();
  replayingOnboarding = replay;
  onboardingIndex = 0;
  elements.appShell.hidden = true;
  elements.onboarding.hidden = false;
  document.title = `${story.story.title} · 故事前情`;
  renderOnboarding();
}

function openStory() {
  if (!story) return;
  if (needsRoleSelection()) {
    openOnboarding();
    return;
  }
  replayingOnboarding = false;
  elements.onboarding.hidden = true;
  elements.appShell.hidden = false;
  document.title = `${story.story.title} · AI novel`;
  render();
  requestAnimationFrame(() => {
    elements.storyScroll.scrollTop = story.events.length > 1 ? elements.storyScroll.scrollHeight : 0;
  });
}

function finishOnboarding() {
  if (needsRoleSelection()) {
    onboardingIndex = immersiveSteps().length - 1;
    renderOnboarding();
    return;
  }
  setOnboardingSeen(true);
  openStory();
}

function moveOnboarding(direction) {
  const steps = usesRoleOnboarding() ? immersiveSteps() : (story?.story?.onboarding?.slides ?? []);
  if (!steps.length || selectingRole) return;
  if (direction > 0 && onboardingIndex === steps.length - 1) {
    finishOnboarding();
    return;
  }
  onboardingIndex = Math.max(0, Math.min(onboardingIndex + direction, steps.length - 1));
  renderOnboarding();
}

async function selectRole(characterId) {
  if (selectingRole || !story?.story?.roleSelection?.canSelect) {
    if (story?.story?.roleSelection?.selectedCharacterId === characterId) finishOnboarding();
    return;
  }
  selectingRole = true;
  renderOnboarding();
  try {
    const result = await requestJson("/api/roles/select", {
      method: "POST",
      body: JSON.stringify({ characterId }),
    });
    story = result.story;
    setOnboardingSeen(true);
    openStory();
    showToast(`已选择${story.story.player.name}`);
  } catch (error) {
    showToast(error.message || "无法选择这个角色", "error");
  } finally {
    selectingRole = false;
    if (!elements.onboarding.hidden) renderOnboarding();
  }
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

function characterStatus(character) {
  if (character.present) return "在场";
  const labels = {
    departed: "已离开",
    injured: "受伤",
    missing: "失踪",
  };
  return labels[character.status] ?? "不在场";
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
  const segments = story.events.map((event) => {
    const isLatestTurn = event.isHead && event.type !== "opening";
    return `<span class="story-segment-boundary" data-event-id="${escapeHtml(event.id)}"><button class="branch-from-button segment-branch-button" type="button" data-branch-event-id="${escapeHtml(event.id)}" aria-label="从第 ${event.turn} 回合创建分支" title="从这里创建分支"><i data-lucide="git-branch-plus"></i></button><span class="story-segment${isLatestTurn ? " latest-generated" : ""}">${escapeHtml(event.prose)}</span></span>`;
  }).join("");
  elements.storyTimeline.innerHTML = `<article class="story-entry continuous-entry">
    <div class="entry-meta"><span>序章</span></div>
    <p class="story-prose">${segments}</p>
  </article>`;
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
  elements.characterList.innerHTML = story.state.characters.length
    ? story.state.characters
        .map((character) => {
          const relation = relationLabel(character.attitude);
          return `<div class="character-item">
            <span class="character-avatar">${escapeHtml(character.name.slice(0, 1))}</span>
            <span class="character-copy">
              <strong>${escapeHtml(character.name)}</strong>
              <small>${escapeHtml(character.role)} · ${escapeHtml(characterStatus(character))}</small>
            </span>
            <span class="attitude ${relation.className}">${relation.label}</span>
          </div>`;
        })
        .join("")
    : '<p class="empty-state">还没有认识重要人物</p>';

  elements.inventoryList.innerHTML = story.state.inventory.length
    ? story.state.inventory
        .map((item) => `<span class="item-tag">${escapeHtml(item.name)}${item.count > 1 ? `<b>×${item.count}</b>` : ""}</span>`)
        .join("")
    : '<p class="empty-state">暂时没有随身物品</p>';

  elements.clueList.innerHTML = story.state.knownFacts.length
    ? story.state.knownFacts.map((fact) => `<div class="clue-item">${escapeHtml(fact.text)}</div>`).join("")
    : '<p class="empty-state">还没有确认的线索</p>';

  elements.threadList.innerHTML = story.state.threads.length
    ? story.state.threads
        .map((thread) => `<div class="thread-item ${escapeHtml(thread.status)}">${escapeHtml(thread.title)}</div>`)
        .join("")
    : '<p class="empty-state">暂时没有已知问题</p>';
}

function renderScene(scene = story?.state?.scene) {
  elements.sceneVisual.hidden = !scene?.image?.src;
  if (!scene?.image?.src) return;
  if (elements.sceneImage.src !== new URL(scene.image.src, window.location.href).href) {
    elements.sceneImage.classList.add("changing");
    elements.sceneImage.src = scene.image.src;
  }
  elements.sceneImage.alt = scene.image.alt ?? scene.title;
  elements.sceneImage.onerror = () => {
    if (scene.fallbackImage && !elements.sceneImage.src.endsWith(scene.fallbackImage)) elements.sceneImage.src = scene.fallbackImage;
  };
  elements.sceneImage.onload = () => elements.sceneImage.classList.remove("changing");
  elements.sceneTitle.textContent = scene.title ?? story.story.title;
  elements.sceneEyebrow.textContent = scene.locationName ?? story.state.location?.name ?? "当前场景";
}

function render() {
  if (!story) return;
  const turn = story.events.length - 1;
  elements.storySubtitle.textContent = story.story.subtitle;
  document.title = `${story.story.title} · AI novel`;
  elements.storyTitle.textContent = story.story.title;
  renderScene();
  elements.storyLocation.textContent = `${story.state.location?.name ?? "未知地点"} · ${story.state.time}`;
  elements.turnCounter.textContent = turn === 0 ? "序章" : `第 ${turn} 回合`;
  renderBranches();
  renderTimeline();
  renderChoices();
  renderState();
  elements.actionInput.disabled = generating;
  elements.sendAction.disabled = generating;
  elements.sendAction.hidden = generating;
  elements.stopAction.hidden = !generating || turnPrepared;
  refreshIcons();
}

function appendPendingSegment() {
  const prose = elements.storyTimeline.querySelector(".story-prose");
  if (!prose) return null;
  prose.querySelector(".latest-generated")?.classList.remove("latest-generated");

  const boundary = document.createElement("span");
  boundary.className = "story-segment-boundary live-turn";
  const pendingProse = document.createElement("span");
  pendingProse.className = "story-segment latest-generated streaming-segment";
  const marker = document.createElement("span");
  marker.className = "generation-marker";
  marker.setAttribute("role", "status");
  marker.setAttribute("aria-label", "正在生成下一段正文");
  marker.innerHTML = "<span>生成中</span>";
  boundary.append(pendingProse, marker);
  prose.append(boundary);
  elements.choicesSection.hidden = true;
  return pendingProse;
}

async function submitAction(action, { choiceId = null } = {}) {
  const normalized = action.trim();
  if (!normalized || generating) return;
  const trustedChoice = Boolean(choiceId);
  generating = true;
  turnPrepared = false;
  activeTurnSeq = 0;
  render();
  const pendingProse = appendPendingSegment();
  elements.actionInput.value = "";
  updateComposer();
  elements.storyScroll.scrollTo({ top: elements.storyScroll.scrollHeight, behavior: "smooth" });

  let streamPaused = false;
  try {
    const response = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        choiceId
          ? { choiceId, branchId: story.currentBranchId }
          : { action: normalized, branchId: story.currentBranchId },
      ),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "生成失败");
    }

    const result = await followTurnStream(response, { pendingProse, trustedChoice });
    if (result.complete) showToast("本回合已保存");
    if (result.recoverable) {
      streamPaused = true;
      showToast("连接暂时中断，刷新后会从最后一句继续", "error");
      return;
    }
  } catch (error) {
    showToast(error.message || "本回合生成失败", "error");
  } finally {
    if (streamPaused) return;
    generating = false;
    activeTurnId = null;
    turnPrepared = false;
    render();
    elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
    elements.actionInput.focus();
  }
}

const phaseLabels = {
  analyzing: "情节、人物和环境正在并行分析…",
  synthesizing: "正在合并因果与连续性…",
  narrating: "回合已锁定，正在写最终正文…",
  recovering: "正在从最后一个完整句继续…",
  committing: "正文完成，正在原子保存…",
};

async function readTurnResponse(response, state) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) processTurnEvent(JSON.parse(line), state);
    if (done) break;
  }
  if (buffer.trim()) processTurnEvent(JSON.parse(buffer), state);
}

function processTurnEvent(event, state) {
  activeTurnId = event.turnId ?? activeTurnId;
  activeTurnSeq = Math.max(activeTurnSeq, event.seq ?? 0);
  if (event.type === "start") {
    state.trustedChoice = event.trustedChoice;
    if (!state.pendingProse) state.pendingProse = appendPendingSegment();
    return;
  }
  if (event.type === "phase") {
    const marker = state.pendingProse?.nextElementSibling;
    const label = phaseLabels[event.phase] ?? "正在处理本回合…";
    if (marker?.classList.contains("generation-marker")) {
      marker.title = label;
      marker.setAttribute("aria-label", label);
    }
    return;
  }
  if (event.type === "prepared") {
    turnPrepared = true;
    elements.stopAction.hidden = true;
    return;
  }
  if (event.type === "scene") {
    story.state.scene = event.scene;
    renderScene(event.scene);
    return;
  }
  if (event.type === "prose_delta") {
    if (!state.pendingProse) return;
    if (!state.hasProse) {
      state.pendingProse.classList.add("has-prose");
      state.hasProse = true;
    }
    state.pendingProse.textContent += event.text;
    elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
    return;
  }
  if (event.type === "complete") {
    story = event.story;
    state.complete = true;
    return;
  }
  if (event.type === "rejected") {
    state.terminal = true;
    showToast(event.message || "这个行动不能执行", "error");
    return;
  }
  if (event.type === "cancelled") {
    state.terminal = true;
    showToast(event.message || "已停止生成");
    return;
  }
  if (event.type === "failed") throw new Error(event.message || "本回合生成失败");
  if (event.type === "error" && event.recoverable) state.recoverable = true;
}

async function followTurnStream(initialResponse, initialState = {}) {
  const state = { pendingProse: null, trustedChoice: false, hasProse: false, complete: false, terminal: false, recoverable: false, ...initialState };
  let response = initialResponse;
  while (!state.complete && !state.terminal && !state.recoverable) {
    await readTurnResponse(response, state);
    if (state.complete || state.terminal || state.recoverable) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
    response = await fetch(`/api/turns/${encodeURIComponent(activeTurnId)}/stream?afterSeq=${activeTurnSeq}`);
    if (!response.ok) throw new Error("无法恢复回合流");
  }
  return state;
}

async function resumeActiveTurn(active) {
  if (!active || generating) return;
  generating = true;
  turnPrepared = ["prepared", "recovering", "paused"].includes(active.status);
  activeTurnId = active.turnId;
  activeTurnSeq = 0;
  render();
  let streamPaused = false;
  try {
    const response = await fetch(`/api/turns/${encodeURIComponent(active.turnId)}/stream?afterSeq=0`);
    if (!response.ok) throw new Error("无法恢复正在生成的回合");
    const result = await followTurnStream(response);
    streamPaused = result.recoverable;
    if (streamPaused) showToast("模型连接仍未恢复，已保留现有正文", "error");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (streamPaused) return;
    generating = false;
    activeTurnId = null;
    turnPrepared = false;
    story = await requestJson("/api/story");
    render();
    elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
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
  if (choice) submitAction(choice.action, { choiceId: choice.id });
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
    if (!activeTurnId) return;
    await requestJson(`/api/turns/${encodeURIComponent(activeTurnId)}/cancel`, { method: "POST", body: "{}" });
    showToast("正在停止生成");
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.resetStory.addEventListener("click", async () => {
  if (generating || !window.confirm(`重置后会回到《${story.story.title}》的开场。确定继续吗？`)) return;
  try {
    const result = await requestJson("/api/reset", { method: "POST", body: "{}" });
    story = result.story;
    setOnboardingSeen(false);
    openOnboarding();
    showToast("故事已重置");
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.onboardingReplay.addEventListener("click", () => openOnboarding({ replay: true }));
elements.onboardingSkip.addEventListener("click", finishOnboarding);
elements.onboardingPrevious.addEventListener("click", () => moveOnboarding(-1));
elements.onboardingNext.addEventListener("click", () => moveOnboarding(1));
elements.onboardingDots.addEventListener("click", (event) => {
  const button = event.target.closest("[data-onboarding-index]");
  if (!button) return;
  onboardingIndex = Number(button.dataset.onboardingIndex);
  renderOnboarding();
});
elements.immersiveOnboarding.addEventListener("click", (event) => {
  const button = event.target.closest("[data-role-id]");
  if (button) selectRole(button.dataset.roleId);
});

document.addEventListener("keydown", (event) => {
  if (elements.onboarding.hidden) return;
  if (event.key === "ArrowLeft") moveOnboarding(-1);
  if (event.key === "ArrowRight" || (event.key === "Enter" && onboardingIndex !== immersiveSteps().length - 1)) {
    moveOnboarding(1);
  }
  if (event.key === "Escape" && !needsRoleSelection()) finishOnboarding();
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
    if (hasSeenOnboarding() && !needsRoleSelection()) openStory();
    else openOnboarding();
    const active = await requestJson("/api/turns/active");
    if (active && !needsRoleSelection()) await resumeActiveTurn(active);
  } catch (error) {
    showToast(error.message || "无法载入《龙族》", "error");
  }
}

initialize();
