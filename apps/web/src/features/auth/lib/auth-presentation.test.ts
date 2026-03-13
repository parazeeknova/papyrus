import { describe, expect, test } from "bun:test";
import { FirebaseError } from "firebase/app";

import {
  getAccountEmail,
  getAccountInitials,
  getAccountName,
  getAuthErrorMessage,
} from "./auth-presentation";

const buildUser = (
  overrides: Partial<{ displayName: string; email: string }>
) => {
  return {
    displayName: overrides.displayName ?? null,
    email: overrides.email ?? null,
  };
};

describe("auth presentation helpers", () => {
  test("prefers the display name for the account name and initials", () => {
    const user = buildUser({
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });

    expect(getAccountName(user as never)).toBe("Ada Lovelace");
    expect(getAccountEmail(user as never)).toBe("ada@example.com");
    expect(getAccountInitials(user as never)).toBe("AL");
  });

  test("falls back to the email address when no display name exists", () => {
    const user = buildUser({
      email: "guest@example.com",
    });

    expect(getAccountName(user as never)).toBe("guest@example.com");
    expect(getAccountInitials(user as never)).toBe("G");
  });

  test("maps firebase auth errors to actionable messages", () => {
    expect(
      getAuthErrorMessage(
        new FirebaseError("auth/popup-blocked", "popup blocked")
      )
    ).toBe("Allow pop-ups in this browser to continue with Google.");

    expect(
      getAuthErrorMessage(
        new FirebaseError(
          "auth/unauthorized-domain",
          "unauthorized domain for sign-in"
        )
      )
    ).toBe("Add this origin to Firebase Authentication authorized domains.");

    expect(
      getAuthErrorMessage(
        new FirebaseError("auth/popup-closed-by-user", "popup closed")
      )
    ).toBeNull();

    expect(
      getAuthErrorMessage(new FirebaseError("auth/internal-error", "internal"))
    ).toBe("Google sign-in failed. Verify your Firebase Auth setup.");

    expect(getAuthErrorMessage(new Error("boom"))).toBe(
      "Google sign-in failed. Please try again."
    );
  });
});
