import { THEMES } from "../themes";
import type { Command } from "../types";

export const theme: Command = {
  name: "theme",
  help: "switch theme",
  run: (args, ctx) => {
    const name = args[0];
    if (!name) {
      return {
        type: "text",
        text:
          `usage: theme <name>\n` +
          `available: ${Object.keys(THEMES).join(" · ")}\n` +
          `current: ${ctx.theme.name}`,
      };
    }
    const next = THEMES[name as keyof typeof THEMES];
    if (!next) return { type: "error", text: `theme: '${name}' not found` };
    ctx.setTheme(next);
    return { type: "text", text: `theme → ${name}` };
  },
};
