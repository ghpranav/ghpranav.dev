import { PROJECTS } from "../content/site";
import type { Command } from "../types";

export const projects: Command = {
  name: "projects",
  help: "selected work",
  run: () => ({ type: "projects", data: PROJECTS }),
};
