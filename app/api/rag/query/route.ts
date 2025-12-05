// app/api/rag/query/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const query = String(body.query ?? "").trim();
    const matchCount: number = body.matchCount ?? 5;

    if (!query) {
      return NextResponse.json(
        { matches: [], error: "Missing 'query'." },
        { status: 400 }
      );
    }

    // 1) Embed the query – MUST match your document embedding model
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small", // match ingestadamdocs.mjs
      input: query,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    // 2) Vector search via existing RPC match_adam_documents
    //    RPC should return at least: id, content, similarity, title (optional)
    const { data: vectorMatches, error: rpcError } = await supabase.rpc(
      "match_adam_documents",
      {
        query_embedding: queryEmbedding,
        match_count: matchCount,
      }
    );

    if (rpcError) {
      console.error("[RAG] match_adam_documents error:", rpcError);
    }

    // 3) Optional keyword boost for PPL / People Powered Ledger
    const needsKeywordBoost =
      /ppl/i.test(query) || /people powered ledger/i.test(query);

    let keywordMatchesRaw: any[] = [];

    if (needsKeywordBoost) {
      const { data, error } = await supabase
        .from("adam_documents")
        .select("id, title, content, metadata")
        .or("content.ilike.*PPL*,content.ilike.*People Powered Ledger*")
        .limit(matchCount * 2);

      if (error) {
        console.error("[RAG] keyword PPL search error:", error);
      } else {
        keywordMatchesRaw = data ?? [];
      }
    }

    // 4) Normalise vector matches into a consistent shape
    type NormalisedMatch = {
      id: string | number;
      content: string;
      similarity: number | null;
      title?: string | null;
    };

    const vectorDocs: NormalisedMatch[] = (vectorMatches ?? []).map(
      (m: any) => ({
        id: m.id,
        content: m.content,
        similarity:
          typeof m.similarity === "number" ? m.similarity : null,
        title: m.title ?? (m.metadata?.title ?? null),
      })
    );

    const keywordDocs: NormalisedMatch[] = (keywordMatchesRaw ?? []).map(
  (m: any) => ({
    id: m.id,
    content: m.content,
    // For PPL queries, treat keyword hits as strong evidence
    similarity: needsKeywordBoost ? 0.99 : null,
    title: m.title ?? (m.metadata?.title ?? null),
  })
);



    // 5) Merge + dedupe by id, prefer vector version where both exist
    const mergedMap = new Map<string | number, NormalisedMatch>();

    for (const doc of keywordDocs) {
      mergedMap.set(doc.id, doc);
    }
    for (const doc of vectorDocs) {
      mergedMap.set(doc.id, doc); // overwrite keyword-only with vector+similarity
    }

    let merged = Array.from(mergedMap.values());

    // Sort by similarity desc where available, keyword-only (null) at the end
    merged.sort((a, b) => {
      const sa = a.similarity ?? -1;
      const sb = b.similarity ?? -1;
      return sb - sa;
    });

    const top = merged.slice(0, matchCount);

    // 6) Return matches in the shape /api/chat expects:
    // { content, similarity, title }
    const result = top.map((m) => ({
      id: m.id,
      content: m.content,
      similarity: m.similarity,
      title: m.title ?? undefined,
    }));

    return NextResponse.json({ matches: result });
  } catch (err) {
    console.error("[RAG] Unexpected error:", err);
    return NextResponse.json(
      { matches: [], error: "RAG query failed." },
      { status: 500 }
    );
  }
}
