import { WHOAMI } from "../content/site";
import type { Command } from "../types";

export const whoami: Command = {
  name: "whoami",
  help: "one-line bio",
  run: () => ({ type: "segments", parts: [...WHOAMI] }),
};
