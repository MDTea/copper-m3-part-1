// The course's approved models. Calls go straight to Google with a Google AI
// Studio key, which is free and needs no credit card.
export const MODELS = [
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash (newest, best answers)",
    // Google's own name for it, used when calling Google.
    googleId: "gemini-3.8-flash",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite (fastest and cheapest)",
    googleId: "gemini-3.1-flash-lite",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

/**
 * The model that turns text into embeddings (lists of numbers that capture
 * meaning), used to search the customer documents. 768 numbers per passage
 * keeps the saved file small while still matching well.
 */
export const EMBEDDING_MODEL = {
  id: "gemini-embedding-001",
  dimensions: 768,
  /** US dollars per million input tokens (Google's list price, 2026-10). */
  pricePerMillionTokens: 0.15,
} as const;

/** The model used when a call doesn't name one. */
export const DEFAULT_MODEL: ModelId = "google/gemini-3.8-flash";

/** AI_MODEL if it names an approved model, otherwise the default. */
export function defaultModel(): ModelId {
  const id = process.env.AI_MODEL;
  return MODELS.find((m) => m.id === id)?.id ?? DEFAULT_MODEL;
}
