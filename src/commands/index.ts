import type {
  Command,
  CommandContext,
  CommandTable,
  CommandTableEntry,
} from "../types";

import { about } from "./about";
import { ask } from "./ask";
import { clear } from "./clear";
import { contact } from "./contact";
import { date } from "./date";
import { echo } from "./echo";
import { exit } from "./exit";
import { help } from "./help";
import { history } from "./history";
import { projects } from "./projects";
import { skills } from "./skills";
import { sudo } from "./sudo";
import { theme } from "./theme";
import { whoami } from "./whoami";

export type { CommandContext } from "../types";

const ALL: readonly Command[] = [
  ask,
  whoami,
  about,
  skills,
  projects,
  contact,
  theme,
  history,
  clear,
  exit,
  help,
  sudo,
  echo,
  date,
];

export const COMMAND_REGISTRY: readonly Command[] = ALL;

export function buildCommands(ctx: CommandContext): CommandTable {
  const table: Record<string, CommandTableEntry> = {};
  for (const cmd of ALL) {
    const entry: CommandTableEntry = {
      help: cmd.help,
      run: (args) => cmd.run(args, ctx),
    };
    table[cmd.name] = entry;
    for (const alias of cmd.aliases ?? []) {
      table[alias] = entry;
    }
  }
  return table;
}
