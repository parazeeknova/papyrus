import { expect, test } from "@playwright/test";
import {
  createDocument,
  expectCellValue,
  goOffline,
  goOnline,
  OWNER_PROFILE,
  openShareDialog,
  readShareLink,
  SHARED_WORKBOOK_QUERY_PATTERN,
  seedStubSession,
  signInWithStubGoogle,
  typeIntoActiveCell,
  VIEWER_PROFILE,
  VIEWER_ROLE_BUTTON_PATTERN,
} from "./helpers";

const ENABLE_SHARING_BUTTON_PATTERN = /enable sharing/i;
const CLOSE_BUTTON_PATTERN = /^close$/i;
const OWNER_MANAGED_SHARING_TEXT =
  "You joined through a shared link. Only the owner can change its settings.";
const OWNER_SHARED_TOGGLE_PATTERN = /sharing on/i;
const SIGN_IN_SHARING_TEXT =
  "Sign in with Google to unlock cloud sync and sharing.";
const VIEWER_SHARE_LINK_PATTERN = /access=viewer/;

test("guest sharing stays auth-gated until Google sign-in is completed", async ({
  page,
}) => {
  await page.goto("/");
  await createDocument(page);
  await openShareDialog(page);

  await expect(
    page.getByText("Sign in with Google to unlock cloud sync and sharing.")
  ).toBeVisible();

  await page.getByRole("button", { name: CLOSE_BUTTON_PATTERN }).click();
  await signInWithStubGoogle(page, OWNER_PROFILE);
  await openShareDialog(page);

  await expect(
    page.getByText("Connected to the Phoenix collaboration server.")
  ).toBeVisible({ timeout: 60_000 });
});

test("viewer share links open in read-only mode for another signed-in user", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await seedStubSession(page, OWNER_PROFILE);

  const workbookUrl = await createDocument(page);
  await openShareDialog(page);
  await expect(
    page.getByText("Connected to the Phoenix collaboration server.")
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: CLOSE_BUTTON_PATTERN }).click();

  await typeIntoActiveCell(page, "viewer locked");
  await openShareDialog(page);
  await page
    .getByRole("button", { name: ENABLE_SHARING_BUTTON_PATTERN })
    .click();
  await page.getByRole("button", { name: VIEWER_ROLE_BUTTON_PATTERN }).click();
  await expect(page.getByTestId("share-link-input")).toHaveValue(
    VIEWER_SHARE_LINK_PATTERN
  );

  const shareLink = await readShareLink(page);

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();

  await viewerPage.goto("/");
  await seedStubSession(viewerPage, VIEWER_PROFILE);
  await viewerPage.goto(shareLink);

  await expect(viewerPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);
  await expect(viewerPage.getByTestId("formula-input")).toBeDisabled();
  await expectCellValue(viewerPage, "viewer locked");
  await openShareDialog(viewerPage);
  await expect(viewerPage.getByText("Viewer access")).toBeVisible();
  await expect(viewerPage.getByText(OWNER_MANAGED_SHARING_TEXT)).toBeVisible();
  await expect(viewerPage.getByText(SIGN_IN_SHARING_TEXT)).toHaveCount(0);

  await viewerContext.close();
  await page.goto(workbookUrl);
});

test("opening a shared link for the active workbook reactivates shared mode", async ({
  page,
}) => {
  await page.goto("/");
  await seedStubSession(page, OWNER_PROFILE);

  await createDocument(page);
  await openShareDialog(page);
  await page
    .getByRole("button", { name: ENABLE_SHARING_BUTTON_PATTERN })
    .click();
  await page.getByRole("button", { name: VIEWER_ROLE_BUTTON_PATTERN }).click();

  const shareLink = await readShareLink(page);

  await page.goto(shareLink);
  await expect(page).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);

  await openShareDialog(page);
  await expect(page.getByText(OWNER_MANAGED_SHARING_TEXT)).toBeVisible();
  await expect(page.getByText(SIGN_IN_SHARING_TEXT)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: OWNER_SHARED_TOGGLE_PATTERN })
  ).toBeDisabled();
});

test("signed-in sessions reconnect and receive live workbook updates", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await seedStubSession(page, OWNER_PROFILE);

  const workbookUrl = await createDocument(page);
  await typeIntoActiveCell(page, "alpha");
  await page.waitForTimeout(3000);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();

  await secondPage.goto("/");
  await seedStubSession(secondPage, OWNER_PROFILE);
  await secondPage.goto(workbookUrl);
  await expectCellValue(secondPage, "alpha");

  await goOffline(secondContext);
  await typeIntoActiveCell(page, "beta");
  await expectCellValue(page, "beta");
  await expectCellValue(secondPage, "alpha");

  await goOnline(secondContext);

  await expect
    .poll(async () => secondPage.locator('[data-cell="C0R0"]').textContent())
    .toContain("beta");

  await secondContext.close();
});
