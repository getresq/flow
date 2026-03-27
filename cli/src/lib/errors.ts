export const EXIT_CODES = {
  OK: 0,
  GENERAL: 1,
  USAGE: 2,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class CliError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = EXIT_CODES.GENERAL) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export class BadArgumentError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.USAGE);
    this.name = "BadArgumentError";
  }
}

export class NetworkError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.GENERAL);
    this.name = "NetworkError";
  }
}

export class EmptyResultError extends CliError {
  constructor(message = "no matching results") {
    super(message, EXIT_CODES.GENERAL);
    this.name = "EmptyResultError";
  }
}

export function normalizeNetworkError(error: unknown, url: string): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new NetworkError(`request timed out: ${url}`);
  }

  if (error instanceof Error && error.message) {
    return new NetworkError(`request failed: ${url} (${error.message})`);
  }

  return new NetworkError(`request failed: ${url}`);
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return new CliError(error.message);
  }

  return new CliError("unexpected CLI error");
}
