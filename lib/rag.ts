// lib/rag.ts
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY! // or SERVICE_ROLE_KEY if this never runs client-side
);

export type RagResult = {
  context: string;      // annotated context text
  confidence: "none" | "low" | "medium" | "high";
};

export async function getAdamContext(
  query: string
): Promise<RagResult> {
  if (!query.trim()) {
    return { context: "", confidence: "none" };
  }

  // 1) Embed the user query
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: query,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  // 2) Call your Supabase match function
  const { data, error } = await supabase.rpc("match_adam_documents", {
    query_embedding: queryEmbedding,
    match_count: 8,
    similarity_threshold: 0, // we'll filter in code
  });

  if (error) {
    console.error("RAG error:", error);
    return { context: "", confidence: "none" };
  }

  if (!data || data.length === 0) {
    return { context: "", confidence: "none" };
  }

  // Expecting rows like: { content, similarity, title }
  type Row = { content: string; similarity: number; title?: string };

  const rows: Row[] = data;

  // Filter low similarity
  const filtered = rows.filter(r => r.similarity >= 0.72);

  if (filtered.length === 0) {
    return { context: "", confidence: "low" };
  }

  const topScore = filtered[0].similarity;

  const confidence: RagResult["confidence"] =
    topScore >= 0.82 ? "high" : "medium";

  const annotated = filtered
    .map((r, i) => {
      const level =
        r.similarity >= 0.82 ? "HIGH" : r.similarity >= 0.75 ? "MEDIUM" : "LOW";
      return `[[DOC ${i + 1} | CONFIDENCE:${level} | SCORE:${r.similarity.toFixed(
        2
      )} | TITLE:${r.title ?? "unknown"}]]\n${r.content}`;
    })
    .join("\n\n---\n\n");

  return { context: annotated, confidence };
}
