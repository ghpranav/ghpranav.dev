import { SKILLS } from "../content/site";
import type { Command } from "../types";

export const skills: Command = {
  name: "skills",
  help: "stack",
  run: () => ({ type: "skills", data: SKILLS }),
};
