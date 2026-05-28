import type { Command } from "../types";

export const echo: Command = {
  name: "echo",
  help: "print",
  hidden: true,
  run: (args) => ({ type: "text", text: args.join(" ") }),
};
