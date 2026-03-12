"use client";

const WHITESPACE_PATTERN = /\s+/;

export function buildWorkbookShareLink(
  origin: string,
  workbookId: string
): string {
  const url = new URL(`/workbook/${workbookId}`, origin);
  url.searchParams.set("shared", "1");
  return url.toString();
}

export function getCollaboratorInitials(name: string): string {
  const words = name.trim().split(WHITESPACE_PATTERN);
  const first = words[0]?.[0] ?? "P";
  const second = words[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}
