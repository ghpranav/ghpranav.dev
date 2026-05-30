// ═══════════════════════════════════════════════════════════════════════════
// Tab completion helper.
//
// Pure function — no DOM, no React, no module-level mutable state.
// Given the current input and the command registry, returns one of:
//   - none:   nothing matches, or the command's complete() threw
//   - single: exactly one candidate; caller replaces input with `replacement`
//   - many:   two or more candidates; caller lists them and may cycle
//
// The caller (Terminal.tsx) owns the cycle state ref. This module just
// computes "what could complete?" — it has no opinion on consecutive
// keypresses.
// ═══════════════════════════════════════════════════════════════════════════

import type { Command, CommandContext } from "../types";

export type CompletionResult =
  | { kind: "none" }
  | { kind: "single"; replacement: string }
  | {
      kind: "many";
      candidates: readonly string[];
      prefix: string;
      tokenStart: number;
    };

export function complete(
  input: string,
  registry: readonly Command[],
  ctx: CommandContext,
): CompletionResult {
  const hasWhitespace = /\s/.test(input);

  if (!hasWhitespace) {
    return completeCommandName(input, registry);
  }

  return completeArgument(input, registry, ctx);
}

function completeCommandName(
  input: string,
  registry: readonly Command[],
): CompletionResult {
  // Collect every invokable key (primary names + aliases, including hidden).
  // Dedupe while preserving registry order in case a name collides across
  // entries (shouldn't happen, but stay defensive).
  const seen = new Set<string>();
  const allNames: string[] = [];
  for (const cmd of registry) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      allNames.push(cmd.name);
    }
    for (const alias of cmd.aliases ?? []) {
      if (!seen.has(alias)) {
        seen.add(alias);
        allNames.push(alias);
      }
    }
  }

  const matches = allNames.filter((n) => n.startsWith(input));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) {
    return { kind: "single", replacement: matches[0] + " " };
  }
  return { kind: "many", candidates: matches, prefix: "", tokenStart: 0 };
}

function completeArgument(
  input: string,
  registry: readonly Command[],
  ctx: CommandContext,
): CompletionResult {
  const firstSpace = input.search(/\s/);
  const cmdName = input.slice(0, firstSpace);
  const rest = input.slice(firstSpace + 1);

  const cmd = registry.find(
    (c) => c.name === cmdName || (c.aliases?.includes(cmdName) ?? false),
  );
  if (!cmd || !cmd.complete) return { kind: "none" };

  // Tokenize the argument portion. The last element is the in-progress
  // token (possibly ""). When the user just typed a space and pressed Tab,
  // rest is "" → restTokens is [""] → currentToken is "".
  const restTokens = rest.split(/\s+/);
  const currentToken = restTokens[restTokens.length - 1];

  let candidates: readonly string[];
  try {
    candidates = cmd.complete(restTokens, ctx);
  } catch (err) {
    console.warn(
      "Tab completion: command.complete() threw, degrading to no-op",
      { command: cmd.name, error: err },
    );
    return { kind: "none" };
  }

  const matches = candidates.filter((c) => c.startsWith(currentToken));
  if (matches.length === 0) return { kind: "none" };

  const tokenStart = input.length - currentToken.length;
  const prefix = input.slice(0, tokenStart);

  if (matches.length === 1) {
    return { kind: "single", replacement: prefix + matches[0] + " " };
  }
  return { kind: "many", candidates: matches, prefix, tokenStart };
}
