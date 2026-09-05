const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

let width = 0;
let height = 0;
let dpr = 1;
let stars = [];
let motes = [];
let embers = [];
let meteors = [];
let sigils = [];
let bursts = [];
let rafId = 0;
let lastMeteorAt = 0;
let pointerX = 0.5;
let pointerY = 0.5;
let auraX = -500;
let auraY = -500;

const STAR_LAYERS = [
  { count: 90, speed: 4, radius: [0.4, 0.9], alpha: [0.25, 0.5], drift: 0.008 },
  { count: 50, speed: 10, radius: [0.7, 1.4], alpha: [0.4, 0.75], drift: 0.016 },
  { count: 22, speed: 20, radius: [1.0, 1.9], alpha: [0.6, 1], drift: 0.028 },
];

const random = (min, max) => min + Math.random() * (max - min);

const SIGIL_CHARS = ["✦", "✧", "◇", "◈", "❖", "⬖"];

function buildParticles() {
  stars = [];
  for (const layer of STAR_LAYERS) {
    const count = Math.round(layer.count * (width / 1280 + 0.4));
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: random(layer.radius[0], layer.radius[1]),
        alpha: random(layer.alpha[0], layer.alpha[1]),
        twinkle: random(0.4, 1.6),
        phase: Math.random() * Math.PI * 2,
        speed: layer.speed,
        drift: layer.drift,
        warm: Math.random() < 0.14,
      });
    }
  }

  motes = [];
  const moteCount = Math.round(40 * (width / 1280 + 0.4));
  for (let index = 0; index < moteCount; index += 1) {
    motes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: random(1.2, 2.8),
      rise: random(9, 22),
      sway: random(6, 16),
      swaySpeed: random(0.15, 0.45),
      phase: Math.random() * Math.PI * 2,
      alpha: random(0.1, 0.32),
      warm: Math.random() < 0.3,
    });
  }

  sigils = [];
  const sigilCount = Math.round(10 * (width / 1280 + 0.4));
  for (let index = 0; index < sigilCount; index += 1) {
    sigils.push({
      char: SIGIL_CHARS[Math.floor(Math.random() * SIGIL_CHARS.length)],
      x: Math.random() * width,
      y: Math.random() * height,
      size: random(11, 20),
      rise: random(6, 14),
      sway: random(10, 26),
      swaySpeed: random(0.1, 0.3),
      spin: random(-0.25, 0.25),
      phase: Math.random() * Math.PI * 2,
      alpha: random(0.05, 0.15),
      warm: Math.random() < 0.35,
    });
  }

  embers = [];
  const emberCount = Math.round(30 * (width / 1280 + 0.4));
  for (let index = 0; index < emberCount; index += 1) {
    embers.push({
      x: width * 0.5 + random(-width * 0.26, width * 0.26),
      y: Math.random() * height,
      radius: random(0.8, 2.3),
      rise: random(26, 72),
      swaySpeed: random(0.25, 0.7),
      sway: random(8, 30),
      flicker: random(1.6, 4.2),
      phase: Math.random() * Math.PI * 2,
      alpha: random(0.22, 0.6),
      gold: Math.random() < 0.55,
    });
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildParticles();
  paint(performance.now());
}

function spawnMeteor(now) {
  if (now - lastMeteorAt < random(5200, 11000)) return;
  lastMeteorAt = now;
  const fromLeft = Math.random() < 0.5;
  meteors.push({
    x: random(width * 0.1, width * 0.9),
    y: random(-40, height * 0.28),
    vx: (fromLeft ? 1 : -1) * random(260, 420),
    vy: random(140, 220),
    life: random(0.7, 1.1),
    age: 0,
  });
  if (meteors.length > 3) meteors = meteors.slice(-3);
}

function drawHalo(x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
  ctx.fill();
}

function paint(now) {
  const seconds = now / 1000;
  ctx.clearRect(0, 0, width, height);

  const parallaxX = (pointerX - 0.5) * 14;
  const parallaxY = (pointerY - 0.5) * 10;

  for (const star of stars) {
    const glow = star.alpha * (0.62 + 0.38 * Math.sin(seconds * star.twinkle + star.phase));
    const depth = star.radius / 1.9;
    const x = (star.x + seconds * star.speed) % (width + 40) - 20 + parallaxX * depth;
    const y = star.y + Math.sin(seconds * star.drift * 8 + star.phase) * 3 + parallaxY * depth;
    ctx.beginPath();
    ctx.fillStyle = star.warm
      ? `rgba(255, 196, 140, ${glow.toFixed(3)})`
      : `rgba(188, 214, 255, ${glow.toFixed(3)})`;
    ctx.arc(x, y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const mote of motes) {
    const y = height - ((mote.y + seconds * mote.rise) % (height + 60)) + 30;
    const x = mote.x + Math.sin(seconds * mote.swaySpeed + mote.phase) * mote.sway + parallaxX * 0.4;
    const fade = mote.alpha * (0.6 + 0.4 * Math.sin(seconds * 0.8 + mote.phase));
    if (y < -30 || y > height + 30) continue;
    const color = mote.warm
      ? `rgba(255, 184, 107, ${fade.toFixed(3)})`
      : `rgba(87, 230, 255, ${fade.toFixed(3)})`;
    drawHalo(x, y, mote.radius, color);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, mote.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const ember of embers) {
    const y = height - ((ember.y + seconds * ember.rise) % (height + 90)) + 45;
    const x = ember.x + Math.sin(seconds * ember.swaySpeed + ember.phase) * ember.sway + parallaxX * 0.25;
    if (y < -40 || y > height + 40) continue;
    const fade = ember.alpha * (0.45 + 0.55 * Math.max(0, Math.sin(seconds * ember.flicker + ember.phase)));
    const color = ember.gold
      ? `rgba(255, 214, 138, ${fade.toFixed(3)})`
      : `rgba(255, 148, 78, ${fade.toFixed(3)})`;
    drawHalo(x, y, ember.radius * 1.6, color);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, ember.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const sigil of sigils) {
    const y = height - ((sigil.y + seconds * sigil.rise) % (height + 80)) + 40;
    const x = sigil.x + Math.sin(seconds * sigil.swaySpeed + sigil.phase) * sigil.sway + parallaxX * 0.55;
    if (y < -40 || y > height + 40) continue;
    const fade = sigil.alpha * (0.55 + 0.45 * Math.sin(seconds * 0.6 + sigil.phase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sigil.phase + seconds * sigil.spin);
    ctx.font = `${sigil.size}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = sigil.warm
      ? `rgba(255, 196, 140, ${fade.toFixed(3)})`
      : `rgba(140, 190, 255, ${fade.toFixed(3)})`;
    ctx.fillText(sigil.char, 0, 0);
    ctx.restore();
  }

  for (const burst of bursts) {
    const progress = burst.age / burst.life;
    const fade = Math.max(0, 1 - progress) * burst.alpha;
    if (fade <= 0) continue;
    drawHalo(burst.x, burst.y, burst.radius, burst.color(fade * 0.8));
    ctx.beginPath();
    ctx.fillStyle = burst.color(fade);
    ctx.arc(burst.x, burst.y, burst.radius * Math.max(0.3, 1 - progress * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }

  meteors = meteors.filter((meteor) => meteor.age < meteor.life);
  for (const meteor of meteors) {
    const progress = meteor.age / meteor.life;
    const fade = Math.sin(progress * Math.PI);
    const tail = 90;
    const length = Math.hypot(meteor.vx, meteor.vy);
    ctx.strokeStyle = `rgba(168, 220, 255, ${(0.75 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(meteor.x, meteor.y);
    ctx.lineTo(meteor.x - (meteor.vx / length) * tail, meteor.y - (meteor.vy / length) * tail);
    ctx.stroke();
  }
}

function frame(now) {
  const delta = Math.min((now - (frame.last ?? now)) / 1000, 0.05);
  frame.last = now;
  spawnMeteor(now);
  for (const meteor of meteors) {
    meteor.age += delta;
    meteor.x += meteor.vx * delta;
    meteor.y += meteor.vy * delta;
  }
  bursts = bursts.filter((burst) => burst.age < burst.life);
  for (const burst of bursts) {
    burst.age += delta;
    burst.x += burst.vx * delta;
    burst.y += burst.vy * delta;
    burst.vx *= 0.965;
    burst.vy = burst.vy * 0.965 - 26 * delta;
  }
  paint(now);
  rafId = requestAnimationFrame(frame);
}

function start() {
  if (reduceMotion.matches) {
    paint(performance.now());
    return;
  }
  cancelAnimationFrame(rafId);
  frame.last = undefined;
  rafId = requestAnimationFrame(frame);
}

/* ---------- 指针光环 ---------- */

const aura = document.querySelector(".cursor-aura");

function paintAura() {
  if (!aura) return;
  aura.style.transform = `translate(${auraX - 190}px, ${auraY - 190}px)`;
}

/* ---------- 卡片磁吸 3D 倾斜 ---------- */

let tiltCard = null;

function resetTilt() {
  if (!tiltCard) return;
  tiltCard.classList.remove("tilting");
  tiltCard.style.transform = "";
  tiltCard.style.removeProperty("--mx");
  tiltCard.style.removeProperty("--my");
  tiltCard = null;
}

function bindTilt() {
  if (!finePointer.matches || reduceMotion.matches) return;
  document.addEventListener("pointermove", (event) => {
    const card = event.target.closest?.(".role-card") ?? null;
    if (card !== tiltCard) {
      resetTilt();
      tiltCard = card;
      tiltCard?.classList.add("tilting");
    }
    if (!tiltCard) return;
    const rect = tiltCard.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    tiltCard.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    tiltCard.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    const rotateX = (0.5 - py) * 5.5;
    const rotateY = (px - 0.5) * 7;
    tiltCard.style.transform =
      `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-5px)`;
  }, { passive: true });
  document.addEventListener("pointerleave", resetTilt, { passive: true });
  document.addEventListener("pointerdown", resetTilt, { passive: true });
}

/* ---------- 视图切换过渡 ---------- */

function bindViewTransitions() {
  const views = [
    document.getElementById("onboarding"),
    document.getElementById("app-shell"),
  ];
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const view = mutation.target;
      if (view.hidden) continue;
      view.classList.remove("view-enter");
      void view.offsetWidth;
      view.classList.add("view-enter");
    }
  });
  for (const view of views) {
    if (view) observer.observe(view, { attributes: true, attributeFilter: ["hidden"] });
  }
}

/* ---------- 粒子迸发（开门仪式） ---------- */

function spawnBurst(originX, originY, count) {
  const palette = [
    (alpha) => `rgba(87, 230, 255, ${alpha.toFixed(3)})`,
    (alpha) => `rgba(168, 220, 255, ${alpha.toFixed(3)})`,
    (alpha) => `rgba(167, 139, 250, ${alpha.toFixed(3)})`,
    (alpha) => `rgba(255, 184, 107, ${alpha.toFixed(3)})`,
  ];
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = random(90, 480);
    bursts.push({
      x: originX + random(-30, 30),
      y: originY + random(-30, 30),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      radius: random(0.9, 2.6),
      alpha: random(0.5, 0.95),
      life: random(1.1, 2.3),
      age: 0,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }
}

window.addEventListener("archive:enter", () => {
  spawnBurst(width * 0.5, height * 0.52, 110);
  window.setTimeout(() => spawnBurst(width * 0.4, height * 0.46, 45), 320);
  window.setTimeout(() => spawnBurst(width * 0.6, height * 0.5, 45), 520);
  window.setTimeout(() => spawnBurst(width * 0.5, height * 0.55, 90), 780);
  window.setTimeout(() => spawnBurst(width * 0.5, height * 0.5, 60), 1050);
});

window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pointermove", (event) => {
  pointerX = event.clientX / Math.max(width, 1);
  pointerY = event.clientY / Math.max(height, 1);
  auraX = event.clientX;
  auraY = event.clientY;
  document.documentElement.style.setProperty("--nebula-x", `${(pointerX - 0.5) * 30}px`);
  document.documentElement.style.setProperty("--nebula-y", `${(pointerY - 0.5) * 22}px`);
  if (!reduceMotion.matches) requestAnimationFrame(paintAura);
}, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAnimationFrame(rafId);
  else start();
});
reduceMotion.addEventListener?.("change", start);

resize();
start();
bindTilt();
bindViewTransitions();

/* ---------- 入口页 ---------- */

function bindGateway() {
  const gateway = document.getElementById("gateway");
  const title = document.getElementById("gateway-title");
  const enter = document.getElementById("gateway-enter");
  if (!gateway || !enter) return;

  const emberTray = document.getElementById("gate-embers");
  if (emberTray && !emberTray.childElementCount && !reduceMotion.matches) {
    for (let index = 0; index < 26; index += 1) {
      const ember = document.createElement("i");
      ember.style.setProperty("--ex", `${random(-4.2, 4.2).toFixed(2)}vw`);
      ember.style.setProperty("--eh", `${random(2, 72).toFixed(1)}%`);
      ember.style.setProperty("--ed", `${random(5.5, 11).toFixed(2)}s`);
      ember.style.setProperty("--edl", `${(-random(0, 11)).toFixed(2)}s`);
      ember.style.setProperty("--es", `${random(1.4, 3.2).toFixed(2)}`);
      emberTray.append(ember);
    }
  }

  if (title) {
    const text = title.textContent.trim();
    title.textContent = "";
    [...text].forEach((char, index) => {
      const span = document.createElement("span");
      span.textContent = char;
      span.style.setProperty("--i", String(index));
      title.append(span);
    });
  }

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;

    const portalView = gateway.querySelector(".portal-view");
    if (portalView) {
      const viewWidth = Math.max(portalView.offsetWidth, 1);
      const coverScale = Math.max(window.innerWidth / viewWidth, 1.6) * 1.08;
      gateway.style.setProperty("--portal-zoom", coverScale.toFixed(3));
    }

    gateway.classList.add("gateway-opening");
    window.dispatchEvent(new CustomEvent("archive:enter"));
    window.setTimeout(() => gateway.classList.add("gateway-vanish"), 1500);
    window.setTimeout(() => {
      gateway.hidden = true;
    }, 2160);
  };

  enter.addEventListener("click", dismiss);
  gateway.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      dismiss();
    }
  });
  enter.focus({ preventScroll: true });
}

bindGateway();
