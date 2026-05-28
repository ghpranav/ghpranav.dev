import type { Command } from "../types";

export const date: Command = {
  name: "date",
  help: "current IST time",
  hidden: true,
  run: () => ({
    type: "text",
    text:
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST",
  }),
};
