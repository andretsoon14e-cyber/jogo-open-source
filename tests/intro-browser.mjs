import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Exercise the actual Next.js UI, including the initial gesture and Web Audio.
// Optional licensed CraftPix files are only required when STORY_WITH_ART=1.
const baseURL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const withArt = process.env.STORY_WITH_ART === "1";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=user-gesture-required"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const errors = [];

async function makePage(mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    isMobile: mobile, hasTouch: mobile,
  });
  const page = await context.newPage(), requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes("/craftpix/") || url.pathname.includes("intro-explosion")) requests.push([url.pathname, response.status()]);
    if (url.pathname.includes("intro-explosion") && response.status() >= 400) errors.push(`${response.status()} ${url.pathname}`);
  });
  await page.addInitScript(({ mobile, withArt }) => {
    localStorage.setItem("umbra-settings-v1", JSON.stringify({
      music: false, voice: false, sfxVol: 0.7, craftPix: withArt,
      controls: mobile ? "touch" : "keyboard", fpsCap: 120,
    }));
    window.__blast = [];
    window.__analysers = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...rest) {
      if (destination === this.context.destination && this instanceof GainNode && !this.__monitored) {
        this.__monitored = true;
        const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
        connect.call(this, analyser); window.__analysers.push(analyser);
      }
      return connect.call(this, destination, ...rest);
    };
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer && this.buffer.duration > 2.1 && this.buffer.duration < 2.4) {
        const event = { source: this, state: this.context.state, duration: this.buffer.duration, peak: 0, stopped: false };
        window.__blast.push(event);
        const sample = () => {
          for (const analyser of window.__analysers) {
            const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
            const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
            event.peak = Math.max(event.peak, rms);
          }
        };
        for (let i = 1; i <= 25; i++) setTimeout(sample, i * 20);
      }
      return start.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      const event = window.__blast.find((entry) => entry.source === this);
      if (event) event.stopped = true;
      return stop.apply(this, args);
    };
  }, { mobile, withArt });
  return { context, page, requests };
}

async function startNew(page) {
  await page.goto(baseURL);
  if (withArt) {
    await page.getByRole("button", { name: "Configurações" }).click();
    const settings = page.getByRole("dialog", { name: "Configurações" });
    await settings.getByText("Personagem clássico instalado.").waitFor();
    await settings.getByRole("button", { name: "Pronto" }).click();
  }
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Novo jogo" }).first().click();
  await page.getByRole("button", { name: /Pular introdução/ }).waitFor();
}

try {
  const withoutArt = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const noArtPage = await withoutArt.newPage();
  noArtPage.on("pageerror", (error) => errors.push(error.message));
  await noArtPage.route("**/craftpix/**", (route) => route.fulfill({ status: 404, body: "" }));
  await noArtPage.addInitScript(() => localStorage.setItem("umbra-settings-v1", JSON.stringify({ craftPix: true, music: false, voice: false })));
  try {
    await noArtPage.goto(baseURL);
    await noArtPage.getByRole("button", { name: "Configurações" }).click();
    await noArtPage.getByText(/Personagem clássico não instalado neste servidor/).waitFor();
    await noArtPage.getByRole("button", { name: "Pronto" }).click();
    await noArtPage.getByRole("button", { name: "Jogar sozinho" }).click();
    await noArtPage.getByRole("button", { name: "Novo jogo" }).first().click();
    await noArtPage.getByRole("button", { name: /Pular introdução/ }).click();
    await noArtPage.getByRole("button", { name: "Inventário · I" }).waitFor();
  } finally { await withoutArt.close(); }

  const desktop = await makePage();
  try {
    await startNew(desktop.page);
    // No additional gesture: the click on "Novo jogo" must unlock effects
    // even though music was disabled before starting.
    await desktop.page.waitForFunction(() => window.__blast.length === 1, null, { timeout: 20000 });
    await desktop.page.waitForTimeout(450);
    const blast = await desktop.page.evaluate(() => {
      const { state, duration, peak } = window.__blast[0]; return { state, duration, peak, count: window.__blast.length };
    });
    assert.equal(blast.state, "running", "efeitos foram liberados pelo gesto inicial");
    assert.ok(blast.duration > 2.1 && blast.duration < 2.4, "explosão real foi decodificada");
    assert.ok(blast.peak > 0.0001 && blast.peak < 0.5, `áudio audível e controlado: ${blast.peak}`);
    if (process.env.INTRO_EXPLOSION_SCREENSHOT) await desktop.page.screenshot({ path: process.env.INTRO_EXPLOSION_SCREENSHOT });
    await desktop.page.waitForTimeout(2700);
    if (process.env.INTRO_ARRIVAL_SCREENSHOT) await desktop.page.screenshot({ path: process.env.INTRO_ARRIVAL_SCREENSHOT });
    await desktop.page.waitForTimeout(1500);
    if (process.env.INTRO_BEACH_SCREENSHOT) await desktop.page.screenshot({ path: process.env.INTRO_BEACH_SCREENSHOT });
    assert.equal(await desktop.page.evaluate(() => window.__blast.length), 1, "a explosão só toca uma vez");
    assert.ok(desktop.requests.some(([path, status]) => path === "/effects/intro-explosion.png" && status === 200));
    assert.ok(desktop.requests.some(([path, status]) => path === "/audio/intro-explosion.mp3" && status === 200));
    if (withArt) for (const name of ["manifest.json", "hero-1.png", "hero-2.png", "hero-3.png"]) {
      assert.ok(desktop.requests.some(([path, status]) => path === `/craftpix/${name}` && status === 200), `visual antigo não carregou: ${name}`);
    }
    await desktop.page.getByRole("button", { name: /Pular introdução/ }).click();
    await desktop.page.getByRole("button", { name: "Inventário · I" }).waitFor();
    await desktop.page.waitForTimeout(400);
    if (process.env.INTRO_WORLD_SCREENSHOT) await desktop.page.screenshot({ path: process.env.INTRO_WORLD_SCREENSHOT });
  } finally { await desktop.context.close(); }

  const skipped = await makePage();
  try {
    await startNew(skipped.page);
    await skipped.page.waitForFunction(() => window.__blast.length === 1, null, { timeout: 20000 });
    await skipped.page.getByRole("button", { name: /Pular introdução/ }).click();
    await skipped.page.getByRole("button", { name: "Inventário · I" }).waitFor();
    assert.equal(await skipped.page.evaluate(() => window.__blast[0].stopped), true, "pular durante a explosão interrompe o som");
    await skipped.page.waitForTimeout(250);
    assert.equal(await skipped.page.evaluate(() => window.__blast.length), 1, "nenhuma amostra atrasada toca depois de pular");
  } finally { await skipped.context.close(); }

  const phone = await makePage(true);
  try {
    await startNew(phone.page);
    assert.equal(await phone.page.getByRole("button", { name: "Atacar" }).count(), 0, "controles não escondem a cutscene");
    await phone.page.waitForFunction(() => window.__blast.length === 1, null, { timeout: 20000 });
    await phone.page.waitForTimeout(400);
    if (process.env.INTRO_MOBILE_EXPLOSION_SCREENSHOT) await phone.page.screenshot({ path: process.env.INTRO_MOBILE_EXPLOSION_SCREENSHOT });
    await phone.page.waitForTimeout(4200);
    if (process.env.INTRO_MOBILE_BEACH_SCREENSHOT) await phone.page.screenshot({ path: process.env.INTRO_MOBILE_BEACH_SCREENSHOT });
    await phone.page.getByRole("button", { name: /Pular introdução/ }).tap();
    await phone.page.getByRole("button", { name: "Atacar" }).waitFor();
    await phone.page.waitForTimeout(400);
    if (process.env.INTRO_MOBILE_WORLD_SCREENSHOT) await phone.page.screenshot({ path: process.env.INTRO_MOBILE_WORLD_SCREENSHOT });
  } finally { await phone.context.close(); }
  assert.deepEqual(errors, []);
  console.log("Introdução: amostra audível, música desligada, skip, visual clássico e telas desktop/celular OK.");
} finally { await browser.close(); }
