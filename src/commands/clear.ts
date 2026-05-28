import type { Command } from "../types";

export const clear: Command = {
  name: "clear",
  help: "clear screen",
  aliases: ["cls"],
  run: (_args, ctx) => {
    ctx.clear();
    return null;
  },
};
