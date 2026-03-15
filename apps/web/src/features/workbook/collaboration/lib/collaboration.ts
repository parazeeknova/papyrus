import type {
  CollaborationAccessRole,
  CollaboratorIdentity,
} from "@papyrus/core/collaboration-types";

const WHITESPACE_PATTERN = /\s+/;
const DISPLAY_NAME_SPLIT_PATTERN = /[._-]+/;
const TRAILING_SLASH_PATTERN = /\/+$/;
const COLLABORATOR_COLORS = [
  "#2563eb",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#7c3aed",
  "#1d4ed8",
  "#047857",
  "#9a3412",
] as const;
const COLLABORATOR_ICONS = [
  "diamond",
  "flower-lotus",
  "moon",
  "planet",
  "sparkle",
  "spiral",
  "star",
  "shooting-star",
] as const;

export const SHARING_BACKEND_READY = true;

type WorkbookRouteSearchParams = Record<string, string | string[] | undefined>;

function readSingleQueryValue(
  value: string | string[] | undefined
): string | null {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? (value[0] ?? null) : null;
}

export function parseWorkbookRouteAccess(
  searchParams?: WorkbookRouteSearchParams
): {
  isSharedSession: boolean;
  requestedAccessRole: CollaborationAccessRole | null;
} {
  const shared = readSingleQueryValue(searchParams?.shared);
  const access = readSingleQueryValue(searchParams?.access);

  return {
    isSharedSession: shared === "1" || shared === "true",
    requestedAccessRole: isCollaborationAccessRole(access) ? access : null,
  };
}

export function resolveWorkbookRouteAccess(options: {
  fallbackIsSharedSession?: boolean;
  fallbackRequestedAccessRole?: CollaborationAccessRole | null;
  searchParams?: WorkbookRouteSearchParams;
}): {
  isSharedSession: boolean;
  requestedAccessRole: CollaborationAccessRole | null;
} {
  const routeAccess = parseWorkbookRouteAccess(options.searchParams);
  const isSharedSession =
    routeAccess.isSharedSession || options.fallbackIsSharedSession === true;

  return {
    isSharedSession,
    requestedAccessRole: isSharedSession
      ? (routeAccess.requestedAccessRole ??
        options.fallbackRequestedAccessRole ??
        null)
      : null,
  };
}

function parseWorkbookPathname(pathname: string): string | null {
  const normalizedPathname = pathname.replace(TRAILING_SLASH_PATTERN, "");
  const segments = normalizedPathname.split("/");
  const workbookId = segments.at(-1);
  const workbookSegment = segments.at(-2);

  if (!(workbookSegment === "workbook" && workbookId)) {
    return null;
  }

  try {
    return decodeURIComponent(workbookId);
  } catch {
    return workbookId;
  }
}

export function resolveCurrentWorkbookRouteAccess(options: {
  fallbackIsSharedSession?: boolean;
  fallbackRequestedAccessRole?: CollaborationAccessRole | null;
  pathname?: string;
  search?: string;
  workbookId: string;
}): {
  isSharedSession: boolean;
  requestedAccessRole: CollaborationAccessRole | null;
} {
  const currentWorkbookId = options.pathname
    ? parseWorkbookPathname(options.pathname)
    : null;

  if (currentWorkbookId !== options.workbookId) {
    return {
      isSharedSession: options.fallbackIsSharedSession === true,
      requestedAccessRole:
        options.fallbackIsSharedSession === true
          ? (options.fallbackRequestedAccessRole ?? null)
          : null,
    };
  }

  const searchParams = new URLSearchParams(options.search ?? "");

  return resolveWorkbookRouteAccess({
    fallbackIsSharedSession: options.fallbackIsSharedSession,
    fallbackRequestedAccessRole: options.fallbackRequestedAccessRole,
    searchParams: {
      access: searchParams.get("access") ?? undefined,
      shared: searchParams.get("shared") ?? undefined,
    },
  });
}

export function buildWorkbookSharePath(
  workbookId: string,
  accessRole: CollaborationAccessRole
): string {
  const query = new URLSearchParams({
    access: accessRole,
    shared: "1",
  });

  return `/workbook/${encodeURIComponent(workbookId)}?${query.toString()}`;
}

export function buildWorkbookShareUrl(
  origin: string,
  workbookId: string,
  accessRole: CollaborationAccessRole
): string {
  return new URL(
    buildWorkbookSharePath(workbookId, accessRole),
    origin
  ).toString();
}

export function getCollaboratorInitials(name: string): string {
  const words = name.trim().split(WHITESPACE_PATTERN);
  const first = words[0]?.[0] ?? "P";
  const second = words[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

function buildDisplayName(email: string | null, userId: string): string {
  const rawValue = email?.split("@")[0] ?? `guest-${userId.slice(0, 6)}`;
  const segments = rawValue
    .split(DISPLAY_NAME_SPLIT_PATTERN)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return rawValue;
  }

  return segments
    .map((segment) => {
      const [first, ...rest] = segment;
      return `${first?.toUpperCase() ?? ""}${rest.join("").toLowerCase()}`;
    })
    .join(" ");
}

function hashIdentity(value: string): number {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % Number.MAX_SAFE_INTEGER;
  }

  return hash;
}

export function isCollaborationAccessRole(
  value: unknown
): value is CollaborationAccessRole {
  return value === "editor" || value === "viewer";
}

export function buildCollaboratorIdentity(params: {
  deviceId: string;
  email: string | null;
  userId: string;
}): CollaboratorIdentity {
  const identitySeed = `${params.userId}:${params.deviceId}`;
  const hash = hashIdentity(identitySeed);

  return {
    clientId: params.deviceId,
    color: COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length] ?? "#2563eb",
    icon: COLLABORATOR_ICONS[hash % COLLABORATOR_ICONS.length] ?? "sparkle",
    isAnonymous: params.email === null,
    name: buildDisplayName(params.email, params.userId),
    photoURL: null,
  };
}
