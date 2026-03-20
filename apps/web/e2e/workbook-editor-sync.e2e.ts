import { expect, test } from "@playwright/test";
import {
  createDocument,
  EDITOR_PROFILE,
  enableEditorSharing,
  expectCellValueAt,
  OWNER_PROFILE,
  openShareDialog,
  readShareLink,
  SHARED_WORKBOOK_QUERY_PATTERN,
  seedStubSession,
  typeIntoCellAt,
  VIEWER_PROFILE,
  VIEWER_ROLE_BUTTON_PATTERN,
  waitForCollabConnection,
  waitForSync,
} from "./helpers";

const CLOSE_BUTTON_PATTERN = /^close$/i;
const ENABLE_SHARING_BUTTON_PATTERN = /enable sharing/i;

test.describe("editor-sync", () => {
  test("owner edits a cell and editor guest sees the value", async ({
    browser,
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (
        t.includes("[workbook-") ||
        t.includes("[phoenix-") ||
        t.includes("[auth-")
      ) {
        logs.push(t.slice(0, 200));
      }
    });

    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    await typeIntoCellAt(page, "C0R0", "hello");
    await waitForSync(page);

    const shareLink = await enableEditorSharing(page);

    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/");
    await seedStubSession(editorPage, EDITOR_PROFILE);
    await editorPage.goto(shareLink);

    await expect(editorPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);
    await expectCellValueAt(editorPage, "C0R0", "hello");

    await editorContext.close();
  });

  test("editor guest types a new value and owner sees it", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    await waitForSync(page);

    const shareLink = await enableEditorSharing(page);

    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/");
    await seedStubSession(editorPage, EDITOR_PROFILE);
    await editorPage.goto(shareLink);
    await expect(editorPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);

    await typeIntoCellAt(editorPage, "C0R0", "from editor");
    await waitForSync(editorPage);

    await expect
      .poll(async () => page.locator('[data-cell="C0R0"]').textContent(), {
        timeout: 60_000,
      })
      .toContain("from editor");

    await editorContext.close();
  });

  test("editor guest edits an existing cell and owner sees the update", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    await typeIntoCellAt(page, "C0R0", "original");
    await waitForSync(page);

    const shareLink = await enableEditorSharing(page);

    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/");
    await seedStubSession(editorPage, EDITOR_PROFILE);
    await editorPage.goto(shareLink);
    await expect(editorPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);

    await expectCellValueAt(editorPage, "C0R0", "original");
    await typeIntoCellAt(editorPage, "C0R0", "updated");
    await waitForSync(editorPage);

    await expect
      .poll(async () => page.locator('[data-cell="C0R0"]').textContent(), {
        timeout: 60_000,
      })
      .toContain("updated");

    await editorContext.close();
  });

  test("owner and editor edit different cells and both sides see all values", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    const shareLink = await enableEditorSharing(page);

    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/");
    await seedStubSession(editorPage, EDITOR_PROFILE);
    await editorPage.goto(shareLink);
    await expect(editorPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);

    await typeIntoCellAt(page, "C0R0", "owner cell");
    await waitForSync(page);
    await typeIntoCellAt(editorPage, "C1R0", "editor cell");
    await waitForSync(editorPage);

    await expect
      .poll(
        async () => editorPage.locator('[data-cell="C0R0"]').textContent(),
        { timeout: 60_000 }
      )
      .toContain("owner cell");

    await expect
      .poll(async () => page.locator('[data-cell="C1R0"]').textContent(), {
        timeout: 60_000,
      })
      .toContain("editor cell");

    await editorContext.close();
  });

  test("editor edits a non-first cell and owner sees it at the correct address", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    const shareLink = await enableEditorSharing(page);

    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/");
    await seedStubSession(editorPage, EDITOR_PROFILE);
    await editorPage.goto(shareLink);
    await expect(editorPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);

    await typeIntoCellAt(editorPage, "C2R1", "deep cell");
    await waitForSync(editorPage);

    await expect
      .poll(async () => page.locator('[data-cell="C2R1"]').textContent(), {
        timeout: 60_000,
      })
      .toContain("deep cell");

    await editorContext.close();
  });

  test("owner overwrites editor change and both converge to the same value", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    const shareLink = await enableEditorSharing(page);

    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/");
    await seedStubSession(editorPage, EDITOR_PROFILE);
    await editorPage.goto(shareLink);
    await expect(editorPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);

    await typeIntoCellAt(editorPage, "C0R0", "mine");
    await waitForSync(editorPage);

    await typeIntoCellAt(page, "C0R0", "theirs");
    await waitForSync(page);

    await expect
      .poll(
        async () => editorPage.locator('[data-cell="C0R0"]').textContent(),
        { timeout: 60_000 }
      )
      .toContain("theirs");

    await expect
      .poll(async () => page.locator('[data-cell="C0R0"]').textContent(), {
        timeout: 60_000,
      })
      .toContain("theirs");

    await editorContext.close();
  });

  test("viewer guest cannot edit even when owner has an active session", async ({
    browser,
    page,
  }) => {
    await page.goto("/");
    await seedStubSession(page, OWNER_PROFILE);

    await createDocument(page);
    await typeIntoCellAt(page, "C0R0", "read-only check");
    await waitForSync(page);

    // Create a viewer share link instead of editor
    await waitForCollabConnection(page);
    await openShareDialog(page);
    await page
      .getByRole("button", { name: ENABLE_SHARING_BUTTON_PATTERN })
      .click();
    await page
      .getByRole("button", { name: VIEWER_ROLE_BUTTON_PATTERN })
      .click();
    const viewerLink = await readShareLink(page);
    await page.getByRole("button", { name: CLOSE_BUTTON_PATTERN }).click();

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto("/");
    await seedStubSession(viewerPage, VIEWER_PROFILE);
    await viewerPage.goto(viewerLink);

    await expect(viewerPage).toHaveURL(SHARED_WORKBOOK_QUERY_PATTERN);
    await expect(viewerPage.getByTestId("formula-input")).toBeDisabled();
    await expectCellValueAt(viewerPage, "C0R0", "read-only check");

    await viewerContext.close();
  });
});
