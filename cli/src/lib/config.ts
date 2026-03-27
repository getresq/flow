import { BadArgumentError } from "./errors.js";

export type OutputMode = "human" | "json" | "jsonl";

export const DEFAULT_BASE_URL = "http://localhost:4200";
export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_LOG_WINDOW = "15m";

export interface OutputFlagOptions {
  json?: boolean;
  jsonl?: boolean;
}

export function resolveBaseUrl(raw = DEFAULT_BASE_URL): string {
  const value = raw.trim();
  if (!value) {
    throw new BadArgumentError("base URL cannot be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadArgumentError(`invalid URL: ${raw}`);
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

export function resolveTimeout(raw?: string): number {
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadArgumentError(`invalid timeout: ${raw}`);
  }

  return value;
}

export function resolveOutputMode(options: OutputFlagOptions = {}): OutputMode {
  if (options.json && options.jsonl) {
    throw new BadArgumentError("choose only one of --json or --jsonl");
  }

  if (options.json) {
    return "json";
  }

  if (options.jsonl) {
    return "jsonl";
  }

  return "human";
}

export function resolveWindow(raw?: string): string {
  const value = (raw ?? DEFAULT_LOG_WINDOW).trim();
  if (!/^\d+[smh]$/.test(value)) {
    throw new BadArgumentError(
      `invalid window: ${raw ?? value} (expected <number><unit> with s, m, or h)`,
    );
  }

  return value;
}
