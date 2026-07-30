/**
 * Tiny safe arithmetic evaluator for the MYOB-style inline calculator.
 *
 * MYOB lets you type a calculation into a numeric field (e.g. `5*3`, `120/2`,
 * `(10+2)*3`) and evaluates it when you tab out. We reproduce that WITHOUT
 * `eval`/`Function` — a hand-written tokeniser + recursive-descent parser that
 * only understands numbers, decimals, `+ - * /`, parentheses and unary minus.
 * Anything it can't parse returns null so the caller can leave the field as-is.
 */

type Token =
  | { t: "num"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (c >= "0" && c <= "9") {
      let num = "";
      while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) {
        num += s[i];
        i++;
      }
      if (num.split(".").length > 2) return null; // more than one decimal point
      const v = Number(num);
      if (Number.isNaN(v)) return null;
      tokens.push({ t: "num", v });
      continue;
    }
    if (c === ".") {
      // a bare decimal like ".5"
      let num = "";
      while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) {
        num += s[i];
        i++;
      }
      const v = Number(num);
      if (Number.isNaN(v)) return null;
      tokens.push({ t: "num", v });
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") { tokens.push({ t: "lp" }); i++; continue; }
    if (c === ")") { tokens.push({ t: "rp" }); i++; continue; }
    return null; // unknown character
  }
  return tokens;
}

/** Recursive-descent parser: expr = term (('+'|'-') term)*; term = factor (('*'|'/') factor)*. */
function parse(tokens: Token[]): number | null {
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }

  function factor(): number | null {
    const tok = peek();
    if (!tok) return null;
    if (tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      pos++; // unary
      const f = factor();
      if (f === null) return null;
      return tok.v === "-" ? -f : f;
    }
    if (tok.t === "lp") {
      pos++;
      const e = expr();
      if (e === null) return null;
      const close = peek();
      if (!close || close.t !== "rp") return null;
      pos++;
      return e;
    }
    if (tok.t === "num") { pos++; return tok.v; }
    return null;
  }

  function term(): number | null {
    let left = factor();
    if (left === null) return null;
    while (true) {
      const tok = peek();
      if (tok && tok.t === "op" && (tok.v === "*" || tok.v === "/")) {
        pos++;
        const right = factor();
        if (right === null) return null;
        if (tok.v === "/") {
          if (right === 0) return null;
          left = left / right;
        } else {
          left = left * right;
        }
      } else break;
    }
    return left;
  }

  function expr(): number | null {
    let left = term();
    if (left === null) return null;
    while (true) {
      const tok = peek();
      if (tok && tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
        pos++;
        const right = term();
        if (right === null) return null;
        left = tok.v === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  }

  const result = expr();
  if (result === null || pos !== tokens.length) return null;
  return result;
}

/**
 * Evaluate an arithmetic expression. Returns the numeric result, or null if the
 * input isn't a valid expression. A plain number returns itself.
 */
export function evalExpression(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;
  const result = parse(tokens);
  if (result === null || !Number.isFinite(result)) return null;
  return result;
}

/** True when the string contains an operator/parenthesis worth evaluating. */
export function looksLikeExpression(input: string): boolean {
  return /[+\-*/()]/.test(input.trim().replace(/^-/, "")); // ignore a leading sign
}
