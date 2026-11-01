import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const baseURL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const settings = { music: false, voice: false, controls: "keyboard", craftPix: process.env.INVENTORY_WITH_ART === "1", fpsCap: 120 };
// Start empty beside Rian's unopened chest; no items are granted by the fixture.
const save = {
  v: 2, seed: 77, px: 104 * 32 + 65, py: 88 * 32 - 40, hp: 100, maxHp: 100,
  inv: { wood: 0, stone: 0, fiber: 0, food: 0, iron: 0, crystal: 0 },
  tools: { axe: 1, pick: 1, sword: 1 }, time: 280, day: 1, score: 0, kills: 0, deaths: 0,
  structures: [], questP: [0, 0, 0, 0, 0, 0, 0], questDone: [false, false, false, false, false, false, false],
  allies: ["rian"], visited: [], nodeHp: [], chests: [false, false, false, false, false], escortDone: true,
  equipment: { harness: true, coat: false, charm: false }, territoryLayout: "compact",
};
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const errors = [];
const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript((value) => localStorage.setItem("umbra-settings-v1", JSON.stringify(value)), settings);
const bag = () => page.getByRole("dialog", { name: "Mochila & equipamento" });
const resources = () => bag().getByRole("list", { name: "Recursos na mochila" });
async function openBag() { await page.keyboard.press("i"); await bag().waitFor(); }
async function resumeGame() {
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByRole("button", { name: "Inventário · I" }).waitFor();
  await page.waitForTimeout(500);
}
try {
  // A genuinely new game starts without any resource icons or zero counters.
  await page.goto(baseURL);
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Novo jogo" }).first().click();
  await page.locator("canvas").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Inventário · I" }).waitFor();
  await openBag();
  assert.equal(await resources().getByRole("listitem").count(), 0, "novo jogo não mostra itens que ainda não foram coletados");
  assert.equal(await resources().locator(".journal-slot").count(), 6, "os espaços vazios preservam o layout");
  assert.equal(await resources().locator("img").count(), 0, "espaços vazios não mostram ícones de recursos");
  await bag().getByText("Mochila vazia. Os itens aparecem ao serem coletados.").waitFor();
  assert.equal(await bag().getByTitle(/Equipar (Machado|Picareta|Espada)/).count(), 3, "equipamento dado por Rian permanece separado");
  if (process.env.INVENTORY_EMPTY_SCREENSHOT) await bag().screenshot({ path: process.env.INVENTORY_EMPTY_SCREENSHOT });
  const tabs = page.getByRole("navigation", { name: "Seções do caderno" });
  for (const section of ["Construir", "Melhorar"]) {
    await tabs.getByRole("button", { name: section }).click();
    const compact = page.getByRole("list", { name: "Recursos na mochila" });
    assert.equal(await compact.getByRole("listitem").count(), 0, `${section}: sem recursos fantasmas`);
    assert.equal(await compact.locator(".journal-slot").count(), 6);
  }

  // In the real app, open a chest, collect its drops and inspect the live UI.
  await page.goto(baseURL);
  await page.evaluate((data) => localStorage.setItem("ilha-save-dificil-single", JSON.stringify(data)), save);
  await resumeGame(); await openBag();
  assert.equal(await resources().getByRole("listitem").count(), 0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("e");
  await page.getByText(/Kit do Rian aberto/).waitFor({ timeout: 5000 });
  await page.waitForTimeout(3000);
  await openBag();
  for (const name of ["wood", "stone", "food"]) {
    const slot = resources().locator(`[data-resource="${name}"]`);
    await slot.waitFor({ timeout: 5000 });
    const label = await slot.getAttribute("aria-label");
    assert.ok(Number(label.split(": ")[1]) > 0, `${name} foi coletado e tem quantidade positiva`);
  }
  for (const name of ["fiber", "iron", "crystal"]) assert.equal(await resources().locator(`[data-resource="${name}"]`).count(), 0, `${name} não foi coletado`);
  assert.equal(await resources().getByRole("listitem").count(), 3);
  if (process.env.INVENTORY_FILLED_SCREENSHOT) await bag().screenshot({ path: process.env.INVENTORY_FILLED_SCREENSHOT });

  // Pause saves the acquired items; loading again must not erase old saves.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ilha-save-dificil-single")));
  assert.ok(stored.inv.wood > 0 && stored.inv.stone > 0 && stored.inv.food > 0);
  await page.goto(baseURL); await resumeGame(); await openBag();
  for (const name of ["wood", "stone", "food"]) {
    const label = await resources().locator(`[data-resource="${name}"]`).getAttribute("aria-label");
    assert.equal(Number(label.split(": ")[1]), stored.inv[name], `quantidade salva de ${name}`);
  }
  for (const section of ["Construir", "Melhorar"]) {
    await tabs.getByRole("button", { name: section }).click();
    assert.equal(await page.getByRole("list", { name: "Recursos na mochila" }).getByRole("listitem").count(), 3, `${section}: recursos coletados visíveis`);
  }

  // A resource disappears again when its last unit is consumed.
  const lastFruit = { ...save, hp: 50, inv: { ...save.inv, food: 1 } };
  await page.goto(baseURL);
  await page.evaluate((data) => localStorage.setItem("ilha-save-dificil-single", JSON.stringify(data)), lastFruit);
  await resumeGame(); await openBag();
  assert.equal(await resources().getByRole("listitem").count(), 1);
  await bag().getByRole("button", { name: /Comer fruta/ }).click();
  assert.equal(await resources().getByRole("listitem").count(), 0);
  assert.equal(await bag().getByRole("button", { name: /Comer fruta/ }).count(), 0);
  await bag().getByText("Mochila vazia. Os itens aparecem ao serem coletados.").waitFor();

  // The same saved inventory works with touch controls and a narrow viewport.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage(); phone.on("pageerror", (error) => errors.push(error.message));
  await phone.addInitScript(({ prefs, data }) => {
    localStorage.setItem("umbra-settings-v1", JSON.stringify({ ...prefs, controls: "touch" }));
    localStorage.setItem("ilha-save-dificil-single", JSON.stringify(data));
  }, { prefs: settings, data: stored });
  try {
    await phone.goto(baseURL);
    await phone.getByRole("button", { name: "Jogar sozinho" }).tap();
    await phone.getByRole("button", { name: "Continuar" }).first().tap();
    await phone.getByRole("button", { name: "Inventário · I" }).tap();
    const phoneBag = phone.getByRole("dialog", { name: "Mochila & equipamento" });
    const phoneList = phoneBag.getByRole("list", { name: "Recursos na mochila" });
    await phoneList.scrollIntoViewIfNeeded();
    assert.equal(await phoneList.getByRole("listitem").count(), 3, "recursos também aparecem no celular");
    const fits = await phoneBag.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    assert.ok(fits, "mochila móvel não deve criar rolagem horizontal");
    if (process.env.INVENTORY_MOBILE_SCREENSHOT) await phoneBag.screenshot({ path: process.env.INVENTORY_MOBILE_SCREENSHOT });
  } finally { await mobile.close(); }
  assert.deepEqual(errors, []);
  console.log("OK: mochila vazia em jogo novo; coleta real, grades compactas, save e interface móvel.");
} finally { await context.close(); await browser.close(); }
