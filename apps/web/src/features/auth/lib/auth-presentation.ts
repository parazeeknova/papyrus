import { FirebaseError } from "firebase/app";
import type { AuthenticatedUser } from "@/web/platform/auth/auth-client";

const WHITESPACE_PATTERN = /\s+/;

export function getAccountName(user: AuthenticatedUser | null): string {
  return user?.displayName ?? user?.email ?? "Google account";
}

export function getAccountEmail(user: AuthenticatedUser | null): string {
  return user?.email ?? "Email unavailable";
}

export function getAccountInitials(user: AuthenticatedUser | null): string {
  const source = getAccountName(user).trim();
  const [first = "G", second = ""] = source.split(WHITESPACE_PATTERN);

  return `${first[0] ?? "G"}${second[0] ?? ""}`.toUpperCase();
}

export function getAuthErrorMessage(error: unknown): string | null {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/popup-blocked":
        return "Allow pop-ups in this browser to continue with Google.";
      case "auth/popup-closed-by-user":
        return null;
      case "auth/unauthorized-domain":
        return "Add this origin to Firebase Authentication authorized domains.";
      default:
        return "Google sign-in failed. Verify your Firebase Auth setup.";
    }
  }

  return "Google sign-in failed. Please try again.";
}
