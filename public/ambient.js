(() => {
  const images = [document.querySelector("#world-image-a"), document.querySelector("#world-image-b")];
  const canvas = document.querySelector("#weather");
  const context = canvas.getContext("2d");
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer: fine)");
  let activeImage = 0;
  let requestedSource = images[0].getAttribute("src");
  let revision = 0;
  let reduced = false;
  let width = innerWidth;
  let height = innerHeight;
  let frame = 0;
  let lastTime = 0;
  let rain = [];
  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;

  const motionReduced = () => reduced || motionPreference.matches;
  const raining = () => document.body.dataset.mood === "rain";

  function resize() {
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    rain = Array.from({ length: width < 700 ? 38 : 85 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 190 + Math.random() * 180,
      length: 8 + Math.random() * 18,
    }));
    wake();
  }

  function draw(time) {
    frame = 0;
    if (document.hidden || motionReduced()) {
      context.clearRect(0, 0, width, height);
      return;
    }
    const elapsed = Math.min((time - lastTime) / 1000 || .016, .04);
    lastTime = time;
    x += (targetX - x) * .075;
    y += (targetY - y) * .075;
    document.documentElement.style.setProperty("--scene-x", `${x.toFixed(2)}px`);
    document.documentElement.style.setProperty("--scene-y", `${y.toFixed(2)}px`);
    context.clearRect(0, 0, width, height);
    if (raining()) {
      context.strokeStyle = "rgba(218, 236, 223, .35)";
      context.lineWidth = .65;
      context.beginPath();
      for (const drop of rain) {
        drop.x -= elapsed * 22;
        drop.y += elapsed * drop.speed;
        if (drop.y > height + 30) { drop.y = -30; drop.x = Math.random() * width; }
        if (drop.x < -20) drop.x = width + 20;
        context.moveTo(drop.x, drop.y);
        context.lineTo(drop.x - 2, drop.y + drop.length);
      }
      context.stroke();
    }
    if (raining() || Math.abs(targetX - x) + Math.abs(targetY - y) > .05) wake();
  }

  function wake() {
    if (!frame && !document.hidden && !motionReduced()) frame = requestAnimationFrame(draw);
  }

  async function setScene({ src, fallback = "/assets/scenes/dragon-raja/fallback.png", mood = "quiet", position = "center" }) {
    document.body.dataset.mood = mood;
    context.clearRect(0, 0, width, height);
    wake();
    if (!src || src === requestedSource) return;
    requestedSource = src;
    const ticket = ++revision;
    document.body.dataset.sceneLoading = "true";
    const preload = new Image();
    preload.src = src;
    try {
      await preload.decode();
    } catch {
      preload.src = fallback;
      try { await preload.decode(); } catch {
        if (ticket === revision) {
          requestedSource = null;
          document.body.dataset.sceneLoading = "false";
        }
        return;
      }
    }
    // A late image must never replace a newer scene after a quick navigation.
    if (ticket !== revision) return;
    const nextImage = 1 - activeImage;
    images[nextImage].src = preload.src;
    images[nextImage].style.setProperty("--image-position", position);
    images[nextImage].classList.add("visible");
    images[activeImage].classList.remove("visible");
    activeImage = nextImage;
    document.body.dataset.sceneSource = src;
    document.body.dataset.sceneLoading = "false";
  }

  function setReduced(value) {
    reduced = value;
    document.body.classList.toggle("reduce-motion", motionReduced());
    if (motionReduced()) {
      cancelAnimationFrame(frame);
      frame = 0;
      x = y = targetX = targetY = 0;
      document.documentElement.style.setProperty("--scene-x", "0px");
      document.documentElement.style.setProperty("--scene-y", "0px");
      context.clearRect(0, 0, width, height);
    } else wake();
  }

  document.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || motionReduced()) return;
    targetX = (event.clientX / width - .5) * -9;
    targetY = (event.clientY / height - .5) * -6;
    wake();
  }, { passive: true });
  document.addEventListener("pointerleave", () => { targetX = targetY = 0; wake(); });
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("resize", resize, { passive: true });
  motionPreference.addEventListener("change", () => setReduced(reduced));
  window.novelAtmosphere = { setScene, setReduced };
  resize();
  setReduced(false);
})();
