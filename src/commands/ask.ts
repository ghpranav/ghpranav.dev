import type { Command } from "../types";

export const ask: Command = {
  name: "ask",
  help: "chat with on-device LLM",
  run: (args, ctx) => {
    ctx.enterChat({ flags: args });
    return null;
  },
};
