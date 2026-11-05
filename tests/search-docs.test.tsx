import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLive } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";
import { passageStore } from "@/lib/copper/rag/passages";
import {
  nearestPassages,
  pageUrl,
  TOP_K,
  toHits,
} from "@/lib/copper/rag/search";

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/ai/call");
  vi.doUnmock("@/lib/copper/assistant/ask");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("search over the document passages", () => {
  it("builds a link that opens the PDF at the page", () => {
    expect(pageUrl("/docs/copper-plus-faq.pdf", 5)).toBe(
      "/docs/copper-plus-faq.pdf#page=5",
    );
  });

  it("ranks a passage first when the question embeds exactly like it", () => {
    const target = passageStore.passages[40];
    const found = nearestPassages(target.embedding, passageStore.passages);
    expect(found).toHaveLength(TOP_K);
    expect(found[0].passage.id).toBe(target.id);
    expect(found[0].score).toBeCloseTo(1, 3);
    const scores = found.map((f) => f.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("gives each hit its title, page, passage text and a page link", () => {
    const target = passageStore.passages[40];
    const [hit] = toHits(nearestPassages(target.embedding, [target], 1));
    expect(hit).toMatchObject({
      rank: 1,
      documentId: target.documentId,
      title: target.title,
      page: target.page,
    });
    expect(hit.url).toBe(`/docs/${target.documentId}.pdf#page=${target.page}`);
    expect(hit.text.startsWith(target.title)).toBe(false);
    expect(target.text.endsWith(hit.text)).toBe(true);
  });
});

describe("the search_docs tool", () => {
  async function loadWithEmbedding(vector: number[] | Error) {
    vi.resetModules();
    vi.doMock("@/lib/ai/call", () => ({
      callEmbed: vi.fn(async () => {
        if (vector instanceof Error) throw vector;
        return { embeddings: [vector], tokens: null };
      }),
    }));
    return {
      tools: await import("@/lib/copper/assistant/tools"),
      search: await import("@/lib/copper/rag/search"),
    };
  }

  it("is offered to Copper, with a description that says when to use it", async () => {
    const { tools } = await loadWithEmbedding([]);
    expect(Object.keys(tools.copperTools)).toContain("search_docs");
    expect(tools.copperTools.search_docs.description).toMatch(/warranty/i);
    expect(
      tools.searchDocsInput.safeParse({ query: "reset Wi-Fi" }).success,
    ).toBe(true);
    expect(tools.searchDocsInput.safeParse({ query: "  " }).success).toBe(
      false,
    );
  });

  it("returns the 5 closest passages with title, page and link", async () => {
    const target = passageStore.passages[100];
    const { search } = await loadWithEmbedding(target.embedding);
    const result = await search.searchDocs("anything");
    if (result.status !== "ok") throw new Error("expected results");
    expect(result.results).toHaveLength(5);
    expect(result.results[0]).toMatchObject({
      documentId: target.documentId,
      title: target.title,
      page: target.page,
    });
    for (const hit of result.results) {
      expect(hit.url).toMatch(/^\/docs\/[a-z-]+\.pdf#page=\d+$/);
    }
  });

  it("says the documents can't be searched when embedding fails, instead of throwing", async () => {
    const { search } = await loadWithEmbedding(new Error("boom"));
    const result = await search.searchDocs("anything");
    expect(result.status).toBe("unavailable");
  });
});

describe("the search_docs tool card", () => {
  it("shows each passage with its title and a link that opens the PDF at its page", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
    const target = passageStore.passages[100];
    const hits = toHits(
      nearestPassages(target.embedding, passageStore.passages),
    );
    const done = createLive<Progress>();
    done.done({
      reply: "Annual plans are refunded within 14 days.",
      status: "done",
      steps: [
        {
          type: "tool",
          id: "call-1",
          name: "search_docs",
          state: "done",
          input: { query: "annual refund" },
          output: { status: "ok", query: "annual refund", results: hits },
        },
      ],
    });
    vi.doMock("@/lib/copper/assistant/ask", () => ({
      askCopper: vi.fn(async () => ({ progress: done.live })),
    }));
    vi.resetModules();
    const { default: Home } = await import("@/app/page");
    const page = Home as unknown as () =>
      React.ReactNode | Promise<React.ReactNode>;
    render(<>{await page()}</>);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const chat = within(await screen.findByTestId("ask-copper"));
    fireEvent.change(chat.getByRole("textbox"), {
      target: { value: "annual refund" },
    });
    fireEvent.click(chat.getByRole("button", { name: /send/i }));

    const card = await screen.findByTestId("tool-call");
    expect(card).toHaveAttribute("data-tool", "search_docs");
    const passages = await within(card).findAllByTestId("doc-passage");
    expect(passages).toHaveLength(5);
    await waitFor(() =>
      expect(within(passages[0]).getByRole("link")).toHaveAttribute(
        "href",
        hits[0].url,
      ),
    );
    expect(passages[0]).toHaveTextContent(`1. ${hits[0].title}`);
    expect(passages[0]).toHaveTextContent(hits[0].text.slice(0, 40));
    expect(within(passages[0]).getByRole("link")).toHaveTextContent(
      `Page ${hits[0].page}`,
    );
  });
});
