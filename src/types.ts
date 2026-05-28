// ═══════════════════════════════════════════════════════════════════════════
// Discriminated union of every kind of line the terminal can render.
// The Line component switches on `type` to pick a renderer.
// ═══════════════════════════════════════════════════════════════════════════

import type { WhoamiSegment, Skills, Project, Contact } from "./content/site";

export type TerminalLine =
  | { type: "boot"; text: string }
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | { type: "ascii"; text: string; accent?: boolean }
  | { type: "segments"; parts: WhoamiSegment[] }
  | { type: "input"; text: string; prompt: string; chatMode?: boolean }
  | { type: "chat-assistant"; text: string }
  | { type: "help"; rows: ReadonlyArray<readonly [string, string]> }
  | { type: "skills"; data: Skills }
  | { type: "projects"; data: readonly Project[] }
  | { type: "contact"; data: readonly Contact[] }
  | { type: "history"; items: readonly string[] };

export type CommandResult = TerminalLine | null;

export type Command = {
  help: string;
  run: (args: string[]) => CommandResult;
};

export type CommandTable = Record<string, Command>;
