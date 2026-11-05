// npm run embed:docs: read every PDF in public/docs/, cut each page into
// passages, embed them with Gemini and save them all to
// lib/copper/data/document-embeddings.json (which the app loads at startup).
// Run it again whenever a PDF changes.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";
import { callEmbed } from "@/lib/ai/call";
import { EMBEDDING_MODEL } from "@/lib/ai/models";
import { chunkPage } from "@/lib/copper/rag/chunk";
import type { Passage, PassageStore } from "@/lib/copper/rag/passages";
import { DOCUMENTS } from "@/lib/copper/documents";

const DOCS_DIR = path.join("public", "docs");
const OUT_FILE = path.join("lib", "copper", "data", "document-embeddings.json");

type Pending = Omit<Passage, "embedding">;

async function readPages(file: string): Promise<string[]> {
  const bytes = new Uint8Array(await readFile(file));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

// Google's free tier allows 100 embeddings a minute, so embed in batches of 80
// and wait for the limit to reset between them (and again if it is hit anyway).
const BATCH = 80;
const WAIT_MS = 65_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedInBatches(values: string[]) {
  const embeddings: number[][] = [];
  for (let start = 0; start < values.length; start += BATCH) {
    if (start > 0) {
      console.log(`Waiting a minute for Google's rate limit to reset...`);
      await sleep(WAIT_MS);
    }
    const batch = values.slice(start, start + BATCH);
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await callEmbed(
          { module: 3, feature: "embed-docs" },
          { values: batch, kind: "document" },
        );
        embeddings.push(...result.embeddings);
        break;
      } catch (error) {
        const quota = /quota|rate limit/i.test(String(error));
        if (!quota || attempt >= 4) throw error;
        console.log(`Rate limit hit, retrying in a minute (try ${attempt})...`);
        await sleep(WAIT_MS);
      }
    }
    console.log(
      `Embedded ${Math.min(start + BATCH, values.length)} of ${values.length}`,
    );
  }
  return embeddings;
}

async function main() {
  const onDisk = (await readdir(DOCS_DIR)).filter((f) => f.endsWith(".pdf"));
  const known = new Set(DOCUMENTS.map((d) => path.basename(d.file)));
  for (const name of onDisk) {
    if (!known.has(name)) {
      console.warn(`Skipping ${name}: not listed in lib/copper/documents.ts`);
    }
  }

  const pending: Pending[] = [];
  const counts: { title: string; pages: number; passages: number }[] = [];
  for (const doc of DOCUMENTS) {
    const name = path.basename(doc.file);
    if (!onDisk.includes(name)) {
      throw new Error(
        `${name} is listed in documents.ts but not in ${DOCS_DIR}`,
      );
    }
    const pages = await readPages(path.join(DOCS_DIR, name));
    let made = 0;
    pages.forEach((pageText, i) => {
      chunkPage(doc.title, pageText).forEach((text, n) => {
        pending.push({
          id: `${doc.id}-p${i + 1}-${n + 1}`,
          documentId: doc.id,
          title: doc.title,
          page: i + 1,
          text,
        });
        made++;
      });
    });
    counts.push({ title: doc.title, pages: pages.length, passages: made });
  }

  const embeddings = await embedInBatches(pending.map((p) => p.text));

  const store: PassageStore = {
    model: EMBEDDING_MODEL.id,
    dimensions: EMBEDDING_MODEL.dimensions,
    passages: pending.map((p, i) => ({
      ...p,
      embedding: embeddings[i].map((x) => Number(x.toFixed(6))),
    })),
  };
  await writeFile(OUT_FILE, JSON.stringify(store) + "\n");

  for (const c of counts) {
    console.log(`${c.title}: ${c.passages} passages (${c.pages} pages)`);
  }
  console.log(`Total: ${pending.length} passages, saved to ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
