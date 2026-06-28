import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, callbackUrl: string) {
  const username = process.env.E2E_USERNAME ?? "ana.gomez@example.com";
  const password = process.env.E2E_PASSWORD ?? "password123";

  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  // Use stable id/type selectors so the helper is independent of the UI language.
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${callbackUrl}`);
}

test("muestra backlog", async ({ page }) => {
  await login(page, "/backlog");

  await expect(
    page.getByRole("heading", { level: 1, name: "Backlog" })
  ).toBeVisible();
});

test("muestra kanban en /board", async ({ page }) => {
  await login(page, "/board");

  await expect(
    page.getByRole("heading", { level: 1, name: "Kanban" })
  ).toBeVisible();
});

test("muestra gantt en /gantt", async ({ page }) => {
  await login(page, "/gantt");

  await expect(
    page.getByRole("heading", { level: 1, name: "Gantt" })
  ).toBeVisible();
});

test("muestra pert en /pert", async ({ page }) => {
  await login(page, "/pert");

  await expect(
    page.getByRole("heading", { level: 1, name: "PERT" })
  ).toBeVisible();
});

test("muestra tablero ejecutivo en /executive", async ({ page }) => {
  await login(page, "/executive");

  await expect(
    page.getByRole("heading", { level: 1, name: "Tablero ejecutivo" })
  ).toBeVisible();
});
