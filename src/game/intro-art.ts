/* Lightweight, time-based scenery for the story. The explosion sheet is CC0;
 * the backgrounds, spray and fallback are drawn in the game's canvas. */
export const INTRO_FALL = 4.2;
export const INTRO_IMPACT = 7.2;
export const INTRO_BEACH = 9.5;
export const introImpactX = (width: number) => width * (width < 520 ? 0.6 : 0.76);

let explosion: HTMLImageElement | null = null;
let requested = false;

export function preloadIntroArt() {
  if (requested || typeof Image === "undefined") return;
  requested = true;
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth === 1280 && img.naturalHeight === 80) explosion = img;
  };
  img.src = "/effects/intro-explosion.png";
}

export function drawFlightOcean(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const horizon = h * 0.56;
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#679bc8"); sky.addColorStop(1, "#c6dce4");
  c.fillStyle = sky; c.fillRect(0, 0, w, horizon);
  const sea = c.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, "#397399"); sea.addColorStop(1, "#173c5b");
  c.fillStyle = sea; c.fillRect(0, horizon, w, h - horizon);
  c.fillStyle = "rgba(255,255,255,.62)";
  for (let i = 0; i < 5; i++) {
    const x = ((i * 230 + t * 24) % (w + 180)) - 90;
    const y = h * 0.13 + (i % 3) * Math.min(46, h * 0.08);
    c.fillRect(x - 28, y, 78, 14); c.fillRect(x - 10, y - 12, 43, 12);
  }
  c.strokeStyle = "rgba(207,235,239,.34)"; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const y = h * 0.59 + i * h * 0.05;
    c.beginPath();
    for (let x = 0; x <= w; x += 28) {
      const yy = y + Math.sin(x * 0.025 + t * 1.5 + i) * 3;
      if (!x) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.stroke();
  }
}

/** Ten original 128×80 frames; no per-frame allocations or particle RNG. */
export function drawIntroExplosion(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const elapsed = Math.max(0, t - INTRO_IMPACT);
  const progress = Math.min(1, elapsed / (INTRO_BEACH - INTRO_IMPACT));
  const x = introImpactX(w), y = h * 0.6;
  const size = Math.min(340, w * 0.55, h * 0.51);

  c.save();
  const glow = c.createRadialGradient(x, y - size * 0.24, 0, x, y - size * 0.24, size * 0.8);
  const glowAlpha = Math.max(0, 0.48 - progress * 0.65);
  glow.addColorStop(0, `rgba(255,175,66,${glowAlpha})`); glow.addColorStop(1, "rgba(255,132,32,0)");
  c.fillStyle = glow; c.fillRect(x - size, y - size, size * 2, size * 1.5);

  // Expanding rings and lifted water make the impact read as an ocean crash.
  c.globalAlpha = Math.max(0, 0.88 - progress * 0.78);
  c.strokeStyle = "#d0f1ef"; c.lineWidth = Math.max(2, size * 0.016);
  for (let i = 0; i < 2; i++) {
    const r = size * (0.16 + progress * (0.63 + i * 0.18));
    c.beginPath(); c.ellipse(x, y + size * 0.05 + i * size * 0.06, r, r * 0.19, 0, 0, Math.PI * 2); c.stroke();
  }

  const frame = Math.min(9, Math.floor(elapsed / 1.75 * 10));
  c.globalAlpha = Math.min(1, Math.max(0, (1 - progress) * 2.8));
  if (explosion) {
    c.imageSmoothingEnabled = false;
    // The cells are wider than tall (128×80), not 80×80. Preserving those
    // bounds and proportions keeps complete fireballs instead of cut-off halves.
    const blastW = size * 1.45, blastH = size * 0.90625;
    c.drawImage(explosion, frame * 128, 0, 128, 80, x - blastW / 2, y - blastH * 0.9, blastW, blastH);
    // A smaller delayed burst adds depth without a second asset or allocations.
    if (elapsed > 0.18 && elapsed < 1.55) {
      const second = Math.min(9, Math.floor((elapsed - 0.18) / 1.5 * 10));
      c.globalAlpha *= 0.78;
      c.drawImage(explosion, second * 128, 0, 128, 80, x + size * 0.01, y - size * 0.5, blastW * 0.5, blastH * 0.5);
    }
  } else {
    // Still a readable blast if an image is unavailable/offline.
    const radius = size * (0.12 + Math.min(1, elapsed * 2) * 0.34);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.399963, r = radius * (0.35 + (i % 4) * 0.18);
      const block = radius * (0.6 + (i % 3) * 0.12);
      c.fillStyle = elapsed > 1.1 ? "#8f7770" : i % 3 === 0 ? "#ffe78a" : i % 2 ? "#ff912a" : "#e74c21";
      c.fillRect(Math.round(x + Math.cos(a) * r - block / 2), Math.round(y - radius + Math.sin(a) * r - block / 2), Math.ceil(block), Math.ceil(block));
    }
  }

  // Foreground water breaks up the flat bottom of the sprite and connects the
  // fireball to the sea. The square crests stay true to the pixel-art style.
  const splash = Math.min(1, elapsed * 5) * Math.max(0, 1 - progress * 1.5);
  c.globalAlpha = splash;
  c.fillStyle = "#a5e0de";
  c.fillRect(x - size * 0.29, y + size * 0.015, size * 0.58, size * 0.025);
  for (let i = 0; i < 12; i++) {
    const dx = Math.sin(i * 5.31) * size * 0.35;
    const height = size * (0.04 + (i % 5) * 0.025) * Math.min(1, elapsed * 4);
    const block = Math.ceil(size * (0.018 + (i % 3) * 0.006));
    c.fillStyle = i % 2 ? "#e3f4e8" : "#b7e9e2";
    c.fillRect(Math.round(x + dx), Math.round(y - height), block, block);
    c.fillRect(Math.round(x + dx * 0.8), Math.round(y - height * 0.65), block * 1.3, block);
    c.fillRect(Math.round(x + dx * 0.65), Math.round(y - height * 0.3), block * 1.8, block);
  }

  // Sparks and spray follow deterministic ballistic arcs in screen space.
  c.globalAlpha = Math.max(0, 1 - progress * 1.5);
  for (let i = 0; i < 24; i++) {
    const a = Math.PI + (i / 23) * Math.PI;
    const reach = size * (0.1 + elapsed * (0.27 + (i % 5) * 0.065));
    const px = x + Math.cos(a) * reach;
    const py = y + Math.sin(a) * reach * 0.82 + elapsed * elapsed * size * 0.11;
    const dot = Math.max(2, Math.round(size * (i % 4 === 0 ? 0.022 : 0.013)));
    c.fillStyle = i % 3 === 0 ? "#d9f5f2" : i % 2 ? "#ffcf63" : "#ff8028";
    c.fillRect(Math.round(px), Math.round(py), dot, dot);
  }
  c.restore();
}

/** A curved sandy shore, visible ocean and a wooded island headland. */
export function drawLandingBackdrop(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const horizon = h * 0.38;
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#354b68"); sky.addColorStop(0.58, "#8e9eaa"); sky.addColorStop(1, "#f2bd91");
  c.fillStyle = sky; c.fillRect(0, 0, w, horizon);
  const sunX = w * 0.52, sunY = h * 0.30, sunR = Math.min(28, h * 0.045, w * 0.07);
  c.fillStyle = "#ffe7aa"; c.beginPath(); c.arc(sunX, sunY, sunR, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,230,194,.45)";
  for (let i = 0; i < 5; i++) {
    const x = ((w * (0.12 + i * 0.23) + t * (i % 2 ? 2 : -3)) % (w + 100)) - 40;
    const y = h * (0.14 + (i % 3) * 0.045);
    c.fillRect(x, y, Math.max(35, w * 0.09), 5); c.fillRect(x + 13, y - 5, Math.max(21, w * 0.055), 5);
  }
  // Layered hills and individual tree silhouettes signal the island behind
  // the water, without adding a large background texture to every frame.
  c.fillStyle = "#66827c"; c.beginPath();
  c.moveTo(w * 0.58, horizon); c.lineTo(w * 0.68, h * 0.31); c.lineTo(w * 0.74, h * 0.34);
  c.lineTo(w * 0.83, h * 0.265); c.lineTo(w * 0.94, h * 0.34); c.lineTo(w, h * 0.31);
  c.lineTo(w, horizon + 4); c.closePath(); c.fill();
  c.fillStyle = "#365f56"; c.beginPath();
  c.moveTo(w * 0.68, horizon); c.lineTo(w * 0.75, h * 0.35); c.lineTo(w * 0.82, h * 0.365);
  c.lineTo(w * 0.91, h * 0.32); c.lineTo(w, h * 0.35); c.lineTo(w, horizon + 7); c.closePath(); c.fill();
  c.fillStyle = "#274f46";
  const treeUnit = Math.max(2, Math.min(5, w * 0.006));
  for (let i = 0; i < 15; i++) {
    const x = w * (0.71 + i * 0.021), y = horizon - (i % 3) * treeUnit * 1.3;
    c.fillRect(x, y - treeUnit * 2, treeUnit, treeUnit * 3);
    c.fillRect(x - treeUnit * 1.5, y - treeUnit * 3, treeUnit * 4, treeUnit * 1.5);
  }
  const sea = c.createLinearGradient(0, horizon, 0, h * 0.75);
  sea.addColorStop(0, "#397e91"); sea.addColorStop(0.58, "#58a6a7"); sea.addColorStop(1, "#9ac8b9");
  c.fillStyle = sea; c.fillRect(0, horizon, w, h - horizon);
  c.fillStyle = "rgba(247,228,181,.28)";
  for (let i = 0; i < 20; i++) {
    const x = (w * 0.5 + ((i * 67) % 240) - 120 + Math.sin(t * 0.7 + i) * 8);
    const y = horizon + 8 + i * h * 0.012;
    c.fillRect(Math.round(x), Math.round(y), 12 + (i % 4) * 10, 2);
  }
  c.fillStyle = "rgba(219,248,232,.48)";
  for (let i = 0; i < 30; i++) {
    const x = ((i * 173 + Math.sin(t * 0.7 + i) * 12) % (w + 40)) - 20;
    const y = horizon + h * (0.035 + (i % 9) * 0.027);
    c.fillRect(Math.round(x), Math.round(y), 15 + (i % 4) * 9, i % 3 === 0 ? 3 : 2);
  }
  // The cream bands form an irregular, clearly readable shoreline.
  const shore = (offset: number, color: string) => {
    c.fillStyle = color; c.beginPath();
    c.moveTo(0, h * 0.63 + offset);
    c.bezierCurveTo(w * 0.2, h * 0.62 + offset, w * 0.34, h * 0.70 + offset, w * 0.58, h * 0.67 + offset);
    c.bezierCurveTo(w * 0.77, h * 0.64 + offset, w * 0.87, h * 0.57 + offset, w, h * 0.58 + offset);
    c.lineTo(w, h + 2); c.lineTo(0, h + 2); c.closePath(); c.fill();
  };
  shore(-7, "#d4eee0"); shore(0, "#e8d49b");
  c.fillStyle = "rgba(255,241,197,.6)";
  for (let i = 0; i < 18; i++) {
    const x = (i * 97 + 27) % w, y = h * 0.71 + (i % 5) * h * 0.035;
    c.fillRect(Math.round(x), Math.round(y), 8 + (i % 4) * 5, 2);
  }
}
