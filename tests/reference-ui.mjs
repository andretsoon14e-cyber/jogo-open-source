import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
const scene = await sharp({ create: { width: 960, height: 517, channels: 4, background: "#4a6f55" } }).png().toBuffer();
const chapelScene = await sharp({ create: { width: 960, height: 640, channels: 4, background: "#4a6f55" } }).png().toBuffer();
const sizes = { archer: [768, 1152], forge: [260, 210], house: [220, 250], chest: [100, 82], chapel: [240, 294], market: [200, 176], camp: [200, 200], sewer: [200, 87] };
const images = {};
for (const [name, [width, height]] of Object.entries(sizes)) images[name] = await sharp({ create: { width, height, channels: 4, background: "#6c924b" } }).png().toBuffer();
const manifest = JSON.stringify({ version: 1, archer: true, objects: { forge: true, house: true, chest: true, chapel: true, market: true, camp: true, sewer: true }, scenes: { forge: true, chapel: true, market: true, camp: true, sewer: true } });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
function saveAt(x, y, structures = []) {
  return { v: 2, seed: 77, px: x, py: y, hp: 100, maxHp: 100, inv: { wood: 200, stone: 200, fiber: 100, food: 8, iron: 60, crystal: 30 }, tools: { axe: 2, pick: 2, sword: 2 }, time: 280, day: 1, score: 720, kills: 20, deaths: 0, structures, questP: [60, 20, 1, 20, 0, 2, 0], questDone: [true, true, false, false, false, false, false], allies: ["rian", "maya", "archer"], visited: [], nodeHp: [], chests: [true, true, true, true, true], escortDone: true, equipment: { harness: true, coat: false, charm: false } };
}
async function contextFor(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.route("**/referencias/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    if (name === "manifest.json") return route.fulfill({ status: 200, contentType: "application/json", body: manifest });
    if (name.startsWith("scene-")) return route.fulfill({ status: 200, contentType: "image/png", body: name === "scene-chapel.png" ? chapelScene : scene });
    const key = name.replace(/\.png$/, "");
    return images[key] ? route.fulfill({ status: 200, contentType: "image/png", body: images[key] }) : route.fulfill({ status: 404, body: "" });
  });
  await context.addInitScript((touch) => {
    localStorage.setItem("umbra-settings-v1", JSON.stringify({ music: false, voice: false, controls: touch ? "touch" : "keyboard", quality: "auto", craftPix: true }));
    window.__referenceReady = false;
    window.addEventListener("reference-art-ready", () => { window.__referenceReady = true; });
  }, mobile);
  return context;
}
async function openSave(page, save) {
  await page.goto(base);
  await page.evaluate((data) => localStorage.setItem("ilha-save-dificil-single", JSON.stringify(data)), save);
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByRole("button", { name: "Inventário · I" }).waitFor();
  await page.waitForFunction(() => window.__referenceReady === true);
}
const errors = [];
try {
  const context = await contextFor({ width: 1280, height: 800 });
  const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
  const locations = [
    ["Mercado", 58 * 32 + 220, 122 * 32 + 35 + 45],
    ["Capela", 58 * 32 + 145, 122 * 32 - 200 + 45],
    ["Acampamento", 104 * 32 - 130, 88 * 32 - 120 + 45],
    ["Esgoto", 98 * 32 + 160, 30 * 32 + 195 + 45],
  ];
  for (const [name, x, y] of locations) {
    await openSave(page, saveAt(x, y));
    await page.keyboard.press("e");
    const dialog = page.getByRole("dialog", { name: `${name} — ambiente de referência` });
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="reference-room"]')?.width === 960);
    const room = dialog.locator("canvas");
    const before = await room.evaluate((canvas) => canvas.toDataURL());
    const worldBefore = await page.locator("canvas").first().evaluate((canvas) => canvas.toDataURL());
    await page.keyboard.down("ArrowUp"); await page.waitForTimeout(350); await page.keyboard.up("ArrowUp");
    const after = await room.evaluate((canvas) => canvas.toDataURL());
    const worldAfter = await page.locator("canvas").first().evaluate((canvas) => canvas.toDataURL());
    assert.notEqual(after, before, `${name}: personagem não andou`);
    assert.equal(worldAfter, worldBefore, `${name}: canvas do mundo pausado foi redesenhado`);
    if (name === "Mercado") {
      await page.evaluate(() => {
        window.__pad = { axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
        Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [window.__pad] });
      });
      await page.waitForTimeout(80);
      const beforePad = await room.evaluate((canvas) => canvas.toDataURL());
      await page.evaluate(() => { window.__pad.axes[0] = 1; }); await page.waitForTimeout(350);
      assert.notEqual(await room.evaluate((canvas) => canvas.toDataURL()), beforePad, "analógico não moveu o personagem");
      await page.evaluate(() => { window.__pad.axes[0] = 0; window.__pad.buttons[1].pressed = true; });
      await dialog.waitFor({ state: "detached" });
      await page.evaluate(() => { delete navigator.getGamepads; });
    } else await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0, `${name}: saída não fechou a visita`);
  }
  const forge = { type: "forge", x: 104 * 32 + 35, y: 88 * 32, hp: 10000, open: false, rotation: 0 };
  await openSave(page, saveAt(104 * 32, 88 * 32, [forge]));
  await page.keyboard.press("e");
  let journal = page.getByRole("dialog", { name: "Forja & melhorias" }); await journal.waitFor();
  await journal.getByRole("button", { name: "Visitar interior da forja" }).click();
  const room = page.getByRole("dialog", { name: "Forja — ambiente de referência" }); await room.waitFor();
  await room.getByRole("button", { name: "Forjar · E" }).click();
  journal = page.getByRole("dialog", { name: "Forja & melhorias" }); await journal.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await journal.count(), 0);
  const development = [
    { type: "workbench", x: 104 * 32 - 80, y: 88 * 32 + 80, hp: 300, open: false, rotation: 0 },
    { type: "campfire", x: 104 * 32 + 80, y: 88 * 32 + 80, hp: 300, open: false, rotation: 0 },
    { type: "farm", x: 104 * 32, y: 88 * 32 + 130, hp: 300, open: false, rotation: 0 },
  ];
  await openSave(page, saveAt(104 * 32, 88 * 32, development));
  await page.getByRole("button", { name: "Construir", exact: true }).first().click();
  const workshop = page.getByRole("dialog", { name: "Oficina da Clareira" }); await workshop.waitFor();
  const expansion = workshop.getByRole("region", { name: "Expansão do território" });
  assert.match(await expansion.textContent(), /Território 1\/4/);
  await expansion.getByRole("button", { name: "Ampliar território" }).click();
  assert.match(await expansion.textContent(), /Território 2\/4/);
  await workshop.getByTitle("Cerca dupla").click();
  const rings = workshop.getByRole("group", { name: "Escolher perímetro" });
  assert.equal(await rings.getByRole("button", { name: "Anel 2" }).getAttribute("aria-pressed"), "true");
  await rings.getByRole("button", { name: "Anel 1" }).click();
  assert.equal(await rings.getByRole("button", { name: "Anel 1" }).getAttribute("aria-pressed"), "true");
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("ilha-save-dificil-single")));
  assert.equal(persisted.territoryLevel, 2); assert.equal(persisted.fenceRing, 1);
  await workshop.getByRole("button", { name: "Pessoas" }).click();
  const people = page.getByRole("dialog", { name: "Pessoas & tarefas" }); await people.waitFor();
  const archer = people.getByRole("article", { name: "Arqueiro" });
  await archer.getByRole("button", { name: "Treinar" }).click();
  assert.equal(await archer.getByRole("button", { name: "Treinar" }).getAttribute("aria-pressed"), "true");
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("ilha-save-dificil-single")))).specialists.archer.duty, "train");
  // Reload a pending death and verify the recovery report is not obscured by
  // the duplicate toast when the player wakes up.
  const report = { lost: { wood: 20 }, percent: 20, pressure: 8, damaged: 2, destroyed: 1 };
  await page.goto(base);
  await page.evaluate((data) => localStorage.setItem("ilha-save-dificil-single", JSON.stringify(data)), { ...saveAt(104 * 32, 88 * 32), hp: 0, pendingRespawn: true, deathReport: report });
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Continuar" }).first().click();
  const outcome = page.getByRole("dialog", { name: "Fim da partida" }); await outcome.waitFor();
  await outcome.getByRole("button", { name: "Renascer na fogueira" }).click();
  const recovery = page.getByRole("status"); await recovery.waitFor();
  assert.match(await recovery.textContent(), /1 estrutura destruída e 2 danificadas/);
  assert.equal(await page.getByText("Você acordou ferido na base. Reúna forças e repare os estragos.").count(), 0, "aviso não deve cobrir o relatório");
  await context.close();

  const phoneContext = await contextFor({ width: 320, height: 568 }, true);
  const phone = await phoneContext.newPage(); phone.on("pageerror", (error) => errors.push(error.message));
  await openSave(phone, saveAt(locations[0][1], locations[0][2]));
  await phone.getByRole("button", { name: "Usar" }).click();
  const phoneDialog = phone.getByRole("dialog", { name: "Mercado — ambiente de referência" }); await phoneDialog.waitFor();
  assert.equal(await phoneDialog.evaluate((el) => el.scrollWidth > el.clientWidth + 2), false, "ambiente transborda no celular");
  await phone.waitForFunction(() => document.querySelector('[data-testid="reference-room"]')?.width === 960);
  const phoneCanvas = phoneDialog.locator("canvas"), initial = await phoneCanvas.evaluate((canvas) => canvas.toDataURL());
  const button = phoneDialog.getByRole("button", { name: "Mover para cima" });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  const client = await phoneContext.newCDPSession(phone);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await phone.waitForTimeout(350);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.notEqual(await phoneCanvas.evaluate((canvas) => canvas.toDataURL()), initial, "botão de toque não moveu o personagem");
  await phoneDialog.getByRole("button", { name: /Sair/ }).click();
  assert.equal(await phoneDialog.count(), 0);
  await openSave(phone, saveAt(104 * 32, 88 * 32, development));
  await phone.getByRole("button", { name: "Construir", exact: true }).first().click();
  const phoneWorkshop = phone.getByRole("dialog", { name: "Oficina da Clareira" }); await phoneWorkshop.waitFor();
  const phoneExpansion = phoneWorkshop.getByRole("region", { name: "Expansão do território" });
  const overflow = await phoneWorkshop.evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth, children: [...el.querySelectorAll("*")].map((child) => ({ tag: child.tagName, cls: child.className, width: Math.round(child.getBoundingClientRect().width), right: Math.round(child.getBoundingClientRect().right), scroll: child.scrollWidth })).filter((child) => child.right > el.getBoundingClientRect().right + 2).slice(0, 20) }));
  assert.equal(overflow.scroll > overflow.client + 2, false, `oficina transborda no celular: ${JSON.stringify(overflow)}`);
  await phoneExpansion.getByRole("button", { name: "Ampliar território" }).click();
  assert.match(await phoneExpansion.textContent(), /Território 2\/4/);
  await phoneWorkshop.getByTitle("Cerca dupla").click();
  assert.equal(await phoneWorkshop.getByRole("button", { name: "Anel 2" }).getAttribute("aria-pressed"), "true");
  await phoneWorkshop.getByRole("button", { name: "Pessoas" }).click();
  const phonePeople = phone.getByRole("dialog", { name: "Pessoas & tarefas" }); await phonePeople.waitFor();
  assert.equal(await phonePeople.evaluate((el) => el.scrollWidth > el.clientWidth + 2), false, "painel de pessoas transborda no celular");
  const phoneArcher = phonePeople.getByRole("article", { name: "Arqueiro" });
  await phoneArcher.getByRole("button", { name: "Defender base" }).click();
  assert.equal(await phoneArcher.getByRole("button", { name: "Defender base" }).getAttribute("aria-pressed"), "true");
  await phoneContext.close();
  assert.deepEqual(errors, []);
  console.log("OK: visitas às cinco cenas, forja, pausa, teclado e tela pequena com toque.");
} finally { await browser.close(); }
