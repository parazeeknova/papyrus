"use client";

import type { CollaboratorIdentity } from "@papyrus/core/collaboration-types";
import type { User } from "firebase/auth";

const ANONYMOUS_PROFILE_STORAGE_KEY = "papyrus-collaboration-anonymous-profile";
const SESSION_CLIENT_ID_STORAGE_KEY = "papyrus-collaboration-client-id";
const DEFAULT_SYNC_SERVER_PORT = "3001";
const ANONYMOUS_POKEMON_LIMIT = 1025;

const ANONYMOUS_ICONS = [
  "sparkle",
  "star",
  "shooting-star",
  "moon",
  "planet",
  "spiral",
  "diamond",
  "flower-lotus",
] as const;

const ANONYMOUS_COLORS = [
  "#D97706",
  "#2563EB",
  "#059669",
  "#DC2626",
  "#7C3AED",
  "#DB2777",
  "#0F766E",
  "#9333EA",
  "#EA580C",
  "#0891B2",
  "#4F46E5",
  "#BE123C",
] as const;
const WHITESPACE_PATTERN = /\s+/;

interface AnonymousProfile {
  color: string;
  icon: string;
  name: string;
  photoURL: string | null;
}

interface PokemonResponse {
  name: string;
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
}

function getRandomArrayValue<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2_147_483_647;
  }

  return Math.abs(hash);
}

function createAnonymousProfile(): AnonymousProfile {
  return {
    color: getRandomArrayValue(ANONYMOUS_COLORS),
    icon: getRandomArrayValue(ANONYMOUS_ICONS),
    name: "Ditto",
    photoURL: null,
  };
}

function getStoredAnonymousProfile(): AnonymousProfile | null {
  const storedValue = window.localStorage.getItem(
    ANONYMOUS_PROFILE_STORAGE_KEY
  );

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<AnonymousProfile>;

    if (
      typeof parsedValue.color === "string" &&
      typeof parsedValue.icon === "string" &&
      typeof parsedValue.name === "string"
    ) {
      return {
        color: parsedValue.color,
        icon: parsedValue.icon,
        name: parsedValue.name,
        photoURL:
          typeof parsedValue.photoURL === "string"
            ? parsedValue.photoURL
            : null,
      };
    }
  } catch {
    // Ignore corrupted local identity payloads and regenerate one.
  }

  return null;
}

function getSessionClientId(): string {
  const existingClientId = window.sessionStorage.getItem(
    SESSION_CLIENT_ID_STORAGE_KEY
  );
  if (existingClientId) {
    return existingClientId;
  }

  const nextClientId = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_CLIENT_ID_STORAGE_KEY, nextClientId);
  return nextClientId;
}

function formatPokemonName(name: string): string {
  return name
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

async function fetchAnonymousPokemonProfile(): Promise<AnonymousProfile> {
  const nextProfile = createAnonymousProfile();
  const pokemonId = Math.floor(Math.random() * ANONYMOUS_POKEMON_LIMIT) + 1;

  try {
    const response = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${pokemonId}`,
      {
        cache: "force-cache",
      }
    );

    if (!response.ok) {
      throw new Error(`Pokemon lookup failed with ${response.status}`);
    }

    const pokemon = (await response.json()) as PokemonResponse;
    return {
      color: nextProfile.color,
      icon: nextProfile.icon,
      name: formatPokemonName(pokemon.name),
      photoURL:
        pokemon.sprites.other?.["official-artwork"]?.front_default ??
        pokemon.sprites.front_default,
    };
  } catch {
    return nextProfile;
  }
}

async function getAnonymousProfile(): Promise<AnonymousProfile> {
  const storedProfile = getStoredAnonymousProfile();
  if (storedProfile?.photoURL) {
    return storedProfile;
  }

  const nextProfile = await fetchAnonymousPokemonProfile();
  window.localStorage.setItem(
    ANONYMOUS_PROFILE_STORAGE_KEY,
    JSON.stringify(nextProfile)
  );
  return nextProfile;
}

export async function buildCollaboratorIdentity(
  user: User | null
): Promise<CollaboratorIdentity> {
  const clientId = getSessionClientId();

  if (!user) {
    const anonymousProfile = await getAnonymousProfile();
    return {
      clientId,
      color: anonymousProfile.color,
      icon: anonymousProfile.icon,
      isAnonymous: true,
      name: anonymousProfile.name,
      photoURL: anonymousProfile.photoURL,
    };
  }

  const identitySeed = user.uid || user.email || user.displayName || clientId;
  const paletteIndex = hashString(identitySeed) % ANONYMOUS_COLORS.length;
  const iconIndex = hashString(`${identitySeed}:icon`) % ANONYMOUS_ICONS.length;

  return {
    clientId,
    color: ANONYMOUS_COLORS[paletteIndex] ?? ANONYMOUS_COLORS[0],
    icon: ANONYMOUS_ICONS[iconIndex] ?? ANONYMOUS_ICONS[0],
    isAnonymous: false,
    name: user.displayName ?? user.email ?? "Papyrus user",
    photoURL: user.photoURL ?? null,
  };
}

export function buildWorkbookShareLink(
  origin: string,
  workbookId: string,
  accessRole: "editor" | "viewer"
): string {
  const url = new URL("/", origin);
  url.searchParams.set("workbook", workbookId);
  url.searchParams.set("access", accessRole);
  return url.toString();
}

export function getDefaultSyncServerUrl(origin: string): string {
  const url = new URL(origin);
  url.port = DEFAULT_SYNC_SERVER_PORT;
  return url.toString();
}

export function getCollaboratorInitials(name: string): string {
  const words = name.trim().split(WHITESPACE_PATTERN);
  const first = words[0]?.[0] ?? "P";
  const second = words[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}
