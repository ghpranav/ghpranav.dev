// ═══════════════════════════════════════════════════════════════════════════
// Discriminated union of every kind of line the terminal can render.
// The Line component switches on `type` to pick a renderer.
// ═══════════════════════════════════════════════════════════════════════════

import type { WhoamiSegment, Skills, Project, Contact } from "./content/site";
import type { Theme } from "./themes";

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

export type CommandContext = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  clear: () => void;
  history: readonly string[];
  enterChat: (opts: { flags: string[] }) => void;
};

export type Command = {
  name: string;
  help: string;
  aliases?: readonly string[];
  hidden?: boolean;
  complete?: (args: string[], ctx: CommandContext) => readonly string[];
  run: (args: string[], ctx: CommandContext) => CommandResult;
};

export type CommandTableEntry = {
  help: string;
  run: (args: string[]) => CommandResult;
};

export type CommandTable = Record<string, CommandTableEntry>;
