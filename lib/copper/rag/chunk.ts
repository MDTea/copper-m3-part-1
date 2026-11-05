// Cuts one page of a document into passages: a few sentences each, small
// enough that a search can point at the exact part of the page that answers a
// question. Every passage starts with its document's title, so the title is
// part of what gets embedded and searched.

const SENTENCES_PER_PASSAGE = 3;
/** A passage stops growing past this many characters, even before 3 sentences. */
const MAX_CHARS = 700;
/** A leftover bit shorter than this is joined onto the passage before it. */
const MIN_TAIL_CHARS = 120;

/** Splits text into sentences, after turning line breaks into spaces. */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(•])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The passages for one page, each starting with the document title. */
export function chunkPage(title: string, pageText: string): string[] {
  const bodies: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const sentence of splitSentences(pageText)) {
    current.push(sentence);
    length += sentence.length + 1;
    if (current.length >= SENTENCES_PER_PASSAGE || length >= MAX_CHARS) {
      bodies.push(current.join(" "));
      current = [];
      length = 0;
    }
  }
  if (current.length) {
    const tail = current.join(" ");
    if (bodies.length && tail.length < MIN_TAIL_CHARS) {
      bodies[bodies.length - 1] += " " + tail;
    } else {
      bodies.push(tail);
    }
  }
  return bodies.map((body) => `${title}: ${body}`);
}
