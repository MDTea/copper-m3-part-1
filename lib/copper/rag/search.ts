// Finds the passages of the customer documents closest in meaning to a
// question: embed the question, compare it with every saved passage, keep the
// best few. Each hit carries its document title, page and a link that opens
// the PDF at that page.
import { callEmbed } from "@/lib/ai/call";
import { DOCUMENTS } from "@/lib/copper/documents";
import { passageStore, type Passage } from "@/lib/copper/rag/passages";

/** How many passages a search returns. */
export const TOP_K = 5;

export type DocHit = {
  /** 1 is the closest. */
  rank: number;
  documentId: string;
  title: string;
  page: number;
  /** The passage, without the title it starts with in storage. */
  text: string;
  /** Opens the PDF at the passage's page. */
  url: string;
  /** The source line Copper puts after a sentence: a link like [Title, p. 9](url). */
  citation: string;
  /** How close in meaning, from -1 to 1 (higher is closer). */
  score: number;
};

export type DocSearchResult =
  | { status: "ok"; query: string; results: DocHit[] }
  | { status: "unavailable"; message: string };

/** The URL of a PDF opened at one page (PDF viewers read `#page=`). */
export function pageUrl(file: string, page: number): string {
  return `${file}#page=${page}`;
}

/**
 * The `k` passages whose embeddings are closest to `query`. Every vector has
 * length 1, so the dot product is the cosine similarity.
 */
export function nearestPassages(
  query: number[],
  passages: Passage[],
  k: number = TOP_K,
): { passage: Passage; score: number }[] {
  return passages
    .map((passage) => ({
      passage,
      score: passage.embedding.reduce((sum, x, i) => sum + x * query[i], 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Turns the closest passages into hits with a page link each. */
export function toHits(
  nearest: { passage: Passage; score: number }[],
): DocHit[] {
  return nearest.map(({ passage, score }, i) => {
    const doc = DOCUMENTS.find((d) => d.id === passage.documentId);
    const url = pageUrl(
      doc?.file ?? `/docs/${passage.documentId}.pdf`,
      passage.page,
    );
    return {
      rank: i + 1,
      documentId: passage.documentId,
      title: passage.title,
      page: passage.page,
      text: passage.text.replace(`${passage.title}: `, ""),
      url,
      citation: `[${passage.title}, p. ${passage.page}](${url})`,
      score: Math.round(score * 1000) / 1000,
    };
  });
}

/** Embeds the question and returns the 5 closest passages. */
export async function searchDocs(query: string): Promise<DocSearchResult> {
  try {
    const { embeddings } = await callEmbed(
      { module: 3, feature: "search-docs" },
      { values: [query], kind: "query" },
    );
    const nearest = nearestPassages(embeddings[0], passageStore.passages);
    return { status: "ok", query, results: toHits(nearest) };
  } catch {
    return {
      status: "unavailable",
      message:
        "The documents can't be searched right now. Please try again soon.",
    };
  }
}
