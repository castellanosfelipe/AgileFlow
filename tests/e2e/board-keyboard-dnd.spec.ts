import { expect, test, type Page } from "@playwright/test";

// Verifies keyboard-only drag & drop on the Kanban board: the dedicated grip
// handle is focusable, Space picks the card up, arrows move it between columns
// (via the custom coordinate getter), and Space drops it. The card is moved
// right and then back, so the test is idempotent against the shared seed DB.

async function loginAsAdmin(page: Page) {
  const username = process.env.E2E_USERNAME ?? "ana.gomez@example.com";
  const password = process.env.E2E_PASSWORD ?? "password123";
  await page.goto("/login?callbackUrl=/board");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/board");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Keyboard-drag the currently focused grip handle one column over. Small gaps
// let @dnd-kit process each phase (pickup / move / drop).
async function keyboardDrag(page: Page, arrow: "ArrowRight" | "ArrowLeft") {
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  await page.keyboard.press(arrow);
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
}

test("keyboard moves a card across columns", async ({ page }) => {
  await loginAsAdmin(page);

  const todo = page.locator('section[aria-labelledby="board-column-todo"]');
  const inProgress = page.locator(
    'section[aria-labelledby="board-column-in_progress"]'
  );

  await expect(
    todo.getByRole("button", { name: /^Mover tarea/ }).first()
  ).toBeVisible();

  const openLabel = await todo
    .getByRole("button", { name: /^Abrir tarea/ })
    .first()
    .getAttribute("aria-label");
  const code = openLabel?.match(/Abrir tarea (\S+):/)?.[1];
  expect(code, "should read an issue code from the first To-do card").toBeTruthy();

  const moveHandle = (column: typeof todo) =>
    column.getByRole("button", {
      name: new RegExp(`^Mover tarea ${escapeRegExp(code!)}`)
    });
  const openCard = (column: typeof todo) =>
    column.getByRole("button", {
      name: new RegExp(`^Abrir tarea ${escapeRegExp(code!)}:`)
    });

  // To-do → In-progress.
  await moveHandle(todo).focus();
  await keyboardDrag(page, "ArrowRight");
  await expect(openCard(inProgress)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600); // let the refetch settle before the next drag

  // In-progress → To-do (restores the seed state, keeping the test idempotent).
  await moveHandle(inProgress).focus();
  await keyboardDrag(page, "ArrowLeft");
  await expect(openCard(todo)).toBeVisible({ timeout: 10_000 });
});
