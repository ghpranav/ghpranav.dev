// ═══════════════════════════════════════════════════════════════════════════
// Shell command table. Pure mapping from command name → output line.
// Commands that need to mutate terminal state (clear, theme, enter chat)
// receive callbacks through the `ctx` argument.
// ═══════════════════════════════════════════════════════════════════════════

import { THEMES, type Theme } from "../themes";
import {
  WHOAMI,
  ABOUT,
  SKILLS,
  PROJECTS,
  CONTACTS,
} from "../content/site";
import type { CommandTable, TerminalLine } from "../types";

export type CommandContext = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  clear: () => void;
  history: readonly string[];
  enterChat: (opts: { flags: string[] }) => void;
};

export function buildCommands(ctx: CommandContext): CommandTable {
  const { setTheme, theme, clear, history, enterChat } = ctx;

  const help: TerminalLine = {
    type: "help",
    rows: [
      ["ask", "chat with an on-device LLM about Pranav  ✨"],
      ["whoami", "the one-line bio"],
      ["about", "longer intro"],
      ["skills", "stack overview"],
      ["projects", "selected work"],
      ["contact", "where to find me"],
      ["theme", "switch theme — `theme <name>`"],
      ["history", "command history"],
      ["clear", "clear screen  (Ctrl+L)"],
      ["exit", "(you can't)"],
    ],
  };

  return {
    help: { help: "list commands", run: () => help },
    whoami: { help: "one-line bio", run: () => ({ type: "segments", parts: [...WHOAMI] }) },
    about: { help: "longer intro", run: () => ({ type: "text", text: ABOUT }) },
    skills: { help: "stack", run: () => ({ type: "skills", data: SKILLS }) },
    projects: { help: "selected work", run: () => ({ type: "projects", data: PROJECTS }) },
    contact: { help: "contact info", run: () => ({ type: "contact", data: CONTACTS }) },
    ask: {
      help: "chat with on-device LLM",
      run: (args) => {
        enterChat({ flags: args });
        return null;
      },
    },
    theme: {
      help: "switch theme",
      run: (args) => {
        const name = args[0];
        if (!name) {
          return {
            type: "text",
            text:
              `usage: theme <name>\n` +
              `available: ${Object.keys(THEMES).join(" · ")}\n` +
              `current: ${theme.name}`,
          };
        }
        const next = THEMES[name as keyof typeof THEMES];
        if (!next) return { type: "error", text: `theme: '${name}' not found` };
        setTheme(next);
        return { type: "text", text: `theme → ${name}` };
      },
    },
    history: { help: "show history", run: () => ({ type: "history", items: history }) },
    clear: { help: "clear screen", run: () => { clear(); return null; } },
    cls: { help: "alias of clear", run: () => { clear(); return null; } },
    sudo: {
      help: "elevated",
      run: () => ({
        type: "error",
        text: "pranav is not in the sudoers file. This incident will be reported.",
      }),
    },
    exit: {
      help: "leave",
      run: () => ({ type: "text", text: "you can't leave. there's no door." }),
    },
    echo: { help: "print", run: (a) => ({ type: "text", text: a.join(" ") }) },
    date: {
      help: "current IST time",
      run: () => ({
        type: "text",
        text:
          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST",
      }),
    },
  };
}
