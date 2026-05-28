import type { Command } from "../types";

export const exit: Command = {
  name: "exit",
  help: "leave",
  run: () => ({ type: "text", text: "you can't leave. there's no door." }),
};
