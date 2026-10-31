"use client";

import { useEffect, useRef, useState } from "react";
import { drawCharacter } from "@/game/sprites";
import { referenceSceneUrl, type ReferenceScene } from "@/game/reference-art";

const LABELS: Record<ReferenceScene, string> = {
  forge: "Forja", chapel: "Capela", market: "Mercado", camp: "Acampamento", sewer: "Esgoto",
};
type Direction = "up" | "down" | "left" | "right";
const KEYS: Record<string, Direction> = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };

// These are walkable approximations over the supplied flat preview, not
// reconstructed layers. In particular the sewer crossing stays on the bridge.
function walkable(scene: ReferenceScene, x: number, y: number): boolean {
  if (scene === "sewer") return ((x >= 155 && x <= 350) || (x >= 610 && x <= 805)) && y >= 240 && y <= 500 || x >= 330 && x <= 630 && y >= 345 && y <= 390;
  if (scene === "chapel") return (x >= 440 && x <= 520 && y >= 300 && y <= 600) || (x >= 205 && x <= 755 && y >= 560 && y <= 600) || ((x >= 205 && x <= 245) || (x >= 715 && x <= 755)) && y >= 330 && y <= 600;
  if (scene === "forge") return x >= 65 && x <= 895 && y >= 250 && y <= 466 && !(x > 405 && x < 555 && y > 285 && y < 415);
  if (scene === "market") return x >= 110 && x <= 850 && y >= 390 && y <= 500;
  return x >= 175 && x <= 800 && y >= 455 && y <= 505;
}

interface Props {
  scene: ReferenceScene;
  craftPix: boolean;
  heroLevel: number;
  single: boolean;
  onClose: () => void;
  onForge: () => void;
}

/** A small visitable scene over the screenshots the user supplied. */
export default function ReferenceRoom({ scene, craftPix, heroLevel, single, onClose, onForge }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const input = useRef(new Set<Direction>());
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let x = scene === "sewer" ? 245 : 480;
    let y = scene === "chapel" ? 590 : scene === "forge" ? 455 : scene === "sewer" ? 480 : 495;
    let facing = -Math.PI / 2;
    let previous = 0, lastDraw = 0, raf = 0;
    let imageReady = false, padSeen = false, backWasDown = false, actionWasDown = false;
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      imageReady = true;
    };
    image.onerror = () => setLoadFailed(true);
    image.src = referenceSceneUrl(scene);
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const direction = KEYS[key];
      if (direction) { input.current.add(direction); event.preventDefault(); event.stopPropagation(); }
      else if (key === "escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      else if (key === "e" && scene === "forge") { event.preventDefault(); event.stopPropagation(); onForge(); }
    };
    const up = (event: KeyboardEvent) => {
      const direction = KEYS[event.key.toLowerCase()];
      if (direction) { input.current.delete(direction); event.preventDefault(); event.stopPropagation(); }
    };
    const clear = () => input.current.clear();
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
      previous = time;
      let dx = Number(input.current.has("right")) - Number(input.current.has("left"));
      let dy = Number(input.current.has("down")) - Number(input.current.has("up"));
      const pad = navigator.getGamepads?.()?.[0];
      if (pad) {
        const axis = (value: number) => Math.abs(value) < 0.18 ? 0 : value;
        dx += axis(pad.axes[0] ?? 0) + Number(!!pad.buttons[15]?.pressed) - Number(!!pad.buttons[14]?.pressed);
        dy += axis(pad.axes[1] ?? 0) + Number(!!pad.buttons[13]?.pressed) - Number(!!pad.buttons[12]?.pressed);
        const back = !!pad.buttons[1]?.pressed, action = !!pad.buttons[2]?.pressed;
        if (padSeen && back && !backWasDown) { onClose(); return; }
        if (padSeen && action && !actionWasDown && scene === "forge") { onForge(); return; }
        backWasDown = back; actionWasDown = action; padSeen = true;
      } else padSeen = false;
      const length = Math.hypot(dx, dy);
      if (length) {
        dx /= Math.max(1, length); dy /= Math.max(1, length); facing = Math.atan2(dy, dx);
        const nx = x + dx * dt * 145, ny = y + dy * dt * 145;
        if (walkable(scene, nx, y)) x = nx;
        if (walkable(scene, x, ny)) y = ny;
      }
      // The room is a static photograph except for the hero; 60 FPS is enough
      // here, and the world beneath it does not render while single-player is paused.
      if (!imageReady || time - lastDraw < 16) return;
      lastDraw = time;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0);
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(x, y + 1, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      drawCharacter(ctx, "player", x, y, facing, length > 0, time / 1000 * 9, { scale: 2, craftPix, heroLevel });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      image.onload = null; image.onerror = null;
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [scene, craftPix, heroLevel, onClose, onForge]);

  const pointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    input.current.add(event.currentTarget.dataset.direction as Direction);
  };
  const pointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    input.current.delete(event.currentTarget.dataset.direction as Direction);
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-2 sm:p-5">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${LABELS[scene]} — ambiente de referência`} aria-describedby="reference-room-description" className="w-full max-w-5xl max-h-[96dvh] overflow-y-auto rounded-xl border border-amber-700/70 bg-slate-950 text-amber-100 shadow-2xl">
      <header className="flex items-center justify-between gap-3 px-4 py-2">
        <div><span className="text-[10px] uppercase tracking-widest text-amber-300/70">Visita à imagem de referência</span><h2 className="font-display text-lg">{LABELS[scene]}</h2></div>
        <button className="rounded-lg border border-amber-700 px-3 py-2 text-sm hover:bg-amber-900/40" onClick={onClose}>Sair · Esc</button>
      </header>
      <canvas ref={canvasRef} data-testid="reference-room" className="block w-full bg-slate-900" style={{ imageRendering: "pixelated", touchAction: "none" }} aria-label={`Cena de ${LABELS[scene]}`} />
      {loadFailed && <p role="alert" className="px-4 py-3 text-rose-300">A imagem local não pôde ser carregada. Use Sair para voltar ao jogo.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-amber-100/75">
        <p id="reference-room-description" className="max-w-xl">Caminhe com WASD, setas, botões ou analógico; B sai. O cenário é uma prévia plana enviada, não peças originais; os personagens da imagem são estáticos.{!single && " No multiplayer, o mundo continua ativo."}</p>
        <div className="flex items-center gap-2">
          <div aria-label="Controles de movimento" className="grid grid-cols-3 gap-1 select-none" style={{ touchAction: "none" }}>
            <span /> <button aria-label="Mover para cima" className="rounded bg-slate-800 px-3 py-1" data-direction="up" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>▲</button> <span />
            <button aria-label="Mover para a esquerda" className="rounded bg-slate-800 px-3 py-1" data-direction="left" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>◀</button>
            <button aria-label="Mover para baixo" className="rounded bg-slate-800 px-3 py-1" data-direction="down" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>▼</button>
            <button aria-label="Mover para a direita" className="rounded bg-slate-800 px-3 py-1" data-direction="right" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>▶</button>
          </div>
          {scene === "forge" && <button className="rounded-lg bg-amber-700 px-3 py-2 font-bold text-white hover:bg-amber-600" onClick={onForge}>Forjar · E</button>}
        </div>
      </div>
    </section>
  </div>;
}
