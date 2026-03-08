import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@papyrus/logs";

const DOT_ENV_LINE_SPLIT_PATTERN = /\r?\n/;
const WEB_APP_DIR = resolve(process.cwd(), "..", "web");

export const log = createLogger({ scope: "sync" });

function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const contents = readFileSync(filePath, "utf8");
  const entries = contents.split(DOT_ENV_LINE_SPLIT_PATTERN);
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry || trimmedEntry.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedEntry.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedEntry.slice(0, separatorIndex).trim();
    const rawValue = trimmedEntry.slice(separatorIndex + 1).trim();
    const quotedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));

    result[key] = quotedValue ? rawValue.slice(1, -1) : rawValue;
  }

  return result;
}

function readFallbackEnvValue(key: string): string | undefined {
  const candidateFiles = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(WEB_APP_DIR, ".env.local"),
    resolve(WEB_APP_DIR, ".env"),
  ];

  for (const filePath of candidateFiles) {
    const value = parseDotEnvFile(filePath)[key];
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getConfigValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const processValue = process.env[key];
    if (processValue) {
      return processValue;
    }

    const fallbackValue = readFallbackEnvValue(key);
    if (fallbackValue) {
      return fallbackValue;
    }
  }

  return undefined;
}

export const FIREBASE_API_KEY = getConfigValue(
  "FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY"
);

export const FIREBASE_PROJECT_ID = getConfigValue(
  "FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
);
