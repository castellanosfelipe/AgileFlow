import { expect, test } from "@playwright/test";

// Regression coverage for the dark/light theme + ES/EN language toggle
// (cookie-backed, SSR-applied). See lib/theme.ts and lib/i18n/.

test.describe("Theme & language toggle", () => {
  test.beforeEach(async ({ context }) => {
    // Start each test from a clean preference state.
    await context.clearCookies();
  });

  test("defaults to Spanish + dark", async ({ page }) => {
    await page.goto("/login");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "es");
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(html).not.toHaveClass(/(^|\s)light(\s|$)/);
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" })
    ).toBeVisible();
  });

  test("switches to English live and persists across reload", async ({
    page
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "English" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "English" })
    ).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("switches to light theme live and persists across reload", async ({
    page
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Modo claro" }).click();

    const html = page.locator("html");
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/);
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await page.reload();
    await expect(html).toHaveClass(/(^|\s)light(\s|$)/);
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("ignores invalid cookies and falls back to defaults", async ({
    context,
    page
  }) => {
    await context.addCookies([
      {
        name: "agileflow-lang",
        value: "zz",
        url: "http://localhost:3000"
      },
      {
        name: "agileflow-theme",
        value: "hacker",
        url: "http://localhost:3000"
      }
    ]);
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });
});
