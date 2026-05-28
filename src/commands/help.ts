import { COMMAND_REGISTRY } from "./index";
import type { Command } from "../types";

export const help: Command = {
  name: "help",
  help: "list commands",
  hidden: true,
  run: () => ({
    type: "help",
    rows: COMMAND_REGISTRY
      .filter((c) => !c.hidden)
      .map((c) => [c.name, c.help] as const),
  }),
};
