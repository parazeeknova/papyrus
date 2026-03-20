import { type BrowserContext, expect, type Page } from "@playwright/test";

const E2E_AUTH_PROFILE_STORAGE_KEY = "papyrus-e2e-auth-profile";
const E2E_AUTH_SESSION_STORAGE_KEY = "papyrus-e2e-auth-session";
const E2E_AUTH_URL = "http://127.0.0.1:4001/api/e2e/session";
const CREATE_DOCUMENT_BUTTON_PATTERN = /new document/i;
const EDITOR_ROLE_BUTTON_PATTERN = /^editor$/i;
const ENABLE_SHARING_BUTTON_PATTERN = /enable sharing/i;
const GOOGLE_SIGN_IN_BUTTON_PATTERN = /continue with google/i;
const LOGGED_IN_PATTERN = /logged\s*in/i;
export const SHARED_WORKBOOK_QUERY_PATTERN = /shared=1/;
export const VIEWER_ROLE_BUTTON_PATTERN = /^viewer$/i;
const WORKBOOK_URL_PATTERN = /\/workbook\/.+$/;

export interface E2EAuthProfile {
  displayName?: string;
  email: string;
  uid: string;
}

export const OWNER_PROFILE: E2EAuthProfile = {
  displayName: "Papyrus Owner",
  email: "owner@example.com",
  uid: "owner-user",
};

export const EDITOR_PROFILE: E2EAuthProfile = {
  displayName: "Papyrus Editor",
  email: "editor@example.com",
  uid: "editor-user",
};

export const VIEWER_PROFILE: E2EAuthProfile = {
  displayName: "Papyrus Viewer",
  email: "viewer@example.com",
  uid: "viewer-user",
};

export async function createDocument(page: Page): Promise<string> {
  const pageErrors: string[] = [];
  const errorHandler = (error: Error) => {
    pageErrors.push(error.message);
  };

  page.on("pageerror", errorHandler);

  try {
    const button = page.getByRole("button", {
      name: CREATE_DOCUMENT_BUTTON_PATTERN,
    });
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();
    await expect(page).toHaveURL(WORKBOOK_URL_PATTERN, { timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded");
  } catch (error) {
    if (pageErrors.length > 0) {
      const details = pageErrors.join("\n");
      throw new Error(
        `createDocument failed (url=${page.url()}). Browser errors:\n${details}\n\nOriginal: ${error instanceof Error ? error.message : error}`
      );
    }
    throw error;
  } finally {
    page.off("pageerror", errorHandler);
  }

  return page.url();
}

export async function expectCellValue(
  page: Page,
  value: string
): Promise<void> {
  await expect(
    page.locator('[data-cell="C0R0"]').getByRole("button", { name: value })
  ).toBeVisible();
}

export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

export async function goOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}

export async function openShareDialog(page: Page): Promise<void> {
  const shareButton = page.locator(
    '[data-testid="share-workbook-trigger"]:visible'
  );
  await shareButton.first().click();

  // Wait for the popover content to fully render
  await page.waitForTimeout(500);
  await expect(page.getByText("Share spreadsheet")).toBeVisible({
    timeout: 10_000,
  });
}

export async function readShareLink(page: Page): Promise<string> {
  const shareLinkInput = page.getByTestId("share-link-input");
  await expect(shareLinkInput).not.toHaveValue("");
  return shareLinkInput.inputValue();
}

export async function selectCell(page: Page): Promise<void> {
  await page.locator('[data-cell="C0R0"]').click();
}

export async function setE2EAuthProfile(
  page: Page,
  profile: E2EAuthProfile
): Promise<void> {
  await page.evaluate(
    ([storageKey, nextProfile]) => {
      window.localStorage.setItem(storageKey, JSON.stringify(nextProfile));
    },
    [E2E_AUTH_PROFILE_STORAGE_KEY, profile] as const
  );
}

export async function seedStubSession(
  page: Page,
  profile: E2EAuthProfile
): Promise<void> {
  const response = await page.request.post(E2E_AUTH_URL, {
    data: profile,
  });

  if (!response.ok()) {
    throw new Error(
      `Failed to create an E2E auth session: ${response.status()}`
    );
  }

  const session = await response.json();

  await page.evaluate(
    ([sessionStorageKey, nextSession]) => {
      window.localStorage.setItem(
        sessionStorageKey,
        JSON.stringify(nextSession)
      );
    },
    [E2E_AUTH_SESSION_STORAGE_KEY, session] as const
  );

  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  await expect(
    page
      .locator('[data-testid="user-badge"]')
      .or(page.getByText("Guest"))
      .or(page.getByText(LOGGED_IN_PATTERN))
  ).toBeVisible({ timeout: 5000 });
}

export async function signInWithStubGoogle(
  page: Page,
  profile: E2EAuthProfile
): Promise<void> {
  await setE2EAuthProfile(page, profile);
  await page
    .locator('button[aria-label="Open Google login dialog"]:visible')
    .first()
    .click();
  await page
    .getByRole("button", { name: GOOGLE_SIGN_IN_BUTTON_PATTERN })
    .click();
  await expect(page.getByText("Logged in")).toBeVisible();
}

export async function typeIntoActiveCell(
  page: Page,
  value: string
): Promise<void> {
  await selectCell(page);
  const formulaInput = page.getByTestId("formula-input");
  await formulaInput.fill(value);
  await formulaInput.press("Enter");
  await expectCellValue(page, value);
}

export async function selectCellAt(page: Page, cellId: string): Promise<void> {
  await page.locator(`[data-cell="${cellId}"]`).click();
}

export async function expectCellValueAt(
  page: Page,
  cellId: string,
  value: string
): Promise<void> {
  await expect(
    page.locator(`[data-cell="${cellId}"]`).getByRole("button", { name: value })
  ).toBeVisible();
}

export async function typeIntoCellAt(
  page: Page,
  cellId: string,
  value: string
): Promise<void> {
  await selectCellAt(page, cellId);
  const formulaInput = page.getByTestId("formula-input");
  await formulaInput.fill(value);
  await formulaInput.press("Enter");
}

export async function waitForCollabConnection(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="formula-input"]')).toBeVisible({
    timeout: 15_000,
  });

  // Give the WebSocket time to connect after workbook page load
  await page.waitForTimeout(3000);

  await openShareDialog(page);

  // The "Connected" status text appears inside the share dialog popover
  await expect(
    page.getByText("Connected to the Phoenix collaboration server.")
  ).toBeVisible({ timeout: 90_000 });

  // Close the popover and wait for animation to complete
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
}

export async function enableEditorSharing(page: Page): Promise<string> {
  await waitForCollabConnection(page);
  await page.waitForTimeout(500);
  await openShareDialog(page);
  await page
    .getByRole("button", { name: ENABLE_SHARING_BUTTON_PATTERN })
    .click();
  await page.getByRole("button", { name: EDITOR_ROLE_BUTTON_PATTERN }).click();
  const shareLink = await readShareLink(page);
  await page.keyboard.press("Escape");
  return shareLink;
}

const DEFAULT_SYNC_WAIT_MS = 3000;

export async function waitForSync(
  page: Page,
  ms = DEFAULT_SYNC_WAIT_MS
): Promise<void> {
  await page.waitForTimeout(ms);
}
