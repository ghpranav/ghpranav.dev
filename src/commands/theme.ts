import { THEMES } from "../themes";
import type { Command } from "../types";

export const theme: Command = {
  name: "theme",
  help: "switch theme",
  complete: (args) => {
    // `theme` takes exactly one positional argument. Only offer completions
    // when the in-progress token IS that first argument — i.e. there are
    // no committed (non-empty) tokens before it. Returning [] tells the
    // completion helper to no-op, so Tab after `theme espresso ` does not
    // append a second theme name.
    const committedBefore = args.slice(0, -1).filter((t) => t.length > 0).length;
    return committedBefore === 0 ? Object.keys(THEMES) : [];
  },
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
