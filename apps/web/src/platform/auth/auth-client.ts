"use client";

import {
  onAuthStateChanged as onFirebaseAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { env } from "@/web/platform/env/client-env";
import {
  firebaseAuth,
  googleAuthProvider,
} from "@/web/platform/firebase/client";

const DEFAULT_COLLAB_PORT = 4000;
const DEFAULT_E2E_AUTH_URL_PATH = "/api/e2e/session";
const E2E_AUTH_PROFILE_STORAGE_KEY = "papyrus-e2e-auth-profile";
const E2E_AUTH_SESSION_STORAGE_KEY = "papyrus-e2e-auth-session";

interface E2EAuthProfile {
  displayName?: string | null;
  email: string;
  photoURL?: string | null;
  uid: string;
}

interface E2EAuthSessionPayload {
  token: string;
  user: {
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    uid: string;
  };
}

export interface AuthenticatedUser {
  displayName: string | null;
  email: string | null;
  getIdToken: () => Promise<string>;
  photoURL: string | null;
  uid: string;
}

type AuthStateListener = (user: AuthenticatedUser | null) => void;

const stubAuthListeners = new Set<AuthStateListener>();
let hasRegisteredStubStorageListener = false;
let stubCurrentUser: AuthenticatedUser | null | undefined;

function buildDefaultE2EAuthProfile(): E2EAuthProfile {
  return {
    displayName: "Papyrus E2E User",
    email: "papyrus-e2e@example.com",
    photoURL: null,
    uid: "papyrus-e2e-user",
  };
}

function buildStubUser(session: E2EAuthSessionPayload): AuthenticatedUser {
  return {
    displayName: session.user.displayName,
    email: session.user.email,
    getIdToken: async () => session.token,
    photoURL: session.user.photoURL,
    uid: session.user.uid,
  };
}

function ensureStubStorageListener(): void {
  if (hasRegisteredStubStorageListener || typeof window === "undefined") {
    return;
  }

  hasRegisteredStubStorageListener = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== E2E_AUTH_SESSION_STORAGE_KEY) {
      return;
    }

    stubCurrentUser = readStoredStubUser();
    notifyStubAuthListeners(stubCurrentUser ?? null);
  });
}

function getDefaultE2EAuthUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${window.location.hostname}:${DEFAULT_COLLAB_PORT}${DEFAULT_E2E_AUTH_URL_PATH}`;
}

function getRequestedE2EAuthProfile(): E2EAuthProfile {
  if (typeof window === "undefined") {
    return buildDefaultE2EAuthProfile();
  }

  const storedProfile = window.localStorage.getItem(
    E2E_AUTH_PROFILE_STORAGE_KEY
  );
  if (!storedProfile) {
    return buildDefaultE2EAuthProfile();
  }

  try {
    const parsedProfile = JSON.parse(storedProfile) as Partial<E2EAuthProfile>;

    if (
      typeof parsedProfile.uid === "string" &&
      parsedProfile.uid.length > 0 &&
      typeof parsedProfile.email === "string" &&
      parsedProfile.email.length > 0
    ) {
      return {
        displayName: parsedProfile.displayName ?? null,
        email: parsedProfile.email,
        photoURL: parsedProfile.photoURL ?? null,
        uid: parsedProfile.uid,
      };
    }
  } catch {
    // Fall back to the default profile when localStorage contains malformed data.
  }

  return buildDefaultE2EAuthProfile();
}

function getStubAuthUrl(): string {
  const configuredUrl = env.NEXT_PUBLIC_E2E_AUTH_URL ?? getDefaultE2EAuthUrl();

  if (!configuredUrl) {
    throw new Error("The E2E auth endpoint is not configured.");
  }

  return configuredUrl;
}

function isStubAuthMode(): boolean {
  return env.NEXT_PUBLIC_E2E_AUTH_MODE === "stub";
}

function notifyStubAuthListeners(user: AuthenticatedUser | null): void {
  for (const listener of stubAuthListeners) {
    listener(user);
  }
}

function persistStubSession(session: E2EAuthSessionPayload): AuthenticatedUser {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      E2E_AUTH_SESSION_STORAGE_KEY,
      JSON.stringify(session)
    );
  }

  const nextUser = buildStubUser(session);
  stubCurrentUser = nextUser;
  notifyStubAuthListeners(nextUser);
  return nextUser;
}

function readStoredStubUser(): AuthenticatedUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedSession = window.localStorage.getItem(
    E2E_AUTH_SESSION_STORAGE_KEY
  );

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as E2EAuthSessionPayload;
    return buildStubUser(parsedSession);
  } catch {
    return null;
  }
}

function resetStubSession(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(E2E_AUTH_SESSION_STORAGE_KEY);
  }

  stubCurrentUser = null;
  notifyStubAuthListeners(null);
}

export function getCurrentAuthUser(): AuthenticatedUser | null {
  if (!isStubAuthMode()) {
    return firebaseAuth.currentUser as AuthenticatedUser | null;
  }

  ensureStubStorageListener();

  if (stubCurrentUser === undefined) {
    stubCurrentUser = readStoredStubUser();
  }

  return stubCurrentUser ?? null;
}

export function onAuthStateChange(listener: AuthStateListener): () => void {
  if (!isStubAuthMode()) {
    return onFirebaseAuthStateChanged(firebaseAuth, listener);
  }

  ensureStubStorageListener();
  stubAuthListeners.add(listener);
  listener(getCurrentAuthUser());

  return () => {
    stubAuthListeners.delete(listener);
  };
}

export async function signInWithGoogle(): Promise<AuthenticatedUser | null> {
  if (!isStubAuthMode()) {
    const credentials = await signInWithPopup(firebaseAuth, googleAuthProvider);
    return credentials.user as AuthenticatedUser;
  }

  const response = await fetch(getStubAuthUrl(), {
    body: JSON.stringify(getRequestedE2EAuthProfile()),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Google sign-in failed. Please try again.");
  }

  const session = (await response.json()) as E2EAuthSessionPayload;
  return persistStubSession(session);
}

export async function signOutUser(): Promise<void> {
  if (!isStubAuthMode()) {
    await signOut(firebaseAuth);
    return;
  }

  resetStubSession();
}
