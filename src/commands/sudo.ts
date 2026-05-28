import type { Command } from "../types";

export const sudo: Command = {
  name: "sudo",
  help: "elevated",
  hidden: true,
  run: () => ({
    type: "error",
    text: "pranav is not in the sudoers file. This incident will be reported.",
  }),
};
