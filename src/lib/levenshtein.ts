// Tiny Levenshtein "did you mean?" helper for the unknown-command path.

export function closest(input: string, options: readonly string[]): string {
  let best = options[0];
  let bestD = Infinity;
  for (const o of options) {
    const d = lev(input, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return bestD <= 3 ? best : "help";
}

function lev(a: string, b: string): number {
  const m: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] =
        a[i - 1] === b[j - 1]
          ? m[i - 1][j - 1]
          : 1 + Math.min(m[i - 1][j], m[i][j - 1], m[i - 1][j - 1]);
    }
  }
  return m[a.length][b.length];
}
