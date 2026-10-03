export type TokenKind = "plain" | "comment" | "string" | "keyword" | "number";
export type Token = { text: string; kind: TokenKind };

const KEYWORDS =
  "const|let|var|return|if|else|async|await|import|from|export|function|new|throw|try|catch|finally|for|of|in|while|true|false|null|undefined";

// Light highlighting for one line of JavaScript: comments, strings, keywords
// and numbers. Display code keeps strings and comments on a single line.
const PATTERN = new RegExp(
  [
    String.raw`(\/\/.*$)`,
    String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`)",
    String.raw`\b(${KEYWORDS})\b`,
    String.raw`\b(\d+(?:\.\d+)?)\b`,
  ].join("|"),
  "g",
);

const KINDS: TokenKind[] = ["comment", "string", "keyword", "number"];

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of line.matchAll(PATTERN)) {
    if (match.index > last) tokens.push({ text: line.slice(last, match.index), kind: "plain" });
    const kind = KINDS[match.slice(1).findIndex((group) => group !== undefined)] ?? "plain";
    tokens.push({ text: match[0], kind });
    last = match.index + match[0].length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), kind: "plain" });
  return tokens;
}
