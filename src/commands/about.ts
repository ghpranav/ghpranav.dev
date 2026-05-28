import { ABOUT } from "../content/site";
import type { Command } from "../types";

export const about: Command = {
  name: "about",
  help: "longer intro",
  run: () => ({ type: "text", text: ABOUT }),
};
