"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Engine, Snapshot, UiEvent, Difficulty, Mode, GamePanel,
  RES_ICON, RES_LABEL, TOOL_ICON, TOOL_LABEL, DIFF_LABEL, ResKey,
} from "@/game/engine";
import { music } from "@/game/music";
import { GAME_TITLE, GAME_TAGLINE } from "@/game/identity";
import { getPortraitUrl } from "@/game/sprites";
import { Icon, type IconName } from "@/components/Icons";
import FieldJournal, { OutcomePanel } from "@/components/FieldJournal";
import ReferenceRoom from "@/components/ReferenceRoom";
import { loadReferenceArt, referenceMenuUrl, type ReferenceScene } from "@/game/reference-art";
import {
  GameSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, applyFullscreen, CONTROL_LABEL,
  ControlScheme, FpsCap, Quality,
} from "@/game/settings";

type Screen = "menu" | "difficulty" | "mplobby" | "game" | "scores" | "help";

interface ScoreRow {
  id: number | string; name: string; score: number; days: number; kills: number;
  difficulty: string; mode: string; outcome: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function randomSeed() {
  return Math.floor(Math.random() * 2147483646) + 1;
}

export default function GameClient() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("dificil");
  const [mode, setMode] = useState<Mode>("single");
  const [playerName, setPlayerName] = useState("Sobrevivente");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [panel, setPanel] = useState<GamePanel>("none");
  const [referenceScene, setReferenceScene] = useState<ReferenceScene | null>(null);
  const [toast, setToast] = useState<{ text: string; who?: string } | null>(null);
  const [gameState, setGameState] = useState<string>("cutscene");
  const [showQuests, setShowQuests] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [storageReady, setStorageReady] = useState(false);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [mpCode, setMpCode] = useState("");
  const [mpJoin, setMpJoin] = useState("");
  const [mpError, setMpError] = useState("");
  const [mpBusy, setMpBusy] = useState(false);
  const [gameCfg, setGameCfg] = useState<{ seed: number; continueSave: boolean; mp?: { code: string; playerId: string } } | null>(null);
  const [hasSave, setHasSave] = useState<Record<string, boolean>>({});
  const [isTouch, setIsTouch] = useState(false);
  const [runOn, setRunOn] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [menuArt, setMenuArt] = useState("");
  const [showKeys, setShowKeys] = useState(true);
  const [showTutorial, setShowTutorial] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  const joyRef = useRef<HTMLDivElement>(null);
  const joyState = useRef({ active: false, id: -1, cx: 0, cy: 0 });
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });

  /* ---------- boot ---------- */
  useEffect(() => {
    const s = loadSettings();
    // Browser storage and touch capabilities are only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(s);
    setIsTouch(typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0));
    try {
      const n = localStorage.getItem("umbra-name");
      if (n) setPlayerName(n);
    } catch { /* */ }
    setStorageReady(true);
  }, []);

  // Do not overwrite previous settings/name with defaults before hydration.
  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem("umbra-name", playerName); } catch { /* */ }
  }, [playerName, storageReady]);

  useEffect(() => { if (storageReady) saveSettings(settings); }, [settings, storageReady]);

  useEffect(() => { applyFullscreen(settings.fullscreen); }, [settings.fullscreen]);

  // The optional backdrop uses the supplied landscape preview only after it
  // has loaded successfully; missing art retains the original gradient.
  useEffect(() => {
    if (!settings.craftPix || !storageReady) return;
    let alive = true;
    void loadReferenceArt().then(() => { if (alive) setMenuArt(referenceMenuUrl()); });
    return () => { alive = false; };
  }, [settings.craftPix, storageReady]);

  // música: lobby em todos os menus, engine controla a trilha no jogo
  useEffect(() => {
    if (!storageReady) return;
    music.setEnabled(settings.music);
    music.setVolume(settings.musicVol);
    music.setVoice(settings.voice);
    if (screen !== "game") music.play("lobby");
    const resume = () => { music.ensure(); music.resume(); setAudioOn(true); };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [screen, settings.music, settings.musicVol, settings.voice, storageReady]);

  useEffect(() => {
    if (screen !== "difficulty") return;
    const hs: Record<string, boolean> = {};
    (["dificil", "muito-dificil", "impossivel"] as Difficulty[]).forEach((d) => {
      hs[d] = Engine.hasSave(d, "single") !== null;
    });
    // Read browser-only saves when the difficulty screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasSave(hs);
  }, [screen]);

  const onUi = useCallback((ev: UiEvent) => {
    if (ev.type === "snapshot") setSnap(ev.snap);
    else if (ev.type === "state") {
      setGameState(ev.state);
      if (ev.state === "gameover" || ev.state === "victory") setPanel("none");
    } else if (ev.type === "panel") setPanel(ev.panel);
    else if (ev.type === "reference") setReferenceScene(ev.scene);
    else if (ev.type === "toast") {
      setToast({ text: ev.text, who: ev.who });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), ev.who ? 5200 : 3600);
    }
  }, []);
  const closeReference = useCallback(() => engineRef.current?.closePanel(), []);
  const forgeFromReference = useCallback(() => engineRef.current?.openPanel("forge"), []);

  /* ---------- engine lifecycle ---------- */
  useEffect(() => {
    if (screen !== "game" || !gameCfg || !canvasRef.current) return;
    submittedRef.current = false;
    const eng = new Engine({
      canvas: canvasRef.current,
      mode, difficulty, playerName,
      seed: gameCfg.seed,
      continueSave: gameCfg.continueSave,
      mp: gameCfg.mp,
      settings,
      music,
      onUi,
    });
    engineRef.current = eng;
    eng.start();
    return () => { eng.destroy(); engineRef.current = null; };
    // settings são aplicadas via applySettings abaixo, para não recriar o motor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, gameCfg, mode, difficulty, playerName, onUi]);

  useEffect(() => { engineRef.current?.applySettings(settings); }, [settings]);
  useEffect(() => { engineRef.current?.setUiPause(showSettings); }, [showSettings]);

  /* ---------- placar ---------- */
  useEffect(() => {
    if (gameState === "playing") { submittedRef.current = false; return; }
    if ((gameState === "gameover" || gameState === "victory") && snap && !submittedRef.current) {
      submittedRef.current = true;
      const entry = {
        name: playerName, score: snap.score, days: snap.day, kills: snap.kills,
        difficulty, mode, outcome: gameState === "victory" ? "vitoria" : "morte",
      };
      fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).catch(() => {});
      try {
        const raw = localStorage.getItem("umbra-local-scores");
        const list: ScoreRow[] = raw ? JSON.parse(raw) : [];
        list.push({ id: uid(), ...entry });
        list.sort((a, b) => b.score - a.score);
        localStorage.setItem("umbra-local-scores", JSON.stringify(list.slice(0, 25)));
      } catch { /* */ }
    }
  }, [gameState, snap, playerName, difficulty, mode]);

  const loadScores = useCallback(async () => {
    let remote: ScoreRow[] = [];
    try {
      const res = await fetch("/api/scores");
      const data = await res.json();
      remote = data.scores ?? [];
    } catch { /* */ }
    if (remote.length === 0) {
      try {
        const raw = localStorage.getItem("umbra-local-scores");
        remote = raw ? JSON.parse(raw) : [];
      } catch { /* */ }
    }
    setScores(remote);
  }, []);

  // loadScores updates state only after its asynchronous fetch has settled.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (screen === "scores") loadScores(); }, [screen, loadScores]);

  /* ---------- ações ---------- */
  const startSingle = (diff: Difficulty, cont: boolean) => {
    music.ensure();
    setDifficulty(diff); setMode("single");
    setGameCfg({ seed: randomSeed(), continueSave: cont });
    setScreen("game");
  };
  const freshRestart = () => {
    engineRef.current?.saveClear();
    setGameCfg({ seed: randomSeed(), continueSave: false, mp: gameCfg?.mp });
    setGameState("cutscene");
    setSnap(null);
  };
  const mpCreate = async () => {
    setMpBusy(true); setMpError("");
    try {
      const res = await fetch("/api/mp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", difficulty }) });
      const data = await res.json();
      if (!data.ok) {
        setMpError(typeof data.error === "string" ? data.error : "Erro ao criar sala.");
        return;
      }
      setMode("multi");
      setGameCfg({ seed: data.seed, continueSave: false, mp: { code: data.code, playerId: uid() } });
      setMpCode(data.code);
      setScreen("game");
    } catch { setMpError("Erro ao criar sala. Verifique a conexão."); }
    finally { setMpBusy(false); }
  };
  const mpDoJoin = async () => {
    setMpBusy(true); setMpError("");
    try {
      const res = await fetch("/api/mp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", code: mpJoin }) });
      const data = await res.json();
      if (!data.ok) {
        setMpError(typeof data.error === "string" ? data.error : "Não foi possível entrar na sala.");
        return;
      }
      setMode("multi");
      setDifficulty(data.difficulty as Difficulty);
      setGameCfg({ seed: data.seed, continueSave: false, mp: { code: data.code, playerId: uid() } });
      setMpCode(data.code);
      setScreen("game");
    } catch { setMpError("Erro ao entrar na sala. Verifique a conexão."); }
    finally { setMpBusy(false); }
  };

  const patchSettings = (p: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      if (p.music !== undefined) music.setEnabled(p.music);
      if (p.musicVol !== undefined) music.setVolume(p.musicVol);
      if (p.voice !== undefined) music.setVoice(p.voice);
      return next;
    });
  };

  /* ---------- joystick ---------- */
  const joyHandle = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const js = joyState.current;
    if (phase === "down") {
      js.active = true; js.id = e.pointerId;
      js.cx = rect.left + rect.width / 2; js.cy = rect.top + rect.height / 2;
      el.setPointerCapture(e.pointerId);
    }
    if (!js.active || e.pointerId !== js.id) return;
    if (phase === "up") {
      js.active = false;
      setJoyKnob({ x: 0, y: 0 });
      engineRef.current?.setTouchMove(0, 0);
      return;
    }
    const dx = e.clientX - js.cx, dy = e.clientY - js.cy;
    const max = rect.width / 2;
    const len = Math.hypot(dx, dy);
    const cl = Math.min(1, len / max);
    const nx = len > 0 ? (dx / len) * cl : 0;
    const ny = len > 0 ? (dy / len) * cl : 0;
    setJoyKnob({ x: nx * max * 0.6, y: ny * max * 0.6 });
    engineRef.current?.setTouchMove(nx, ny);
  };

  const settingsPanel = showSettings ? (
    <SettingsModal settings={settings} onChange={patchSettings} onClose={() => setShowSettings(false)} audioOn={audioOn} />
  ) : null;

  /* ================= MENU ================= */
  if (screen === "menu") {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center px-4 py-8">
        <LobbyBackdrop art={settings.craftPix ? menuArt : ""} />
        <div className="relative z-10 flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div className="absolute inset-0 blur-3xl bg-amber-500/25 animate-breathe" />
            <h1 className="relative font-display text-[clamp(1.4rem,5vw,4.5rem)] tracking-[0.12em] text-balance text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700 drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] animate-title">
              {GAME_TITLE.toUpperCase()}
            </h1>
            <p className="font-display text-[10px] sm:text-sm md:text-base tracking-[0.18em] sm:tracking-[0.32em] text-emerald-200/90 mt-1 uppercase">{GAME_TAGLINE}</p>
            <div className="h-px w-40 mx-auto mt-3 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
          </div>

          <p className="text-[11px] sm:text-[13px] text-amber-100/80 italic animate-flicker">
            ♪ {GAME_TITLE}... {GAME_TAGLINE.toLowerCase()} ♪
          </p>

          <div className="w-full max-w-xs flex flex-col gap-2.5 mt-1">
            <label className="text-left text-[11px] uppercase tracking-widest text-slate-400 ml-1">Seu nome</label>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
              className="bg-slate-950/80 border border-amber-700/50 rounded-lg px-4 py-2.5 text-amber-100 outline-none focus:border-amber-400 text-center font-semibold"
            />
            <MenuBtn onClick={() => setScreen("difficulty")} primary><Icon name="play" size={17} /> Jogar sozinho</MenuBtn>
            <MenuBtn onClick={() => { setMpError(""); setScreen("mplobby"); }}><Icon name="users" size={17} /> Multiplayer (rede local)</MenuBtn>
            <MenuBtn onClick={() => setScreen("scores")}><Icon name="trophy" size={17} /> Melhores pontuações</MenuBtn>
            <MenuBtn onClick={() => setShowSettings(true)}><Icon name="settings" size={17} /> Configurações</MenuBtn>
            <MenuBtn onClick={() => setScreen("help")}><Icon name="help" size={17} /> Como jogar</MenuBtn>
          </div>
          <p className="text-[10px] text-slate-500 max-w-sm">
            {settings.music ? "Música ativada" : "Música desativada"} · {CONTROL_LABEL[settings.controls]}
            {audioOn ? "" : " · toque em qualquer lugar para ativar o áudio"}
          </p>
        </div>
        {settingsPanel}
      </div>
    );
  }

  if (screen === "difficulty") {
    const diffs: { d: Difficulty; icon: string; desc: string }[] = [
      { d: "dificil", icon: "🌲", desc: "As noites começam menores. Ao cair, perde parte dos recursos comuns e pode precisar reparar a base." },
      { d: "muito-dificil", icon: "🌑", desc: "Custos 2x e ataques mais fortes. A perda e os estragos aumentam com o tamanho da onda." },
      { d: "impossivel", icon: "💀", desc: "Custos 3,5x e criaturas colossais. A base pode ficar quase destruída; itens preciosos permanecem." },
    ];
    return (
      <Shell onBack={() => setScreen("menu")}>
        <h2 className="font-display text-3xl text-amber-300 text-center mb-1">Escolha seu destino</h2>
        <p className="text-xs text-slate-400 text-center mb-6">Cada dificuldade muda custos, ferocidade e punição de morte.</p>
        <div className="flex flex-col gap-4 w-full max-w-md px-4">
          {diffs.map(({ d, icon, desc }) => (
            <div key={d} className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 hover:border-amber-500 transition-colors">
              <span className="font-bold text-amber-200 text-lg">{icon} {DIFF_LABEL[d]}</span>
              <p className="text-xs text-slate-400 mb-3 mt-1">{desc}</p>
              <div className="flex gap-2">
                <button onClick={() => startSingle(d, false)}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg py-2 text-sm transition-colors cursor-pointer">
                  Novo jogo
                </button>
                {hasSave[d] && (
                  <button onClick={() => startSingle(d, true)}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg py-2 text-sm transition-colors cursor-pointer">
                    Continuar 💾
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {settingsPanel}
      </Shell>
    );
  }

  if (screen === "mplobby") {
    return (
      <Shell onBack={() => setScreen("menu")}>
        <h2 className="font-display text-3xl text-amber-300 text-center mb-2">Multiplayer — Rede Local</h2>
        <p className="text-xs text-slate-400 text-center max-w-md mb-6 px-4">
          Jogadores na mesma rede acessam este endereço no navegador e entram com o código.
          Todos veem a mesma ilha, se enxergam em tempo real e defendem a clareira juntos.
        </p>
        <div className="flex flex-col gap-4 w-full max-w-md px-4">
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <h3 className="font-bold text-amber-200 mb-2">Criar sala</h3>
            <div className="flex gap-2 mb-3">
              {(["dificil", "muito-dificil", "impossivel"] as Difficulty[]).map((d) => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold border transition-colors cursor-pointer ${difficulty === d ? "bg-amber-600 text-slate-950 border-amber-400" : "bg-slate-800 text-slate-300 border-slate-600"}`}>
                  {DIFF_LABEL[d]}
                </button>
              ))}
            </div>
            <MenuBtn onClick={mpCreate} primary disabled={mpBusy}>{mpBusy ? "Criando..." : "🏝️ Criar e jogar"}</MenuBtn>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <h3 className="font-bold text-amber-200 mb-2">Entrar com código</h3>
            <div className="flex gap-2">
              <input value={mpJoin} onChange={(e) => setMpJoin(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="ABC12"
                className="flex-1 bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-center font-mono text-xl tracking-[0.3em] text-amber-200 outline-none focus:border-amber-400" />
              <button onClick={mpDoJoin} disabled={mpBusy || mpJoin.length < 5}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold rounded-lg px-5 transition-colors cursor-pointer">
                Entrar
              </button>
            </div>
          </div>
          {mpError && <p className="text-red-400 text-sm text-center">{mpError}</p>}
        </div>
        {settingsPanel}
      </Shell>
    );
  }

  if (screen === "scores") {
    return (
      <Shell onBack={() => setScreen("menu")}>
        <h2 className="font-display text-3xl text-amber-300 text-center mb-6">🏆 Melhores pontuações</h2>
        <div className="w-full max-w-2xl px-4 overflow-x-auto">
          {scores.length === 0 ? (
            <p className="text-slate-400 text-center">Nenhuma pontuação ainda. Seja a primeira lenda da ilha!</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-amber-400/80 text-left border-b border-slate-700">
                  <th className="py-2 pr-2">#</th><th>Nome</th><th className="text-right">Pontos</th>
                  <th className="text-right hidden sm:table-cell">Dias</th>
                  <th className="text-right hidden sm:table-cell">Abates</th>
                  <th className="text-right">Modo</th><th className="text-right">Fim</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s, i) => (
                  <tr key={s.id} className={`border-b border-slate-800 ${i === 0 ? "text-amber-200" : "text-slate-300"}`}>
                    <td className="py-2 pr-2">{i === 0 ? "👑" : i + 1}</td>
                    <td className="font-semibold">{s.name}</td>
                    <td className="text-right font-mono">{s.score.toLocaleString("pt-BR")}</td>
                    <td className="text-right hidden sm:table-cell">{s.days}</td>
                    <td className="text-right hidden sm:table-cell">{s.kills}</td>
                    <td className="text-right text-xs">{DIFF_LABEL[s.difficulty as Difficulty] ?? s.difficulty}{s.mode === "multi" ? " 👥" : ""}</td>
                    <td className="text-right">{s.outcome === "vitoria" ? "⛵" : "☠️"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {settingsPanel}
      </Shell>
    );
  }

  if (screen === "help") {
    return (
      <Shell onBack={() => setScreen("menu")}>
        <h2 className="font-display text-3xl text-amber-300 text-center mb-6">Como jogar</h2>
        <div className="w-full max-w-xl px-4 flex flex-col gap-3 text-sm text-slate-300">
          {[
            ["🎯 Primeiros minutos", "Rian te leva do naufrágio até a clareira e abre um baú com um kit inicial. Depois: corte uma árvore, junte madeira e pedra, erga a fogueira, compre 2 pares de cercas e instale o portão. Fale com Rian (E) para repetir a dica."],
            ["📦 Baús e caça", "Há baús no naufrágio, no vilarejo, na caverna e na floresta sombria. Coelhos, gansos e cabras dão comida — mas os coelhos fogem!"],
            ["🧱 Como colocar estruturas", "Escolha no menu de construção e um fantasma verde/vermelho aparece à sua frente (ou sob o mouse). Encaixa na grade: cercas ficam alinhadas. J/clique confirma, ESC cancela. Depois de uma muralha, a próxima já fica pronta para colocar."],
            ["🌙 Noite e hordas", "Pequenos demônios (imps) vêm em bando e mordem forte; brutamontes e colossos são raros, lentos e devastadores. Eles avançam na sua cerca e no portão."],
            ["🚪 Portão e cerca", "O portão deixa você passar e pode ser aberto/fechado com E. Fechado, eles precisam quebrar. Se a cerca cair, eles entram e caçam você."],
            ["🔧 Reparo", "Perto de uma cerca danificada, E consome madeira e repara 45% da vida da estrutura. Reconstrua durante a batalha."],
            ["🪓 Ferramentas", "Ataque com J ou clique (esquema teclado+mouse). 1 machado · 2 picareta · 3 arma. No inventário, escolha espada ou arco; ambos usam o nível de combate. Ferro pede picareta nv.2, cristal nv.3."],
            ["🏗️ Base e reino", "Fogueira salva o jogo, bancada libera o resto, forja melhora armas, fazenda/serraria/pedreira produzem, casas aumentam a vida."],
            ["👥 Resgates e tarefas", "Sinais ! no mapa indicam sobreviventes. Ajude-os, converse para convidar e abra Pessoas no caderno (ou P). Arqueiro, maga e espadachim começam no nível 1: mande treinar na base e forje equipamentos com recursos. O minerador trabalha em uma pedreira."],
            ["🗺️ Mapa", "M abre o mapa com os lugares e a base pulsando em verde. À noite ele escurece: leia perto de fogo ou no vilarejo."],
            ["🎮 Controles", "Escolha em ⚙️ Configurações: teclado+mouse, só teclado (teclas na tela), controle ou toque. A sensitividade ajusta a câmera."],
            ["⛵ Fuga", "Junta recursos colossais, erga a balsa na praia e escape após o dia 14 — só após completar as missões-chave."],
          ].map(([t, d]) => (
            <div key={t} className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
              <span className="font-bold text-amber-200">{t}</span>
              <p className="text-xs text-slate-400 mt-1">{d}</p>
            </div>
          ))}
        </div>
        {settingsPanel}
      </Shell>
    );
  }

  /* ================= JOGO ================= */
  return (
    <div className="fixed inset-0 bg-slate-950 overflow-hidden select-none">
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />

      {snap?.underAttack && gameState === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-10 border-[6px] border-red-600/40 animate-alarm" />
      )}
      {snap?.recovery && gameState === "playing" && <div role="status" aria-live="polite" className="absolute top-[70px] left-1/2 -translate-x-1/2 z-30 w-[min(92vw,520px)] rounded-xl border border-amber-400/70 bg-slate-950/95 px-4 py-3 text-center text-amber-50 shadow-2xl pointer-events-none">
        <p className="font-bold text-base">{snap.recovery.waking ? "Você acorda ferido na base" : "Recupere suas forças"}</p>
        <p className="text-xs mt-1">Vida e energia estão baixas. {snap.recovery.report.destroyed} {snap.recovery.report.destroyed === 1 ? "estrutura destruída" : "estruturas destruídas"} e {snap.recovery.report.damaged} danificadas.</p>
        <p className="text-xs mt-1 text-amber-200">Perdeu {snap.recovery.report.percent}% dos recursos comuns; seus itens preciosos estão seguros.</p>
      </div>}

      {toast && !snap?.recovery && gameState !== "gameover" && gameState !== "victory" && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-toast max-w-[92vw]">
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl border-2 ${toast.who ? "bg-[#fbf6ea] border-[#2a2230] text-[#2a2230]" : "bg-slate-900/92 border-amber-600/60 text-amber-50"}`}>
            {toast.who && <Portrait who={toast.who} craftPix={settings.craftPix} />}
            <div className="min-w-0">
              {toast.who && <div className="font-display text-[11px] tracking-wider text-amber-700 uppercase leading-none mb-0.5">{toast.who === "rian" ? "Rian" : toast.who}</div>}
              <div className="font-ui text-[13px] leading-snug">{toast.text}</div>
            </div>
          </div>
        </div>
      )}

      {snap?.placing && gameState === "playing" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex flex-wrap justify-center items-center gap-2 bg-slate-950/95 border border-emerald-500/60 rounded-xl px-3 py-2 shadow-xl max-w-[min(96vw,760px)]">
          <span className={`w-2.5 h-2.5 rounded-full ${snap.placing.valid ? "bg-emerald-400" : "bg-red-500"}`} />
          <span className="font-ui text-xs text-slate-100">
            <b className="text-amber-200">{snap.placing.name}</b>
            {snap.placing.valid ? snap.placing.id === "wall" ? ` · ${snap.fencePieces} ${snap.fencePieces === 1 ? "peça" : "peças"} no círculo` : " · pronto para colocar" : ` · ${snap.placing.reason}`}
          </span>
          {(snap.placing.id === "wall" || snap.placing.id === "gate") ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => engineRef.current?.rotateFence(-1)} aria-label="Girar cerca à esquerda" className="rounded bg-amber-900/80 border border-amber-600 text-amber-100 w-9 h-9 font-bold cursor-pointer hover:bg-amber-700">←</button>
              <span className="text-[10px] text-amber-200 px-1 whitespace-nowrap">Seguir círculo</span>
              <button type="button" onClick={() => engineRef.current?.rotateFence(1)} aria-label="Girar cerca à direita" className="rounded bg-amber-900/80 border border-amber-600 text-amber-100 w-9 h-9 font-bold cursor-pointer hover:bg-amber-700">→</button>
            </div>
          ) : snap.placing.id !== "spike_trap" && snap.placing.id !== "barricade" && snap.placing.id !== "training" ? (
            <button type="button" onClick={() => engineRef.current?.rotateStructure(1)} className="px-2 py-2 rounded bg-amber-900/80 border border-amber-600 text-amber-100 text-[11px] font-bold cursor-pointer hover:bg-amber-700 flex items-center gap-1"><Icon name="rotate" size={14}/>{snap.placing.facing === "frente" ? "Virar de lado" : "Virar de frente"} · R</button>
          ) : null}
          <button type="button" onClick={() => engineRef.current?.confirmPlace()} disabled={!snap.placing.valid} className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"><Icon name="check" size={12} /> Colocar{snap.placing.id === "wall" ? ` ${snap.fencePieces}` : ""}</button>
          <button type="button" onClick={() => engineRef.current?.cancelPlace()} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer flex items-center gap-1"><Icon name="close" size={12} /> Sair</button>
        </div>
      )}

      {gameState === "playing" && (
        <>
          <div className="absolute top-16 left-3 flex flex-col gap-1.5 z-20">
            <HudBtn icon="pause" label="Pausa" onClick={() => engineRef.current?.togglePause()} />
            <HudBtn icon="map" label="Mapa" onClick={() => engineRef.current?.toggleMap()} />
            <HudBtn icon="quest" label="Missões" onClick={() => setShowQuests((v) => !v)} />
            <HudBtn icon="build" label="Construir" onClick={() => engineRef.current?.openPanel("build")} />
            <HudBtn icon="bag" label="Inventário · I" onClick={() => engineRef.current?.openPanel("inventory")} />
            <HudBtn icon="help" label="Bestiário e ruínas · N" onClick={() => engineRef.current?.openPanel("bestiary")} />
            <HudBtn icon="settings" label="Opções" onClick={() => setShowSettings(true)} />
            {snap?.tutorial && !showTutorial && <HudBtn icon="help" label="Mostrar tutorial" onClick={() => setShowTutorial(true)} />}
          </div>

          {snap?.tutorial && showTutorial && !snap.recovery && !showSettings && panel === "none" && (
            <div role="region" aria-label="Tutorial" className="absolute top-28 md:top-auto md:bottom-28 left-1/2 -translate-x-1/2 z-20 w-[min(92vw,560px)] pointer-events-none">
              <div className="bg-slate-950/90 border border-emerald-500/50 rounded-xl px-4 py-2.5 shadow-2xl animate-slide-up">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-300">Tutorial · {snap.tutorial.step}/{snap.tutorial.total}</span>
                  <button type="button" onClick={() => setShowTutorial(false)} className="pointer-events-auto text-xs font-bold text-slate-200 hover:text-white cursor-pointer" aria-label="Ocultar tutorial">Ocultar ✕</button>
                </div>
                <p className="font-bold text-amber-200 text-base mt-1">{snap.tutorial.title}</p>
                <p className="text-sm text-slate-100 leading-snug">{snap.tutorial.text}</p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {snap.tutorial.keys.map((k) => (
                    <kbd key={k} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-[10px] font-bold text-amber-100">{k}</kbd>
                  ))}
                </div>
              </div>
            </div>
          )}

          {settings.controls === "keyboard" && showKeys && snap && (
            <div role="group" aria-label="Atalhos do teclado" className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-10 hidden md:flex gap-1.5 text-[10px] text-slate-300 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-700 pointer-events-none">
              {snap.controlHints.map((h) => <span key={h} className="px-1">{h}</span>)}
              <button onClick={() => setShowKeys(false)} className="text-slate-500 hover:text-white cursor-pointer pointer-events-auto">✕</button>
            </div>
          )}
        </>
      )}

      {showQuests && gameState === "playing" && snap && (
        <div className="absolute left-16 top-20 w-72 max-w-[85vw] bg-slate-950/90 border border-slate-700 rounded-xl p-3 z-20 max-h-[50vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-amber-300 text-sm">🎯 Missões</h3>
            <button onClick={() => setShowQuests(false)} className="text-slate-500 hover:text-white cursor-pointer">✕</button>
          </div>
          {snap.quests.map((q) => (
            <div key={q.id} className={`mb-2 p-2 rounded-lg border ${q.done ? "border-emerald-800 bg-emerald-950/40" : "border-slate-800 bg-slate-900/60"}`}>
              <div className="flex justify-between text-xs font-bold">
                <span className={q.done ? "text-emerald-300" : "text-slate-200"}>{q.done ? "✅ " : ""}{q.name}</span>
                <span className="text-slate-400">{q.progress}/{q.target}</span>
              </div>
              <p className="text-[10px] text-slate-400">{q.desc}</p>
              <p className="text-[10px] text-amber-500/80">🎁 {q.reward}</p>
              <div className="h-1 bg-slate-800 rounded mt-1">
                <div className="h-1 bg-amber-500 rounded" style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} />
              </div>
            </div>
          ))}
          {snap.allies.length > 0 && <p className="text-[11px] text-slate-300 mt-2">👥 Aliados: {snap.allies.join(", ")}</p>}
        </div>
      )}

      {panel === "reference" && referenceScene && snap && <ReferenceRoom scene={referenceScene} craftPix={settings.craftPix} heroLevel={snap.tools.sword} single={mode === "single"} onClose={closeReference} onForge={forgeFromReference} />}
      {panel !== "none" && panel !== "reference" && snap && (
        <FieldJournal panel={panel} snap={snap} craftPix={settings.craftPix}
          onClose={() => engineRef.current?.closePanel()}
          onPanel={(next) => engineRef.current?.openPanel(next)}
          onReferenceForge={() => engineRef.current?.openReferenceScene("forge")}
          onBuild={(id) => engineRef.current?.build(id as never)}
          onUpgrade={(tool) => engineRef.current?.upgrade(tool)}
          onCraftEquipment={(id) => engineRef.current?.craftEquipment(id)}
          onFenceStyle={(style) => engineRef.current?.setFenceStyle(style)}
          onFenceRing={(ring) => engineRef.current?.setFenceRing(ring)}
          onDefenseTier={(tier) => engineRef.current?.setDefenseTier(tier)}
          onExpandTerritory={() => engineRef.current?.upgradeTerritory()}
          onTool={(tool) => { engineRef.current?.setTool(tool); engineRef.current?.emitSnapshot(); }}
          onCombatWeapon={(weapon) => engineRef.current?.setCombatWeapon(weapon)}
          onEat={() => { engineRef.current?.eatFood(); engineRef.current?.emitSnapshot(); }}
          onRianDuty={(duty) => engineRef.current?.setRianDuty(duty)}
          onSpecialistDuty={(id, duty) => engineRef.current?.setSpecialistDuty(id, duty)}
          onSpecialistUpgrade={(id) => engineRef.current?.upgradeSpecialist(id)}
        />
      )}

      {gameState === "paused" && (
        <Overlay>
          <h2 className="font-display text-4xl text-amber-300 mb-1">PAUSADO</h2>
          <p className="text-slate-400 text-sm mb-5">{settings.autoSave ? "Progresso salvo automaticamente 💾" : "Salvamento automático desativado"}{mode === "multi" ? ` · Sala ${mpCode}` : ""}</p>
          <div className="flex flex-col gap-2 w-60">
            <MenuBtn primary onClick={() => engineRef.current?.togglePause()}>▶️ Continuar</MenuBtn>
            <MenuBtn onClick={() => setShowSettings(true)}>⚙️ Configurações</MenuBtn>
            <MenuBtn onClick={() => { setScreen("menu"); setSnap(null); setGameState("cutscene"); }}>🏠 Menu principal</MenuBtn>
          </div>
          {snap && <QuickStats snap={snap} />}
        </Overlay>
      )}

      {(gameState === "gameover" || gameState === "victory") && snap && (
        <OutcomePanel won={gameState === "victory"} snap={snap}
          onRespawn={() => engineRef.current?.respawn()}
          onRestart={freshRestart}
          onScores={() => { setScreen("scores"); setGameState("cutscene"); }}
          onMenu={() => { setScreen("menu"); setSnap(null); setGameState("cutscene"); }} />
      )}

      {(isTouch || settings.controls === "touch") && settings.controls !== "keyboard" && settings.controls !== "gamepad" && (gameState === "playing" || gameState === "cutscene") && !showSettings && (
        <>
          <div
            ref={joyRef}
            onPointerDown={(e) => joyHandle(e, "down")}
            onPointerMove={(e) => joyHandle(e, "move")}
            onPointerUp={(e) => joyHandle(e, "up")}
            onPointerCancel={(e) => joyHandle(e, "up")}
            className="absolute left-4 bottom-44 w-32 h-32 rounded-full bg-white/5 border-2 border-white/15 z-20 touch-none"
          >
            <div className="absolute w-14 h-14 rounded-full bg-amber-400/30 border-2 border-amber-300/50 left-1/2 top-1/2"
              style={{ transform: `translate(calc(-50% + ${joyKnob.x}px), calc(-50% + ${joyKnob.y}px))` }} />
          </div>
          <div className="absolute right-4 bottom-24 z-20 grid grid-cols-2 gap-2.5">
            <TouchBtn icon="map" label="Mapa" small onDown={() => engineRef.current?.toggleMap()} />
            <TouchBtn icon="sword" label="Arma" small onDown={() => engineRef.current?.cycleTool(1)} />
            <TouchBtn icon="bag" label="Construir" small onDown={() => engineRef.current?.openPanel("build")} />
            <TouchBtn icon="food" label="Comer" small onDown={() => engineRef.current?.touchAction("eat")} />
            <TouchBtn icon="dash" label="Pular" onDown={() => engineRef.current?.touchAction("roll")} />
            <TouchBtn icon="hand" label="Usar" onDown={() => engineRef.current?.touchAction("interact")} />
            <TouchBtn icon="run" label="Correr" toggle active={runOn} onDown={() => { const v = !runOn; setRunOn(v); engineRef.current?.setTouchRun(v); }} />
            <TouchBtn icon="sword" label="Atacar" big onDown={() => engineRef.current?.touchAction("attack")} />
          </div>
        </>
      )}

      {settingsPanel}
    </div>
  );
}

/* ================= componentes ================= */

function LobbyBackdrop({ art = "" }: { art?: string }) {
  return (
    <div className="absolute inset-0 bg-menu overflow-hidden" aria-hidden="true">
      {art && <div className="absolute inset-0 lobby-art bg-center bg-cover" style={{ backgroundImage: `url("${art}")`, imageRendering: "pixelated" }} />}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/90" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-emerald-950/90 via-emerald-950/40 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/90 to-transparent" />
      <div className="absolute top-10 right-10 w-28 h-28 rounded-full bg-amber-300/20 blur-2xl animate-breathe" />
      <div className="absolute bottom-16 left-0 right-0 h-24 lobby-fog" />
      <div className="absolute bottom-14 left-0 right-0 h-40 opacity-80">
        <div className="tree-line" />
      </div>
      <div className="absolute inset-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="firefly" style={{ left: `${(i * 67) % 100}%`, top: `${18 + ((i * 37) % 62)}%`, animationDelay: `${i * 0.7}s`, animationDuration: `${6 + (i % 5)}s` }} />
        ))}
      </div>
      <div className="absolute inset-0">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className="leaf" style={{ left: `${(i * 29 + 6) % 100}%`, animationDelay: `${i * 1.9}s`, animationDuration: `${11 + (i % 4) * 3}s` }} />
        ))}
      </div>
      <div className="absolute top-16 left-0 right-0 flex justify-center opacity-60">
        <div className="text-2xl animate-glide">✈️</div>
      </div>
    </div>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="min-h-screen relative overflow-x-hidden text-slate-100 flex flex-col items-center justify-start pt-10 pb-16">
      <LobbyBackdrop />
      {onBack && (
        <button onClick={onBack} className="absolute top-4 left-4 text-slate-300 hover:text-amber-300 text-sm font-bold cursor-pointer z-20">
          ← Voltar
        </button>
      )}
      <div className="relative z-10 w-full flex flex-col items-center">{children}</div>
    </div>
  );
}

function MenuBtn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`menu-button ${primary ? "menu-button-primary" : ""}`}>

      {children}
    </button>
  );
}

function HudBtn({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className="group relative w-10 h-10 rounded-sm bg-[#5b3c2b]/95 border-2 border-[#b28b56] hover:border-[#f7df9b] text-[#f3dfad] hover:text-white cursor-pointer transition-colors flex items-center justify-center shadow-[inset_0_2px_0_#8a6340,0_3px_0_#30221e]">
      <Icon name={icon} size={20} />
      <span className="pointer-events-none absolute left-full ml-2 px-2 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-[10px] font-ui text-slate-100 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">{label}</span>
    </button>
  );
}

function Portrait({ who, craftPix }: { who: string; craftPix: boolean }) {
  const [url, setUrl] = useState<string>("");
  // Portraits are generated with a browser canvas, unavailable during SSR.
  useEffect(() => {
    const refresh = () => { try { setUrl(getPortraitUrl(who, craftPix)); } catch { setUrl(""); } };
    refresh();
    window.addEventListener("craftpix-ready", refresh);
    return () => window.removeEventListener("craftpix-ready", refresh);
  }, [who, craftPix]);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" width={44} height={36} className="shrink-0 rounded-md border-2 border-[#2a2230] bg-[#86ad4f]" style={{ imageRendering: "pixelated" }} />;
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-slate-950/95 border border-amber-800/60 rounded-2xl p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-display text-xl text-amber-300">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl cursor-pointer px-2">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Overlay({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center ${dark ? "bg-black/80" : "bg-slate-950/80"} backdrop-blur-sm p-4`}>
      {children}
    </div>
  );
}

function QuickStats({ snap }: { snap: Snapshot }) {
  return (
    <div className="mt-5 text-xs text-slate-400 flex gap-4 flex-wrap justify-center">
      <span>📅 Dia {snap.day}</span>
      <span>💀 {snap.kills} abates</span>
      <span>🏕️ Base nv.{snap.baseLevel}</span>
      <span>🧱 {snap.walls} cercas</span>
      <span>🚪 {snap.gateState}</span>
      <span>🪓{snap.tools.axe} ⛏️{snap.tools.pick} ⚔️{snap.tools.sword}</span>
      {snap.teamScore > 0 && <span>👥 Equipe: {snap.teamScore.toLocaleString("pt-BR")}</span>}
    </div>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} className="flex items-center justify-between gap-3 py-2 text-left cursor-pointer w-full">
      <span>
        <span className="text-sm text-slate-200">{label}</span>
        {desc && <span className="block text-[10px] text-slate-500">{desc}</span>}
      </span>
      <span className={`w-11 h-6 rounded-full border transition-colors shrink-0 ${on ? "bg-emerald-600 border-emerald-400" : "bg-slate-700 border-slate-500"}`}>
        <span className={`block w-4.5 h-4.5 rounded-full bg-white mt-0.5 transition-transform ${on ? "translate-x-6" : "translate-x-0.5"}`} style={{ width: 18, height: 18 }} />
      </span>
    </button>
  );
}

function SettingsModal({ settings, onChange, onClose, audioOn }: { settings: GameSettings; onChange: (p: Partial<GameSettings>) => void; onClose: () => void; audioOn: boolean }) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Configurações" onClick={(e) => e.stopPropagation()} className="bg-slate-950 border border-amber-700/60 rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto p-4 shadow-2xl">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-display text-xl text-amber-300">⚙️ Configurações</h3>
          <button onClick={onClose} aria-label="Fechar configurações" className="text-slate-400 hover:text-white text-xl cursor-pointer px-2">✕</button>
        </div>

        <section className="border-t border-slate-800 py-2">
          <h4 className="text-[11px] uppercase tracking-widest text-amber-500 mb-1">Tela</h4>
          <Toggle label="Tela cheia" desc={settings.fullscreen ? "Modo tela cheia" : "Modo janela"} on={settings.fullscreen} onChange={(v) => onChange({ fullscreen: v })} />
          <Toggle label="Mostrar contador de FPS" on={settings.showFps} onChange={(v) => onChange({ showFps: v })} />
          <label className="block text-sm text-slate-200 mt-2 mb-1">Quantidade de FPS</label>
          <div className="grid grid-cols-4 gap-1">
            {([30, 60, 90, 120, 144, 165, 240, 0] as FpsCap[]).map((f) => (
              <button key={f} onClick={() => onChange({ fpsCap: f })} aria-label={f === 0 ? "FPS sem limite" : `${f} FPS`} aria-pressed={settings.fpsCap === f}
                className={`py-1.5 rounded text-xs font-bold border cursor-pointer ${settings.fpsCap === f ? "bg-amber-500 text-slate-950 border-amber-300" : "bg-slate-800 border-slate-600 text-slate-200"}`}>
                {f === 0 ? "∞" : f}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Sem limite permite acompanhar telas acima de 120 Hz. O FPS depende da tela, do navegador e do aparelho.</p>
          <label className="block text-sm text-slate-200 mt-3 mb-1">Qualidade gráfica</label>
          <div className="grid grid-cols-3 gap-1">
            {(["leve", "auto", "alta"] as Quality[]).map((q) => (
              <button key={q} onClick={() => onChange({ quality: q })}
                className={`py-1.5 rounded text-xs font-bold border capitalize cursor-pointer ${settings.quality === q ? "bg-amber-500 text-slate-950 border-amber-300" : "bg-slate-800 border-slate-600 text-slate-200"}`}>
                {q}
              </button>
            ))}
          </div>
          <Toggle label="Movimento das árvores" desc="Balanço das copas e folhas ao vento; desative para reduzir movimento" on={settings.treeMotion} onChange={(v) => onChange({ treeMotion: v })} />
          <Toggle label="Artes CraftPix e referências" desc="Usa os pacotes CraftPix e referências locais quando disponíveis; desative para voltar ao visual anterior" on={settings.craftPix} onChange={(v) => onChange({ craftPix: v })} />
        </section>

        <section className="border-t border-slate-800 py-2">
          <h4 className="text-[11px] uppercase tracking-widest text-amber-500 mb-1">Progresso</h4>
          <Toggle label="Salvar progresso (gravado)" desc={settings.autoSave ? "Salva automaticamente e na fogueira" : "Nada é gravado neste navegador"} on={settings.autoSave} onChange={(v) => onChange({ autoSave: v })} />
        </section>

        <section className="border-t border-slate-800 py-2">
          <h4 className="text-[11px] uppercase tracking-widest text-amber-500 mb-1">Controle</h4>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(CONTROL_LABEL) as ControlScheme[]).map((c) => (
              <button key={c} onClick={() => onChange({ controls: c })}
                className={`py-2 px-2 rounded text-[11px] font-bold border text-left cursor-pointer ${settings.controls === c ? "bg-amber-500 text-slate-950 border-amber-300" : "bg-slate-800 border-slate-600 text-slate-200"}`}>
                {CONTROL_LABEL[c]}
              </button>
            ))}
          </div>
          <label className="block text-sm text-slate-200 mt-3">Sensibilidade da câmera: <span className="text-amber-300 font-bold">{settings.sensitivity.toFixed(1)}x</span></label>
          <input type="range" min={0.4} max={2} step={0.1} value={settings.sensitivity}
            onChange={(e) => onChange({ sensitivity: Number(e.target.value) })}
            className="w-full accent-amber-500" />
        </section>

        <section className="border-t border-slate-800 py-2">
          <h4 className="text-[11px] uppercase tracking-widest text-amber-500 mb-1">Áudio</h4>
          <Toggle label="Música" desc={audioOn ? "Trilha ambiente ativa" : "Toque para ativar o áudio"} on={settings.music} onChange={(v) => onChange({ music: v })} />
          <label className="block text-xs text-slate-200 mt-2">Volume da música</label>
          <input type="range" min={0} max={1} step={0.05} value={settings.musicVol}
            onChange={(e) => onChange({ musicVol: Number(e.target.value) })} className="w-full accent-amber-500" />
          <label className="block text-xs text-slate-200 mt-2">Volume dos efeitos</label>
          <input type="range" min={0} max={1} step={0.05} value={settings.sfxVol}
            onChange={(e) => onChange({ sfxVol: Number(e.target.value) })} className="w-full accent-amber-500" />
          <Toggle label="Sons das criaturas" desc="Chamados de animais e monstros próximos" on={settings.creatureSounds} onChange={(v) => onChange({ creatureSounds: v })} />
          <Toggle label="Som do vento" desc="Rajadas durante a exploração" on={settings.windSounds} onChange={(v) => onChange({ windSounds: v })} />
          <Toggle label="Riachos e fogueiras" desc="Água e fogo audíveis quando você se aproxima" on={settings.ambientSounds} onChange={(v) => onChange({ ambientSounds: v })} />
          <Toggle label="Voz do tema no lobby" desc="Narra o tema do jogo no menu" on={settings.voice} onChange={(v) => onChange({ voice: v })} />
        </section>

        <button onClick={onClose} className="mt-3 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg py-2 cursor-pointer">
          Pronto
        </button>
      </div>
    </div>
  );
}

function TouchBtn({ icon, label, onDown, big, small, toggle, active }: { icon: IconName; label: string; onDown: () => void; big?: boolean; small?: boolean; toggle?: boolean; active?: boolean }) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const px = big ? 76 : small ? 50 : 58;
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
        if (big && !toggle) holdRef.current = setInterval(onDown, 300);
      }}
      onPointerUp={() => { if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; } }}
      onPointerLeave={() => { if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; } }}
      className={`rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 select-none touch-none transition-transform active:scale-90 shadow-[0_3px_0_#0b0810] ${
        active ? "bg-amber-500/60 border-amber-300 text-slate-950" : big ? "bg-[#7a2437]/85 border-[#ff8a9a] text-amber-50" : "bg-[#17131f]/85 border-[#4a3b2a] text-amber-100"
      }`}
      style={{ width: px, height: px }}
    >
      <Icon name={icon} size={big ? 30 : small ? 18 : 22} />
      <span className="font-ui text-[9px] font-bold leading-none opacity-90">{label}</span>
    </button>
  );
}
