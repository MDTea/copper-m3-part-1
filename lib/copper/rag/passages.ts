// The customer documents, cut into passages and embedded. `npm run embed:docs`
// builds data/document-embeddings.json from the PDFs in public/docs/. Importing
// the file here loads every passage into memory once, when the app starts.
import data from "../data/document-embeddings.json";

/** One passage of a document, with where it came from and its embedding. */
export type Passage = {
  id: string;
  documentId: string;
  /** The document's title. The passage text also starts with it. */
  title: string;
  /** The page of the PDF it came from, starting at 1. */
  page: number;
  text: string;
  embedding: number[];
};

export type PassageStore = {
  /** The embedding model that made every vector, so queries use the same one. */
  model: string;
  dimensions: number;
  passages: Passage[];
};

/** Every passage, held in memory for the life of the app. */
export const passageStore: PassageStore = data;
