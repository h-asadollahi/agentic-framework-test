/**
 * Simple structured logger.
 *
 * In production, trigger.dev captures console output as run logs automatically.
 * This wrapper adds structured JSON formatting and log levels.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatEntry(level: LogLevel, message: string, data?: Record<string, unknown>) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  });
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>) {
    if (shouldLog("debug")) console.debug(formatEntry("debug", message, data));
  },

  info(message: string, data?: Record<string, unknown>) {
    if (shouldLog("info")) console.info(formatEntry("info", message, data));
  },

  warn(message: string, data?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatEntry("warn", message, data));
  },

  error(message: string, data?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(formatEntry("error", message, data));
  },
};
