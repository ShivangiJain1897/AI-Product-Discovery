// Pure arithmetic evaluator (client-safe).
/** Tiny arithmetic evaluator: + - * / parentheses, numbers and input names. No eval(). */
export function evalFormula(formula: string, vars: Record<string, number | null>): { value: number | null; error?: string; missing: string[] } {
  const tokens = formula.match(/\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/])/g)?.map((t) => t.trim()) ?? [];
  if (tokens.join("").length !== formula.replace(/\s+/g, "").length) return { value: null, error: "Formula has unsupported characters.", missing: [] };
  let pos = 0; const missing: string[] = [];
  const peek = () => tokens[pos];
  const expr = (): number => { let v = term(); while (peek() === "+" || peek() === "-") { const op = tokens[pos++]; const r = term(); v = op === "+" ? v + r : v - r; } return v; };
  const term = (): number => { let v = factor(); while (peek() === "*" || peek() === "/") { const op = tokens[pos++]; const r = factor(); v = op === "*" ? v * r : v / r; } return v; };
  const factor = (): number => {
    const t = tokens[pos++];
    if (t === undefined) throw new Error("Formula ended unexpectedly.");
    if (t === "-") return -factor();
    if (t === "(") { const v = expr(); if (tokens[pos++] !== ")") throw new Error("Missing closing parenthesis."); return v; }
    if (/^\d/.test(t)) return parseFloat(t);
    if (/^[A-Za-z_]/.test(t)) { const v = vars[t]; if (v === undefined) throw new Error(`Unknown input “${t}”.`); if (v === null) { missing.push(t); return NaN; } return v; }
    throw new Error(`Unexpected “${t}”.`);
  };
  try {
    const v = expr();
    if (pos < tokens.length) return { value: null, error: "Formula has extra characters.", missing };
    if (missing.length) return { value: null, missing };
    return { value: Number.isFinite(v) ? v : null, error: Number.isFinite(v) ? undefined : "Result is not a finite number.", missing };
  } catch (e) { return { value: null, error: (e as Error).message, missing }; }
}

