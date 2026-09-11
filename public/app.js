const elements = {
  actionForm: document.querySelector("#action-form"),
  actionInput: document.querySelector("#action-input"),
  appShell: document.querySelector("#app-shell"),
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
  roleDock: document.querySelector("#role-dock"),
  relationshipList: document.querySelector("#relationship-list"),
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
let rolePreviewId = null;
let panelReturnFocus = null;
let activeAtEntry = null;
let followLatest = true;
let entered = false;
const entranceImage = "/assets/tokyo-departure.png";
const roleLocations = { "lu-mingfei": "theme-hotel", erii: "theme-hotel", "gen-chisei": "genji-command", caesar: "cassell-safehouse" };
const sceneMoods = { "tokyo-street": "rain", rendezvous: "rain", "red-well": "danger", "theme-hotel": "quiet", "sky-observatory": "quiet", "genji-command": "tension", "cassell-safehouse": "quiet" };

function setWorld(src, locationId = "tokyo-street") {
  window.novelAtmosphere?.setScene({ src, mood: sceneMoods[locationId] ?? "quiet" });
}

function updateGateway() {
  const player = story?.story.player;
  document.querySelector("#gateway-enter-label").textContent = story?.state.status === "ended" ? "重温故事" : player ? "继续旅程" : "启程";
  document.querySelector("#gateway-save").textContent = player
    ? `${player.name} · ${story.state.location?.name ?? "东京"} · ${story.events.length > 1 ? `第 ${story.events.length - 1} 回合` : "序章"}`
    : "东京的天亮之前，还有一次选择。";
  for (const id of ["gateway-enter", "gateway-prelude", "gateway-chapter", "gateway-cast"]) document.getElementById(id).disabled = !story;
}

function showGateway() {
  closePanels();
  document.body.dataset.view = "gateway";
  document.body.classList.remove("scene-only");
  elements.onboarding.hidden = true;
  elements.appShell.hidden = true;
  document.querySelector("#gateway").hidden = false;
  document.title = "龙族 · 东京出走";
  setWorld(entranceImage);
  updateGateway();
  document.querySelector("#gateway-enter").focus({ preventScroll: true });
}

function enterStory({ prelude = false } = {}) {
  if (!story) { initialize(); return; }
  entered = true;
  document.querySelector("#gateway").hidden = true;
  if (prelude) openOnboarding({ replay: Boolean(story.story.player) });
  else if (needsRoleSelection()) openOnboarding({ startAtRoles: true });
  else openStory();
}

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
  elements.onboarding.dataset.step = step.type;

  elements.onboardingStage.hidden = true;
  elements.immersiveOnboarding.hidden = false;
  elements.onboardingStoryTitle.textContent = story.story.title;
  elements.onboardingPrevious.disabled = onboardingIndex === 0 || selectingRole;
  elements.onboardingNext.hidden = step.type === "roles";
  elements.onboardingNext.disabled = selectingRole;
  elements.onboardingNextLabel.textContent = "继续";
  elements.onboardingSkip.textContent = needsRoleSelection()
    ? step.type === "roles" ? "选择你的身份" : "进入选角"
    : "返回故事";
  elements.onboardingSkip.disabled = selectingRole || (needsRoleSelection() && step.type === "roles");

  if (step.type === "background") {
    setWorld(entranceImage);
    elements.onboardingProgressLabel.textContent = "故事背景";
    elements.immersiveOnboarding.innerHTML = `<section class="background-intro">
      <span>STORY SO FAR</span>
      <h1>${escapeHtml(step.data.title)}</h1>
      <div>${escapeHtml(step.data.body).split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}</div>
    </section>`;
  } else if (step.type === "comic") {
    setWorld("/assets/scenes/dragon-raja/tokyo-street.png");
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
    setWorld(`/assets/scenes/dragon-raja/${roleLocations[step.data.id] ?? "theme-hotel"}.png`, roleLocations[step.data.id]);
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
    setWorld("/assets/scenes/dragon-raja/genji-command.png", "genji-command");
    elements.onboardingProgressLabel.textContent = `其他人物 ${step.data.length} 位`;
    elements.immersiveOnboarding.innerHTML = `<section class="npc-intro">
      <header><span>命运交汇之处</span><h1>东京的另一面</h1></header>
      <div class="npc-grid">${step.data.map((profile) => `<article class="npc-card">
        <span>${escapeHtml(profile.role)}</span>
        <h2>${escapeHtml(profile.name)}</h2>
        <p>${escapeHtml(profile.publicSummary)}</p>
        <div class="character-traits">${profile.traits.map((trait) => `<span>${escapeHtml(trait)}</span>`).join("")}</div>
      </article>`).join("")}</div>
    </section>`;
  } else {
    const profiles = new Map(story.story.onboarding.characterProfiles.map((profile) => [profile.id, profile]));
    const role = step.data.roles.find((item) => item.characterId === (rolePreviewId ?? selectedId)) ?? step.data.roles[0];
    rolePreviewId = role.characterId;
    const profile = profiles.get(role.characterId);
    const selected = selectedId === role.characterId;
    const locked = !story.story.roleSelection.canSelect && !selected;
    setWorld(`/assets/scenes/dragon-raja/${roleLocations[role.characterId] ?? "theme-hotel"}.png`, roleLocations[role.characterId]);
    elements.onboardingProgressLabel.textContent = "选择身份";
    const roleNumber = String(step.data.roles.indexOf(role) + 1).padStart(2, "0");
    const roleWords = { "lu-mingfei": "局外之人", erii: "想去外面", "gen-chisei": "身负其名", caesar: "由我决定" };
    elements.immersiveOnboarding.innerHTML = `<section class="role-selection" data-character="${escapeHtml(role.characterId)}" aria-label="选择你的身份">
      <article class="role-copy">
        <div class="role-file"><span>人物档案 / ${roleNumber}</span><span>${escapeHtml(profile.role)}</span></div>
        <span class="eyebrow"><span class="red-rule"></span>以谁的身份，走进这个夜晚</span>
        <h1>${escapeHtml(profile.name)}</h1>
        <p class="role-tagline">${escapeHtml(profile.tagline)}</p>
        <p class="role-hook">${escapeHtml(role.hook)}</p>
        <div class="character-traits">${role.strengths.map((strength) => `<span>${escapeHtml(strength)}</span>`).join("")}</div>
        <p class="role-pressure"><i data-lucide="hourglass"></i>${escapeHtml(role.pressure)}</p>
        <button class="primary-button" type="button" data-role-id="${escapeHtml(role.characterId)}" ${selectingRole || locked || generating ? "disabled" : ""}>${selectingRole ? "正在启程…" : locked ? `当前身份：${escapeHtml(story.story.player.name)}` : selected ? "继续这段旅程" : `成为${escapeHtml(profile.name)}`}<i data-lucide="arrow-right"></i></button>
      </article>
      <figure class="role-portrait"><span class="role-portrait-number" aria-hidden="true">${roleNumber}</span><img src="${escapeHtml(role.image.src)}" alt="${escapeHtml(role.image.alt)}" /><span class="role-portrait-word" aria-hidden="true">${roleWords[role.characterId] ?? "此刻入场"}</span></figure>
      <nav class="role-rail" aria-label="可扮演角色">${step.data.roles.map((item, index) => {
        const person = profiles.get(item.characterId);
        return `<button class="role-tab" type="button" data-role-preview="${escapeHtml(item.characterId)}" aria-pressed="${item.characterId === role.characterId}" ${selectingRole ? "disabled" : ""}><img src="${escapeHtml(item.image.src)}" alt="" /><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)}</small></span><span class="role-tab-number">0${index + 1}</span></button>`;
      }).join("")}</nav>
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
  const steps = immersiveSteps();
  const currentType = steps[onboardingIndex]?.type;
  document.querySelector("#onboarding-chapters").innerHTML = [
    { type: "background", label: "序幕" }, { type: "comic", label: "漫画" },
    { type: "character", label: "人物" }, { type: "roles", label: "入场" },
  ].map(({ type, label }) => {
    const index = steps.findIndex((step) => step.type === type);
    if (index < 0) return "";
    const active = currentType === type || (type === "character" && currentType === "npcs");
    return `<button type="button" data-onboarding-index="${index}" ${active ? 'aria-current="step"' : ""} ${selectingRole ? "disabled" : ""}>${label}</button>`;
  }).join("");
  syncRoleAction();
}

const mobileLayout = matchMedia("(max-width: 700px)");
function syncRoleAction() {
  if (elements.onboarding.dataset.step !== "roles") {
    elements.roleDock.replaceChildren();
    elements.roleDock.hidden = true;
    return;
  }
  // Keep one confirmation control; move it outside the scrolling dossier on phones.
  const action = elements.immersiveOnboarding.querySelector("[data-role-id]")
    ?? elements.roleDock.querySelector("[data-role-id]");
  if (!action) return;
  if (mobileLayout.matches) {
    elements.roleDock.replaceChildren(action);
    elements.roleDock.hidden = false;
  } else {
    elements.immersiveOnboarding.querySelector(".role-copy")?.append(action);
    elements.roleDock.replaceChildren();
    elements.roleDock.hidden = true;
  }
}
mobileLayout.addEventListener("change", syncRoleAction);

function openOnboarding({ replay = false, startAtRoles = false } = {}) {
  const onboarding = story?.story?.onboarding;
  if (!onboarding || (!onboarding.slides?.length && !immersiveSteps().length)) {
    openStory();
    return;
  }
  closePanels();
  replayingOnboarding = replay;
  onboardingIndex = startAtRoles ? immersiveSteps().length - 1 : 0;
  rolePreviewId = story.story.roleSelection?.selectedCharacterId ?? null;
  document.body.dataset.view = "onboarding";
  document.body.classList.remove("scene-only");
  document.querySelector("#gateway").hidden = true;
  elements.appShell.hidden = true;
  elements.onboarding.hidden = false;
  document.title = `${story.story.title} · 故事前情`;
  renderOnboarding();
  elements.onboardingSkip.focus({ preventScroll: true });
}

function openStory() {
  if (!story) return;
  if (needsRoleSelection()) {
    openOnboarding({ startAtRoles: true });
    return;
  }
  replayingOnboarding = false;
  document.body.dataset.view = "story";
  document.querySelector("#gateway").hidden = true;
  setSceneReveal(false);
  elements.onboarding.hidden = true;
  elements.appShell.hidden = false;
  document.title = `${story.story.title} · AI novel`;
  render();
  requestAnimationFrame(() => {
    followLatest = true;
    elements.storyScroll.scrollTop = story.events.length > 1 ? elements.storyScroll.scrollHeight : 0;
    elements.storyScroll.focus({ preventScroll: true });
  });
  if (activeAtEntry && !generating) {
    const active = activeAtEntry;
    activeAtEntry = null;
    resumeActiveTurn(active);
  }
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
  if (selectingRole) return;
  if (story?.story?.roleSelection?.selectedCharacterId === characterId) {
    finishOnboarding();
    return;
  }
  if (!story?.story?.roleSelection?.canSelect) return;
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
  const stateHidden = !document.body.classList.contains("state-open");
  elements.statePanel.inert = stateHidden;
  elements.statePanel.setAttribute("aria-hidden", String(stateHidden));
  elements.stateToggle.setAttribute("aria-expanded", String(!stateHidden));
  const panelOpen = !stateHidden;
  document.querySelector(".app-header").inert = panelOpen;
  document.querySelector(".scene-presence").inert = panelOpen;
  document.querySelector("#reading-panel").inert = panelOpen || document.body.classList.contains("scene-only");
}

function closePanels() {
  document.body.classList.remove("state-open");
  elements.panelScrim.hidden = true;
  syncPanelAccessibility();
  panelReturnFocus?.focus({ preventScroll: true });
  panelReturnFocus = null;
}

function openStatePanel() {
  const closing = document.body.classList.contains("state-open");
  const trigger = document.activeElement;
  closePanels();
  if (closing) return;
  panelReturnFocus = trigger;
  document.body.classList.add("state-open");
  elements.panelScrim.hidden = false;
  syncPanelAccessibility();
  elements.statePanel.querySelector("[data-close-panel]").focus({ preventScroll: true });
}

const proseCursors = new WeakMap();
const minimumParagraphLength = 140;

function appendProse(container, text) {
  const cursor = proseCursors.get(container) ?? { paragraph: null, length: 0, lineBreak: false };
  // Merge short source paragraphs in both saved and streaming prose, without moving displayed text.
  text.split(/(\r\n?|\n)/).forEach((part, index) => {
    if (index % 2) {
      cursor.lineBreak = true;
      return;
    }
    if (cursor.lineBreak) {
      part = part.trimStart();
      if (!part) return;
      if (cursor.length >= minimumParagraphLength) cursor.paragraph = null;
      cursor.lineBreak = false;
    }
    if (!cursor.paragraph) {
      part = part.trimStart();
      if (!part) return;
      cursor.paragraph = document.createElement("p");
      cursor.length = 0;
      container.append(cursor.paragraph);
    }
    if (cursor.paragraph.lastChild) cursor.paragraph.lastChild.appendData(part);
    else cursor.paragraph.append(document.createTextNode(part));
    cursor.length += part.length;
  });
  proseCursors.set(container, cursor);
}

function renderTimeline() {
  const segments = story.events.map((event) => {
    const isLatestTurn = event.isHead && event.type !== "opening";
    return `<div class="story-segment-boundary" data-event-id="${escapeHtml(event.id)}"><div class="story-segment${isLatestTurn ? " latest-generated" : ""}"></div></div>`;
  }).join("");
  elements.storyTimeline.innerHTML = `<article class="story-entry continuous-entry">
    <div class="story-prose">${segments}</div>
  </article>`;
  elements.storyTimeline.querySelectorAll(".story-segment").forEach((segment, index) => appendProse(segment, story.events[index].prose));
}

function renderChoices() {
  const head = story.events.at(-1);
  const choices = head?.choices ?? [];
  elements.choicesSection.hidden = choices.length === 0 || generating || story.state.status === "ended";
  elements.choiceList.innerHTML = choices
    .map(
      (choice, index) => `<button class="choice-button" type="button" data-choice-id="${escapeHtml(choice.id)}">
        <span class="choice-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="choice-copy"><span class="choice-label">${escapeHtml(choice.label)}</span><span class="choice-detail">${escapeHtml(choice.action)}</span></span>
        <i data-lucide="arrow-up-right"></i>
      </button>`,
    )
    .join("");
}

function renderState() {
  elements.stateLocation.textContent = story.state.location?.name ?? "未知";
  elements.stateTime.textContent = story.state.time;
  elements.characterCount.textContent = story.state.characters.length;
  const present = story.state.characters.filter((character) => character.present).map((character) => character.name);
  const sceneCast = document.querySelector("#scene-cast");
  sceneCast.textContent = present.length ? `在场 / ${present.join(" · ")}` : "此处暂未遇见其他人";
  elements.characterList.innerHTML = story.state.characters.length
    ? story.state.characters
        .map((character) => {
          const relation = relationLabel(character.attitude);
          const portrait = story.story.onboarding?.characterProfiles?.find((profile) => profile.id === character.id)?.image;
          return `<div class="character-item">
            <span class="character-avatar">${portrait ? `<img src="${escapeHtml(portrait.src)}" alt="" />` : escapeHtml(character.name.slice(0, 1))}</span>
            <span class="character-copy">
              <strong>${escapeHtml(character.name)}</strong>
              <small>${escapeHtml(character.role)} · ${escapeHtml(characterStatus(character))}</small>
            </span>
            <span class="attitude ${relation.className}">${relation.label}</span>
          </div>`;
        })
        .join("")
    : '<p class="empty-state">还没有认识重要人物</p>';

  const graph = story.state.relationshipGraph;
  const names = new Map((graph?.nodes ?? []).map((node) => [node.id, node.name]));
  const visibleEdges = (graph?.edges ?? []).filter((edge) => names.has(edge.from) && names.has(edge.to));
  elements.relationshipList.innerHTML = visibleEdges.length
    ? visibleEdges.map((edge) => {
        const label = edge.type === "attitude" ? relationLabel(edge.value).label : "有联系";
        return `<div class="relationship-item"><span>${escapeHtml(names.get(edge.from))}</span><i data-lucide="arrow-right"></i><span>${escapeHtml(names.get(edge.to))}</span><small>${escapeHtml(label)}</small></div>`;
      }).join("")
    : '<p class="empty-state">关系网还没有形成可见连接</p>';

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
  if (document.body.dataset.view === "story") window.novelAtmosphere?.setScene({
    src: scene.image.src,
    fallback: scene.fallbackImage,
    mood: sceneMoods[scene.locationId] ?? "quiet",
    position: scene.image.position ?? "center",
  });
  elements.sceneImage.onerror = () => {
    elements.sceneImage.onerror = null;
    if (scene.fallbackImage) elements.sceneImage.src = scene.fallbackImage;
  };
  if (elements.sceneImage.src !== new URL(scene.image.src, window.location.href).href) {
    elements.sceneImage.src = scene.image.src;
  }
  elements.sceneImage.alt = scene.image.alt ?? scene.title;
  elements.sceneTitle.textContent = scene.title ?? story.story.title;
  elements.sceneEyebrow.textContent = scene.locationName ?? story.state.location?.name ?? "当前场景";
  elements.storyTitle.textContent = scene.title ?? story.story.title;
}

function render() {
  if (!story) return;
  const ended = story.state.status === "ended";
  const turn = story.events.length - 1;
  elements.storySubtitle.textContent = story.story.subtitle;
  if (document.body.dataset.view === "story") document.title = `${story.story.title} · ${story.state.scene?.title ?? "东京出走"}`;
  renderScene();
  elements.storyLocation.textContent = `${story.state.location?.name ?? "未知地点"} · ${story.state.time}`;
  elements.turnCounter.textContent = turn === 0 ? "序章" : `第 ${turn} 回合`;
  document.querySelector("#story-page-number").textContent = turn === 0 ? "序" : String(turn).padStart(2, "0");
  document.querySelector("#player-name").textContent = story.story.player?.name ?? "";
  renderTimeline();
  renderChoices();
  renderState();
  elements.actionForm.hidden = ended;
  elements.actionInput.disabled = generating || ended;
  elements.sendAction.disabled = generating || ended;
  elements.sendAction.hidden = generating;
  elements.stopAction.hidden = !generating || turnPrepared;
  elements.resetStory.disabled = generating;
  document.querySelector("#story-ending").hidden = !ended;
  document.querySelector("#ending-route").textContent = { normal: "本篇完", deviation: "另一种结局", failure: "未竟之路", early: "在此停笔" }[story.state.ending?.type] ?? "本篇完";
  document.querySelector("#ending-summary").textContent = story.state.ending?.coreQuestionResponse ?? "";
  document.querySelector("#reading-status").innerHTML = generating ? '<i data-lucide="ellipsis"></i>故事正在继续' : '<i data-lucide="cloud-check"></i>已保存';
  elements.storyTimeline.setAttribute("aria-busy", String(generating));
  if (document.body.dataset.view === "gateway") updateGateway();
  refreshIcons();
}

function appendPendingSegment() {
  const prose = elements.storyTimeline.querySelector(".story-prose");
  if (!prose) return null;
  prose.querySelector(".latest-generated")?.classList.remove("latest-generated");

  const boundary = document.createElement("div");
  boundary.className = "story-segment-boundary live-turn";
  const pendingProse = document.createElement("div");
  pendingProse.className = "story-segment latest-generated streaming-segment";
  const marker = document.createElement("span");
  marker.className = "generation-marker";
  marker.setAttribute("role", "status");
  marker.setAttribute("aria-label", "正在生成下一段正文");
  marker.innerHTML = "<span>故事正在继续</span>";
  boundary.append(pendingProse, marker);
  prose.append(boundary);
  elements.choicesSection.hidden = true;
  return pendingProse;
}

async function submitAction(action, { choiceId = null } = {}) {
  const normalized = action.trim();
  if (!normalized || generating || story?.state.status === "ended") return;
  const trustedChoice = Boolean(choiceId);
  generating = true;
  followLatest = true;
  turnPrepared = false;
  activeTurnSeq = 0;
  render();
  const pendingProse = appendPendingSegment();
  elements.actionInput.value = "";
  updateComposer();
  elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;

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
    if (followLatest) elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
    if (document.body.dataset.view === "story") {
      const focusTarget = story?.state.status === "ended" ? elements.storyScroll : elements.actionInput;
      focusTarget.focus({ preventScroll: true });
    }
  }
}

const phaseLabels = {
  analyzing: "你的选择正在改变故事…",
  synthesizing: "命运在此交汇…",
  narrating: "故事正在继续…",
  recovering: "正在接续故事…",
  committing: "正在保存这段经历…",
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
      marker.querySelector("span").textContent = label;
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
    appendProse(state.pendingProse, event.text);
    if (followLatest) elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
    else document.querySelector("#latest-turn").hidden = false;
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
    document.querySelector("#settings-dialog").close();
    openOnboarding({ startAtRoles: true });
    showToast("故事已重置");
  } catch (error) {
    showToast(error.message, "error");
  }
});

elements.onboardingReplay.addEventListener("click", () => openOnboarding({ replay: true }));
elements.onboardingSkip.addEventListener("click", finishOnboarding);
elements.onboardingPrevious.addEventListener("click", () => moveOnboarding(-1));
elements.onboardingNext.addEventListener("click", () => moveOnboarding(1));
function navigateOnboarding(event) {
  const button = event.target.closest("[data-onboarding-index]");
  if (!button || selectingRole) return;
  onboardingIndex = Number(button.dataset.onboardingIndex);
  renderOnboarding();
  const source = event.currentTarget;
  source.querySelector(`[data-onboarding-index="${onboardingIndex}"]`)?.focus({ preventScroll: true });
}
elements.onboardingDots.addEventListener("click", navigateOnboarding);
document.querySelector("#onboarding-chapters").addEventListener("click", navigateOnboarding);
elements.onboarding.addEventListener("click", (event) => {
  const button = event.target.closest("[data-role-id]");
  if (button) selectRole(button.dataset.roleId);
  const preview = event.target.closest("[data-role-preview]");
  if (preview && !selectingRole) {
    rolePreviewId = preview.dataset.rolePreview;
    renderOnboarding();
    elements.immersiveOnboarding.querySelector(`[data-role-preview="${rolePreviewId}"]`)?.focus({ preventScroll: true });
  }
});

document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  const openPanelElement = document.body.classList.contains("state-open") ? elements.statePanel : null;
  if (openPanelElement) {
    if (event.key === "Escape") { event.preventDefault(); closePanels(); }
    if (event.key === "Tab") {
      const focusable = [...openPanelElement.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (event.key === "Escape" && document.body.classList.contains("scene-only")) { setSceneReveal(false); return; }
  if (!elements.onboarding.hidden && elements.onboarding.dataset.step === "roles"
    && event.target.closest("[data-role-preview]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const tabs = [...elements.immersiveOnboarding.querySelectorAll("[data-role-preview]")];
    if (selectingRole || !tabs.length) return;
    const current = tabs.findIndex((tab) => tab.dataset.rolePreview === rolePreviewId);
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].click();
    return;
  }
  if (event.target.closest("input, textarea, button, select")) return;
  if (elements.onboarding.hidden) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); moveOnboarding(-1); }
  if (event.key === "ArrowRight") { event.preventDefault(); moveOnboarding(1); }
  if (event.key === "Escape" && !needsRoleSelection()) finishOnboarding();
});

elements.stateToggle.addEventListener("click", openStatePanel);
elements.panelScrim.addEventListener("click", closePanels);
document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", closePanels));
document.querySelector("#gateway-enter").addEventListener("click", () => enterStory());
document.querySelector("#gateway-prelude").addEventListener("click", () => enterStory({ prelude: true }));
document.querySelector("#gateway-chapter").addEventListener("click", () => enterStory({ prelude: true }));
document.querySelector("#gateway-cast").addEventListener("click", () => {
  if (!story) return;
  entered = true;
  openOnboarding({ replay: Boolean(story.story.player), startAtRoles: true });
});
document.querySelector("#onboarding-home").addEventListener("click", () => { if (!selectingRole) showGateway(); });
document.querySelector("#story-home").addEventListener("click", showGateway);

function setSceneReveal(enabled) {
  document.body.classList.toggle("scene-only", enabled);
  const button = document.querySelector("#scene-reveal");
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute("aria-label", enabled ? "返回阅读" : "欣赏场景");
  button.title = enabled ? "返回阅读" : "欣赏场景";
  button.innerHTML = `<i data-lucide="${enabled ? "book-open" : "scan"}"></i>`;
  syncPanelAccessibility();
  refreshIcons();
}
document.querySelector("#scene-reveal").addEventListener("click", () => setSceneReveal(!document.body.classList.contains("scene-only")));

elements.storyScroll.addEventListener("scroll", () => {
  followLatest = elements.storyScroll.scrollHeight - elements.storyScroll.scrollTop - elements.storyScroll.clientHeight < 90;
  document.querySelector("#latest-turn").hidden = followLatest;
}, { passive: true });
document.querySelector("#latest-turn").addEventListener("click", () => {
  elements.storyScroll.scrollTop = elements.storyScroll.scrollHeight;
  followLatest = true;
  document.querySelector("#latest-turn").hidden = true;
});

const settingsDialog = document.querySelector("#settings-dialog");
const readingSize = document.querySelector("#reading-size");
const motionReduced = document.querySelector("#motion-reduced");
let readingMode = "cinematic";

function savePreferences() {
  try { localStorage.setItem("ai-novel:reading", JSON.stringify({ size: Number(readingSize.value), mode: readingMode, reduced: motionReduced.checked })); } catch { /* Storage can be unavailable in private browsing. */ }
}

function applyPreferences() {
  document.documentElement.style.setProperty("--reading-size", `${readingSize.value}px`);
  document.querySelector("#reading-size-value").value = readingSize.value;
  document.body.dataset.readingMode = readingMode;
  document.querySelectorAll("[data-reading-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.readingMode === readingMode)));
  window.novelAtmosphere?.setReduced(motionReduced.checked);
}

try {
  const saved = JSON.parse(localStorage.getItem("ai-novel:reading") ?? "null");
  if (saved) {
    readingSize.value = String(Math.max(16, Math.min(24, Number(saved.size) || 18)));
    readingMode = saved.mode === "focus" ? "focus" : "cinematic";
    motionReduced.checked = Boolean(saved.reduced);
  }
} catch { /* Invalid saved preferences fall back to the default reading view. */ }
applyPreferences();
document.querySelector("#settings-toggle").addEventListener("click", () => settingsDialog.showModal());
document.querySelector("#settings-close").addEventListener("click", () => settingsDialog.close());
readingSize.addEventListener("input", () => { applyPreferences(); savePreferences(); });
motionReduced.addEventListener("change", () => { applyPreferences(); savePreferences(); });
document.querySelectorAll("button[data-reading-mode]").forEach((button) => button.addEventListener("click", () => {
  readingMode = button.dataset.readingMode;
  applyPreferences();
  savePreferences();
}));

for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

async function initialize() {
  refreshIcons();
  syncPanelAccessibility();
  try {
    story = await requestJson("/api/story");
    updateGateway();
    activeAtEntry = await requestJson("/api/turns/active");
    if (entered && document.body.dataset.view === "story" && activeAtEntry && !needsRoleSelection() && !generating) {
      const active = activeAtEntry;
      activeAtEntry = null;
      await resumeActiveTurn(active);
    }
  } catch (error) {
    showToast(error.message || "无法载入《龙族》", "error");
    if (!story) {
      const enter = document.querySelector("#gateway-enter");
      enter.disabled = false;
      document.querySelector("#gateway-enter-label").textContent = "重新连接";
    }
  }
}

initialize();
