import { splitInlineCode } from "./inlineCode";

// The scenario's short explanation. Plain text only: the paragraphs are never
// rendered as HTML or Markdown.
export function Why({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) return null;

  return (
    <details className="why">
      <summary>Why</summary>
      <div className="why-body">
        {paragraphs.map((paragraph, i) => (
          <p key={i}>
            {splitInlineCode(paragraph).map((part, j) =>
              part.code ? <code key={j}>{part.text}</code> : part.text,
            )}
          </p>
        ))}
      </div>
    </details>
  );
}
