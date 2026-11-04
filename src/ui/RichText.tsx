/** Manifest text: blank lines separate paragraphs, `backticks` mark inline code, **stars** bold text. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>
          {para.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
              <code key={j}>{part.slice(1, -1)}</code>
            ) : part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{part}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}
