import { CONTACTS } from "../content/site";
import type { Command } from "../types";

export const contact: Command = {
  name: "contact",
  help: "contact info",
  run: () => ({ type: "contact", data: CONTACTS }),
};
