export const LOG_LEVEL = {
  DEBUG: "DEBUG",
  ERROR: "ERROR",
  INFO: "INFO",
  WARN: "WARN",
} as const;

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

interface LoggerOptions {
  scope?: string;
}

type LogMethod = (message: string, ...meta: unknown[]) => void;

const nodeEnv =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV ?? "production";
const isDevelopment = nodeEnv === "development";

function writeLog(
  level: LogLevel,
  scope: string | undefined,
  message: string,
  meta: unknown[]
) {
  if (!isDevelopment) {
    return;
  }

  const prefix = scope ? `[${level}][${scope}]` : `[${level}]`;
  const consoleMethod =
    level === LOG_LEVEL.ERROR
      ? console.error
      : level === LOG_LEVEL.WARN
        ? console.warn
        : console.info;

  consoleMethod(prefix, message, ...meta);
}

export function createLogger(options: LoggerOptions = {}) {
  const { scope } = options;

  const log = (level: LogLevel): LogMethod => {
    return (message: string, ...meta: unknown[]) => {
      writeLog(level, scope, message, meta);
    };
  };

  return {
    debug: log(LOG_LEVEL.DEBUG),
    error: log(LOG_LEVEL.ERROR),
    info: log(LOG_LEVEL.INFO),
    warn: log(LOG_LEVEL.WARN),
  };
}

export const logger = createLogger();
