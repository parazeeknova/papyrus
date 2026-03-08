export const FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72,
] as const;

export const FONT_FAMILIES = [
  "Nunito Sans",
  "Arial",
  "Courier New",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
] as const;

export const TEXT_COLOR_OPTIONS = [
  { label: "Default", value: null },
  { label: "Slate", value: "#334155" },
  { label: "Crimson", value: "#b91c1c" },
  { label: "Amber", value: "#b45309" },
  { label: "Emerald", value: "#047857" },
  { label: "Blue", value: "#2563eb" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
] as const;

export const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0] ?? "Nunito Sans";
export const DEFAULT_FONT_SIZE = 10;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
