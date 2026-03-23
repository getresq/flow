import type { JsonValue } from "../types.js";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function createDefaultIo(): CliIo {
  return {
    stdout(text) {
      process.stdout.write(text);
    },
    stderr(text) {
      process.stderr.write(text);
    },
  };
}

export function writeStdout(io: CliIo, line = ""): void {
  io.stdout(`${line}\n`);
}

export function writeStderr(io: CliIo, line = ""): void {
  io.stderr(`${line}\n`);
}

export function printJson(io: CliIo, value: unknown): void {
  writeStdout(io, JSON.stringify(value, null, 2));
}

export function printJsonl(io: CliIo, values: unknown[]): void {
  for (const value of values) {
    writeStdout(io, JSON.stringify(value));
  }
}

export function formatEnabled(value: boolean): string {
  return value ? "yes" : "no";
}

export function formatJsonValue(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

export function renderHelp({
  usage,
  sections,
}: {
  usage: string;
  sections: Array<{ title: string; lines: string[] }>;
}): string {
  const chunks = [usage];

  for (const section of sections) {
    chunks.push("");
    chunks.push(section.title);
    chunks.push(...section.lines);
  }

  return `${chunks.join("\n")}\n`;
}
