import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseURL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const screenshotPath = (name) => join(tmpdir(), `umbra-${name}.png`);
const errors = [];
function observePage(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && /\.(?:woff2?|png|jpe?g|svg|webp)(?:\?.*)?$/i.test(response.url())) {
      errors.push(`Recurso ausente: ${response.status()} ${response.url()}`);
    }
  });
}
const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const page = await context.newPage();
observePage(page);
await page.addInitScript(() => {
  localStorage.setItem("umbra-settings-v1", JSON.stringify({ music: false, voice: false, controls: "keyboard", fpsCap: 120, quality: "auto" }));
});

function saveAt(x, y) {
  return {
    v: 2, seed: 77, px: x, py: y, hp: 82, maxHp: 100,
    inv: { wood: 200, stone: 200, fiber: 100, food: 8, iron: 60, crystal: 30 },
    tools: { axe: 2, pick: 2, sword: 2 }, time: 280, day: 1, score: 720, kills: 3, deaths: 0,
    structures: [{ type: "workbench", x: 104 * 32 + 110, y: 88 * 32 + 90, hp: 170, open: false }],
    questP: [60, 3, 1, 20, 0, 2, 0], questDone: [true, false, false, false, false, false, false],
    allies: ["rian"], visited: [], nodeHp: [], escortDone: true,
    equipment: { harness: true, coat: false, charm: false },
  };
}
async function continueAt(x, y) {
  await page.goto(baseURL);
  await page.evaluate((save) => localStorage.setItem("ilha-save-dificil-single", JSON.stringify(save)), saveAt(x, y));
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.getByRole("button", { name: "Inventário · I" }).waitFor();
  await page.waitForTimeout(450);
}

try {
  await page.goto(baseURL);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('700 16px "Pixelify Sans"')), true, "fonte do título não carregou");
  assert.equal(await page.evaluate(() => document.fonts.check('400 16px "Nunito"')), true, "fonte da interface não carregou");
  if (process.env.EXPECT_NO_DATABASE === "1") {
    await page.getByRole("button", { name: /Multiplayer/ }).click();
    await page.getByRole("button", { name: /Criar e jogar/ }).click();
    await page.getByText(/Multiplayer indisponível: configure um banco PostgreSQL/).waitFor();
    await page.getByRole("button", { name: /Voltar/ }).click();
  }
  await page.getByRole("button", { name: "Jogar sozinho" }).click();
  await page.getByRole("button", { name: "Novo jogo" }).first().click();
  await page.locator("canvas").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Inventário · I" }).waitFor();
  await page.keyboard.down("w");
  await page.waitForTimeout(600);
  await page.keyboard.up("w");
  await page.keyboard.press("i");
  let dialog = page.getByRole("dialog", { name: "Mochila & equipamento" });
  await dialog.waitFor();
  await dialog.getByText("Arreio do Explorador", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Construir", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Oficina da Clareira" });
  await dialog.waitFor();
  await page.screenshot({ path: screenshotPath("journal") });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);

  await continueAt(104 * 32, 88 * 32);
  await page.keyboard.press("i");
  dialog = page.getByRole("dialog", { name: "Mochila & equipamento" });
  await dialog.getByRole("button", { name: "Fabricar & equipar" }).first().click();
  await page.waitForTimeout(500);
  assert.equal(await dialog.getByRole("button", { name: "Fabricar & equipar" }).count(), 1, "casaco não foi equipado");
  await dialog.getByRole("button", { name: "Registros", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "O livro de Umbra" });
  await dialog.getByRole("button", { name: "Arauto das Brasas" }).click();
  await dialog.getByRole("heading", { name: "Arauto das Brasas" }).waitFor();
  await page.screenshot({ path: screenshotPath("bestiary") });
  await dialog.getByRole("button", { name: /Atlas de ruínas/ }).click();
  await dialog.getByRole("button", { name: /Círculo dos Ancestrais/ }).click();
  await dialog.getByRole("heading", { name: "Círculo dos Ancestrais" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Construir", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Oficina da Clareira" });
  await dialog.getByTitle("Cerca dupla", { exact: true }).click();
  await dialog.getByRole("button", { name: /Cerca rústica/ }).click();
  await dialog.getByRole("button", { name: "Preparar 2 cercas" }).click();
  await page.getByRole("button", { name: "Colocar 2", exact: true }).waitFor();
  await page.getByRole("button", { name: "Colocar 2", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Construir", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Oficina da Clareira" });
  await dialog.getByTitle("Fogueira", { exact: true }).click();
  await dialog.getByRole("button", { name: "Preparar construção" }).click();
  const rotate = page.getByRole("button", { name: /Virar de lado/ });
  await rotate.waitFor();
  await rotate.click();
  await page.getByRole("button", { name: /Virar de frente/ }).waitFor();
  await page.keyboard.press("Escape");

  await continueAt(137 * 32 + 100, 43 * 32 - 70);
  await page.waitForTimeout(900);
  await page.screenshot({ path: screenshotPath("glacier") });
  await continueAt(45 * 32, 77 * 32 + 80);
  await page.waitForTimeout(900);
  await page.screenshot({ path: screenshotPath("ruins") });
  await continueAt(165 * 32, 68 * 32 + 110);
  await page.waitForTimeout(900);
  await page.screenshot({ path: screenshotPath("necropolis") });
  await continueAt(27 * 32, 62 * 32 + 90);
  await page.waitForTimeout(900);
  await page.screenshot({ path: screenshotPath("lizard-temple") });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  observePage(phone);
  await phone.addInitScript((save) => {
    localStorage.setItem("umbra-settings-v1", JSON.stringify({ music: false, voice: false, controls: "touch", quality: "auto" }));
    localStorage.setItem("ilha-save-dificil-single", JSON.stringify(save));
  }, saveAt(104 * 32, 88 * 32));
  await phone.goto(baseURL);
  await phone.getByRole("button", { name: "Jogar sozinho" }).click();
  await phone.getByRole("button", { name: "Continuar" }).first().click();
  await phone.getByRole("button", { name: "Inventário · I" }).click();
  await phone.getByRole("dialog", { name: "Mochila & equipamento" }).waitFor();
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: screenshotPath("mobile") });
  const overflow = await phone.getByRole("dialog").evaluate((el) => el.scrollWidth > el.clientWidth + 2);
  assert.equal(overflow, false, "painel transborda horizontalmente no celular");
  await mobile.close();
  assert.deepEqual(errors, [], `erros de runtime: ${errors.join("; ")}`);
  console.log("OK: início, inventário, equipamento, oficina, cerca dupla, bestiário, locais e tela de toque sem erros de runtime.");
  console.log(`Capturas salvas em ${tmpdir()} (umbra-*.png).`);
} finally {
  await browser.close();
}
