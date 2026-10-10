export type TextPart = { text: string; code: boolean };

// Splits plain text into normal parts and `inline code` parts. This is the
// only formatting the "Why" text supports. A backtick without a partner is
// kept as normal text.
export function splitInlineCode(text: string): TextPart[] {
  const pieces = text.split("`");
  // An even number of pieces means an odd number of backticks: the last one
  // has no partner, so it and the text after it stay as they are.
  const unmatched = pieces.length % 2 === 0 ? pieces.pop() : undefined;
  if (unmatched !== undefined) pieces[pieces.length - 1] += "`" + unmatched;

  return pieces
    .map((piece, i) => ({ text: piece, code: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}
