import type { Command } from "../types";

export const history: Command = {
  name: "history",
  help: "show history",
  run: (_args, ctx) => ({ type: "history", items: ctx.history }),
};
