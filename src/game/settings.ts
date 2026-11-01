export type ControlScheme = "kb-mouse" | "keyboard" | "gamepad" | "touch";
export type FpsCap = 0 | 30 | 60 | 90 | 120 | 144 | 165 | 240;
export type Quality = "auto" | "alta" | "leve";

export interface GameSettings {
  fullscreen: boolean;
  fpsCap: FpsCap;
  showFps: boolean;
  autoSave: boolean;
  controls: ControlScheme;
  music: boolean;
  musicVol: number;
  sfxVol: number;
  voice: boolean;
  sensitivity: number;
  quality: Quality;
  treeMotion: boolean;
  creatureSounds: boolean;
  windSounds: boolean;
  ambientSounds: boolean;
  craftPix: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  fullscreen: false,
  fpsCap: 0,
  showFps: true,
  autoSave: true,
  controls: "kb-mouse",
  music: true,
  musicVol: 0.35,
  sfxVol: 0.7,
  voice: true,
  sensitivity: 1,
  quality: "auto",
  treeMotion: true,
  creatureSounds: true,
  windSounds: true,
  ambientSounds: true,
  craftPix: true,
};

export const SETTINGS_KEY = "umbra-settings-v1";

export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const CONTROL_LABEL: Record<ControlScheme, string> = {
  "kb-mouse": "Teclado + Mouse",
  keyboard: "Só teclado (teclas na tela)",
  gamepad: "Controle (gamepad)",
  touch: "Toque (celular)",
};

export async function applyFullscreen(on: boolean) {
  try {
    if (on && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* usuário negou */
  }
}
