// ═══════════════════════════════════════════════════════════════════════════
// Renderer for a single terminal line. Pure presentational — picks a layout
// based on the `TerminalLine` discriminator.
// ═══════════════════════════════════════════════════════════════════════════

import type { ReactNode } from "react";
import type { Theme } from "../themes";
import type { TerminalLine } from "../types";

type LineProps = {
  line: TerminalLine;
  theme: Theme;
  animate?: boolean;
  streaming?: boolean;
};

export function Line({ line, theme, animate = true, streaming }: LineProps) {
  const wrap = (kids: ReactNode) => (
    <div
      className="ptl-line"
      style={{
        animation: animate ? undefined : "none",
        whiteSpace: "pre-wrap",
        marginBottom: 4,
      }}
    >
      {kids}
    </div>
  );

  switch (line.type) {
    case "boot": {
      const tag = line.text.match(/\[.*?\]/)?.[0] ?? "";
      const rest = line.text.replace(/\[.*?\]/, "");
      return wrap(
        <span>
          <span style={{ color: theme.accent2 }}>{tag}</span>
          <span style={{ color: theme.dim }}>{rest}</span>
        </span>,
      );
    }

    case "input": {
      const isChat = !!line.chatMode;
      return wrap(
        <span>
          <span style={{ color: isChat ? theme.accent2 : theme.prompt, fontWeight: 600 }}>
            {line.prompt}{" "}
          </span>
          <span>{line.text}</span>
        </span>,
      );
    }

    case "chat-assistant":
      return wrap(
        <span style={{ color: theme.fg }}>
          <span style={{ color: theme.accent, fontWeight: 600 }}>ai › </span>
          {/* aria-hidden while streaming so the live region doesn't announce per-token;
              removed on completion so the finalized answer is announced once */}
          <span aria-hidden={streaming || undefined}>{line.text}</span>
          {streaming && <span className="ptl-streaming-cursor" aria-hidden />}
        </span>,
      );

    case "text":
      return wrap(<span style={{ color: theme.fg }}>{line.text}</span>);

    case "error":
      return wrap(<span style={{ color: theme.error }}>{line.text}</span>);

    case "ascii":
      return wrap(
        <>
          <pre
            aria-hidden="true"
            style={{
              color: line.accent ? theme.accent : theme.fg,
              margin: 0,
              fontFamily: "inherit",
              fontSize: "11px",
              lineHeight: 1.1,
            }}
          >
            {line.text}
          </pre>
          {line.alt && <span className="sr-only">{line.alt}</span>}
        </>,
      );

    case "segments":
      return wrap(
        <span>
          {line.parts.map((p, i) => (
            <span key={i} style={{ color: theme[p.c] }}>
              {p.t}
            </span>
          ))}
        </span>,
      );

    case "help":
      return wrap(
        <div>
          {line.rows.map(([cmd, desc], i) => (
            <div key={i} style={{ display: "flex", gap: 16 }}>
              <span style={{ color: theme.accent, minWidth: 130, fontWeight: 500 }}>{cmd}</span>
              <span style={{ color: theme.dim }}>{desc}</span>
            </div>
          ))}
        </div>,
      );

    case "skills":
      return wrap(
        <div>
          {Object.entries(line.data).map(([k, vs]) => (
            <div key={k} style={{ marginBottom: 4 }}>
              <span style={{ color: theme.accent2, display: "inline-block", minWidth: 140 }}>
                {k.padEnd(14)}
              </span>
              {vs.map((v, i) => (
                <span key={i} className="ptl-tag">
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>,
      );

    case "projects":
      return wrap(
        <div>
          {line.data.map((p, i) => (
            <div
              key={i}
              style={{
                marginBottom: 10,
                paddingLeft: 14,
                borderLeft: `2px solid ${theme.accent}`,
              }}
            >
              <div>
                {p.href ? (
                  <a className="ptl-link" href={p.href} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                ) : (
                  <span style={{ color: theme.accent, fontWeight: 600 }}>{p.name}</span>
                )}
                <span style={{ color: theme.dim, marginLeft: 12, fontSize: 11 }}>{p.status}</span>
              </div>
              <div style={{ marginTop: 2 }}>{p.blurb}</div>
              <div style={{ marginTop: 4 }}>
                {p.stack.map((s, j) => (
                  <span key={j} className="ptl-tag">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>,
      );

    case "contact":
      return wrap(
        <div>
          {line.data.map((c, i) => (
            <div key={i}>
              <span style={{ color: theme.accent2, display: "inline-block", minWidth: 100 }}>
                {c.k}
              </span>
              <a className="ptl-link" href={c.href} target="_blank" rel="noreferrer">
                {c.v}
              </a>
            </div>
          ))}
        </div>,
      );

    case "history":
      return wrap(
        <div>
          {line.items.length === 0 ? (
            <span style={{ color: theme.dim }}>(no history)</span>
          ) : (
            line.items.map((h, i) => (
              <div key={i}>
                <span
                  style={{
                    color: theme.dim,
                    display: "inline-block",
                    minWidth: 40,
                    textAlign: "right",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ marginLeft: 12 }}>{h}</span>
              </div>
            ))
          )}
        </div>,
      );
  }
}
