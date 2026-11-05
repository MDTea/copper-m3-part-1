import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL } from "@/lib/ai/models";
import { DOCUMENTS } from "@/lib/copper/documents";
import { chunkPage, splitSentences } from "@/lib/copper/rag/chunk";
import { passageStore } from "@/lib/copper/rag/passages";

describe("splitSentences", () => {
  it("splits on sentence ends and flattens line breaks", () => {
    expect(splitSentences("One thing.\nAnother thing!  Is it? Yes.")).toEqual([
      "One thing.",
      "Another thing!",
      "Is it?",
      "Yes.",
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(splitSentences("  \n ")).toEqual([]);
  });
});

describe("chunkPage", () => {
  it("starts every passage with the document title", () => {
    const text = Array.from(
      { length: 8 },
      (_, i) => `Sentence number ${i}.`,
    ).join(" ");
    const passages = chunkPage("My Guide", text);
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages) expect(p.startsWith("My Guide: ")).toBe(true);
  });

  it("keeps a few sentences in each passage", () => {
    const sentence =
      "This sentence is long enough to stand on its own in a passage.";
    const text = Array.from({ length: 6 }, () => sentence).join(" ");
    const passages = chunkPage("T", text);
    expect(passages).toHaveLength(2);
  });

  it("joins a tiny leftover onto the passage before it", () => {
    const sentence =
      "This sentence is long enough to stand on its own in a passage.";
    const text = `${sentence} ${sentence} ${sentence} Short end.`;
    expect(chunkPage("T", text)).toHaveLength(1);
  });

  it("makes no passages from an empty page", () => {
    expect(chunkPage("T", "   ")).toEqual([]);
  });
});

describe("saved document embeddings", () => {
  it("covers every document, with a title and page on each passage", () => {
    const ids = new Set(passageStore.passages.map((p) => p.documentId));
    for (const doc of DOCUMENTS) expect(ids.has(doc.id)).toBe(true);
    for (const p of passageStore.passages) {
      const doc = DOCUMENTS.find((d) => d.id === p.documentId);
      expect(p.title).toBe(doc?.title);
      expect(p.text.startsWith(`${p.title}: `)).toBe(true);
      expect(Number.isInteger(p.page) && p.page >= 1).toBe(true);
    }
  });

  it("has one embedding of the expected size per passage", () => {
    expect(passageStore.model).toBe(EMBEDDING_MODEL.id);
    expect(passageStore.dimensions).toBe(EMBEDDING_MODEL.dimensions);
    for (const p of passageStore.passages) {
      expect(p.embedding).toHaveLength(EMBEDDING_MODEL.dimensions);
    }
  });
});
