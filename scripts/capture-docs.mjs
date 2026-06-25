/**
 * Genera screenshots y GIFs para el README de AgileFlow.
 * Uso: node scripts/capture-docs.mjs
 * Requiere: dev server en localhost:3000, DB con seed ejecutado.
 */

import { chromium }                    from "playwright";
import { spawnSync }                    from "child_process";
import { mkdirSync, readdirSync,
         statSync, renameSync }         from "fs";
import path, { dirname }               from "path";
import { fileURLToPath }               from "url";

const ROOT     = path.resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SS_DIR   = path.join(ROOT, "docs", "screenshots");
const VID_DIR  = path.join(ROOT, "docs", "videos");
const BASE     = "http://localhost:3000";
const CREDS    = { user: "ana.gomez@example.com", pass: "password123" };
const VIEWPORT = { width: 1280, height: 800 };

mkdirSync(SS_DIR,  { recursive: true });
mkdirSync(VID_DIR, { recursive: true });

// ─── utilidades ──────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[placeholder="usuario o correo"]', CREDS.user);
  await page.fill('input[type="password"]',               CREDS.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(backlog|board|gantt|pert|executive)/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

async function settle(page, ms = 1800) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** Devuelve el webm más reciente en VID_DIR (excluyendo los marcados .done) */
function newestWebm() {
  return readdirSync(VID_DIR)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, t: statSync(path.join(VID_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f ?? null;
}

/** Archiva los webm actuales para que no interfieran con la siguiente grabación */
function archiveWebms() {
  readdirSync(VID_DIR)
    .filter((f) => f.endsWith(".webm"))
    .forEach((f) => renameSync(path.join(VID_DIR, f), path.join(VID_DIR, f + ".done")));
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "pipe" });
  if (r.status !== 0) throw new Error(r.stderr?.toString().slice(-300));
}

/** webm → GIF de 640px de ancho, 10fps */
function makeGif(webmFile, gifPath) {
  const mp4     = gifPath.replace(".gif", ".mp4");
  const palette = gifPath.replace(".gif", "-palette.png");
  try {
    run("ffmpeg", ["-y", "-i", webmFile, "-c:v", "libx264", "-preset", "fast", mp4]);
    run("ffmpeg", ["-y", "-i", mp4, "-vf",
      "fps=10,scale=640:-1:flags=lanczos,palettegen", palette]);
    run("ffmpeg", ["-y", "-i", mp4, "-i", palette,
      "-filter_complex", "fps=10,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse",
      gifPath]);
    console.log(`  ✓ GIF → docs/videos/${path.basename(gifPath)}`);
  } catch (e) {
    console.error(`  ✗ ffmpeg: ${e.message}`);
  }
}

// ─── screenshots (sin grabación de video) ────────────────────────────────────

async function captureScreenshots(browser) {
  console.log("\n📸  Capturando screenshots...");
  const ctx  = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await login(page);

  // Backlog
  await page.goto(`${BASE}/backlog`);
  await settle(page, 2500);
  await page.screenshot({ path: path.join(SS_DIR, "backlog-sprint-planning.png") });
  console.log("  ✓ backlog-sprint-planning.png");

  // Kanban board con panel lateral abierto
  await page.goto(`${BASE}/board`);
  await settle(page, 2000);
  const firstCard = page.locator('[aria-label^="Abrir tarea"]').first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(SS_DIR, "kanban-board-con-detalle.png") });
  console.log("  ✓ kanban-board-con-detalle.png");

  // Sólo el panel de detalle
  const panel = page.locator('[role="dialog"]').last();
  if (await panel.count()) {
    await panel.screenshot({ path: path.join(SS_DIR, "detalle-tarea-panel.png") });
    console.log("  ✓ detalle-tarea-panel.png");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Gantt
  await page.goto(`${BASE}/gantt`);
  await settle(page, 3000);
  await page.screenshot({ path: path.join(SS_DIR, "gantt-responsable-semana.png") });
  console.log("  ✓ gantt-responsable-semana.png");

  // PERT
  await page.goto(`${BASE}/pert`);
  await settle(page, 3000);
  await page.screenshot({ path: path.join(SS_DIR, "pert-dependencias.png") });
  console.log("  ✓ pert-dependencias.png");

  // Ejecutivo
  await page.goto(`${BASE}/executive`);
  await settle(page, 5000);
  await page.screenshot({ path: path.join(SS_DIR, "ejecutivo-resource-load.png") });
  console.log("  ✓ ejecutivo-resource-load.png");

  await ctx.close();
}

// ─── GIF 1: crear sprint ──────────────────────────────────────────────────────

async function recordSprintFlow(browser) {
  console.log("\n🎬  Grabando: Crear y activar sprint...");
  archiveWebms();

  const ctx  = await browser.newContext({ viewport: VIEWPORT,
    recordVideo: { dir: VID_DIR, size: VIEWPORT } });
  const page = await ctx.newPage();

  await login(page);
  await page.goto(`${BASE}/backlog`);
  await settle(page, 2500);

  // Click "Crear sprint"
  const crearBtn = page.locator('button').filter({ hasText: /Crear sprint|Nuevo sprint/i }).first();
  if (await crearBtn.count()) {
    await crearBtn.click();
    await page.waitForTimeout(900);

    const nameInput = page.locator('input[placeholder*="Sprint"], input[placeholder*="sprint"]').first();
    if (await nameInput.count()) {
      await nameInput.fill("Sprint 4 - Demo");
      await page.waitForTimeout(500);
    }

    const dateInputs = page.locator('input[type="date"]');
    if ((await dateInputs.count()) >= 2) {
      await dateInputs.nth(0).fill("2026-07-06");
      await page.waitForTimeout(300);
      await dateInputs.nth(1).fill("2026-07-17");
      await page.waitForTimeout(300);
    }

    const submitBtn = page.locator('button[type="submit"]')
      .filter({ hasText: /Crear|Guardar/i }).first();
    if (await submitBtn.count()) {
      await submitBtn.click();
      await page.waitForTimeout(1800);
    }
  }

  // Scroll por el backlog para mostrar el resultado
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, -450);
  await page.waitForTimeout(1000);

  await page.close();
  await ctx.close();
  await new Promise((r) => setTimeout(r, 1000));

  const webm = newestWebm();
  if (webm) makeGif(path.join(VID_DIR, webm), path.join(VID_DIR, "flujo-crear-sprint.gif"));
  archiveWebms();
}

// ─── GIF 2: registrar avance ──────────────────────────────────────────────────

async function recordProgressFlow(browser) {
  console.log("\n🎬  Grabando: Abrir tarea y registrar tiempo...");
  archiveWebms();

  const ctx  = await browser.newContext({ viewport: VIEWPORT,
    recordVideo: { dir: VID_DIR, size: VIEWPORT } });
  const page = await ctx.newPage();

  await login(page);
  await page.goto(`${BASE}/board`);
  await settle(page, 2000);
  await page.waitForTimeout(1200);

  // Abrir primera tarjeta
  const card = page.locator('[aria-label^="Abrir tarea"]').first();
  if (await card.count()) {
    await card.click();
    await settle(page, 1500);

    // Scroll dentro del panel hasta la sección de tiempo
    await page.locator('[role="dialog"]').last()
      .evaluate((el) => { el.scrollTop = 600; }).catch(() => {});
    await page.waitForTimeout(800);

    // Rellenar el input de tiempo (placeholder="1h 30m")
    const spentInput = page.locator('input[placeholder="1h 30m"]').first();
    if (await spentInput.count()) {
      await spentInput.click();
      await page.waitForTimeout(300);
      await spentInput.fill("2h");
      await page.waitForTimeout(500);

      // Descripción
      const descInput = page.locator('[placeholder*="Describe qué se hizo"]').first();
      if (await descInput.count()) {
        await descInput.click();
        await descInput.fill("Implementación del componente principal");
        await page.waitForTimeout(400);
      }

      // Botón registrar
      const registerBtn = page.locator('button').filter({ hasText: /Registrar|Guardar tiempo/i }).first();
      if (await registerBtn.count()) {
        await registerBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Scroll de vuelta al inicio del panel
    await page.locator('[role="dialog"]').last()
      .evaluate((el) => { el.scrollTop = 0; }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }

  await page.close();
  await ctx.close();
  await new Promise((r) => setTimeout(r, 1000));

  const webm = newestWebm();
  if (webm) makeGif(path.join(VID_DIR, webm), path.join(VID_DIR, "flujo-registrar-avance.gif"));
  archiveWebms();
}

// ─── GIF 3: tablero ejecutivo ─────────────────────────────────────────────────

async function recordExecutiveFlow(browser) {
  console.log("\n🎬  Grabando: Revisar carga del equipo en ejecutivo...");
  archiveWebms();

  const ctx  = await browser.newContext({ viewport: VIEWPORT,
    recordVideo: { dir: VID_DIR, size: VIEWPORT } });
  const page = await ctx.newPage();

  await login(page);
  await page.goto(`${BASE}/executive`);
  await settle(page, 5000);
  await page.waitForTimeout(1500);

  // Scroll lento por el dashboard
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -450);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1000);

  // Intentar clic en exportar (puede no existir)
  const exportBtn = page.locator('button[aria-label*="Exportar"]').first();
  const exportExists = await exportBtn.count({ timeout: 1500 }).catch(() => 0);
  if (exportExists) {
    await exportBtn.click();
    await page.waitForTimeout(800);
  }

  await page.close();
  await ctx.close();
  await new Promise((r) => setTimeout(r, 1000));

  const webm = newestWebm();
  if (webm) makeGif(path.join(VID_DIR, webm), path.join(VID_DIR, "flujo-revisar-carga.gif"));
  archiveWebms();
}

// ─── main ─────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
try {
  await captureScreenshots(browser);
  await recordSprintFlow(browser);
  await recordProgressFlow(browser);
  await recordExecutiveFlow(browser);
} finally {
  await browser.close();
}

console.log("\n✅  Generación completa.");
console.log("\n📸 Screenshots:");
spawnSync("ls", ["-lh", SS_DIR], { stdio: "inherit" });
console.log("\n🎬 Videos/GIFs:");
spawnSync("bash", ["-c", `ls -lh "${VID_DIR}" | grep -v ".done"`], { stdio: "inherit" });
