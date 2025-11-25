import OpenAI from "openai";
import { supabase } from "./supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function getRelevantDocs(query: string, k = 5) {
  // 1. Embed query with OpenAI
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  // 2. Call your actual Supabase RPC
  const { data, error } = await supabase.rpc("match_adam_documents", {
    query_embedding: queryEmbedding,
    match_count: k,
  });

  if (error) {
    console.error("Supabase match_adam_documents error:", error);
    throw new Error("RAG retrieval failed");
  }

  return data ?? [];
}
