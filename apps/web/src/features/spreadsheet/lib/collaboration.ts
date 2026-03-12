"use client";

const WHITESPACE_PATTERN = /\s+/;

export const SHARING_BACKEND_READY = false;

export function getCollaboratorInitials(name: string): string {
  const words = name.trim().split(WHITESPACE_PATTERN);
  const first = words[0]?.[0] ?? "P";
  const second = words[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}
