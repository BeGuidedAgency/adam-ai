import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase env vars: SUPABASE_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

//─────────────────────────────────────────────
// ADAM SYSTEM PROMPT — ENGLISH ONLY
//─────────────────────────────────────────────
const ADAM_SYSTEM_PROMPT = `
You are Adam AI — a reflective, calm, systemic-thinking guide. 
You ALWAYS speak in English, even if the user speaks another language.

If a user writes in Japanese, Spanish, Arabic, or any other language:
- You understand it.
- You answer ONLY in English.

Tone rules:
- Calm, grounded, non-ideological.
- Explain systems (money, work, care, governance, power).
- Connect personal frustration to structural patterns.
- No hype, no therapy voice, no influencer tone, no guru energy.
- Admit uncertainty; be precise about what is known vs unknown.
- Invite deeper reflection rather than giving final “answers.”

Knowledge rules:
- When context from the Adam Knowledge Base is provided, rely on it heavily.
- If the answer isn't in the documents, say “I don’t know” — never invent.
- Use clear, plain English always.
`;

//─────────────────────────────────────────────
// MAIN POST — STREAMING CHAT COMPLETION
//─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const conversationId: string | null = body.conversationId ?? null;
    const msgs = body.messages;
    const isFirstMessage: boolean = !!body.isFirstMessage;

    if (!msgs || !Array.isArray(msgs) || msgs.length === 0) {
      return new Response("Missing messages array", { status: 400 });
    }

    const userMessage = msgs[msgs.length - 1]?.content?.trim();
    if (!userMessage) {
      return new Response("Missing user message text", { status: 400 });
    }

    //─────────────────────────────────────────────
    // 1. RAG LOOKUP (non-blocking if fails)
    //─────────────────────────────────────────────
    let contextText = "No relevant documents found.";

    try {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: userMessage,
      });

      const queryEmbedding = embedding.data[0].embedding;

      const { data: matches, error } = await supabase.rpc(
        "match_adam_documents",
        {
          query_embedding: queryEmbedding,
          match_count: 8,
        }
      );

      if (!error && Array.isArray(matches)) {
        contextText =
          matches
            .map(
              (m: any, i: number) =>
                `SOURCE ${i + 1} — ${m.title}\n${m.content}`
            )
            .join("\n\n---\n\n") || contextText;
      }

      if (error) console.error("RAG match error:", error);
    } catch (err) {
      console.error("Embedding/RAG error:", err);
    }

    //─────────────────────────────────────────────
    // 2. STREAMING RESPONSE FROM OPENAI
    //─────────────────────────────────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullAssistantText = "";

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            temperature: 0.35,
            stream: true,
            messages: [
              { role: "system", content: ADAM_SYSTEM_PROMPT },
              {
                role: "system",
                content:
                  "Here is context from Adam's knowledge base. Use it when relevant:\n\n" +
                  contextText,
              },
              ...msgs.map((m: any) => ({
                role: m.role,
                content: m.content,
              })),
            ],
          });

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (!delta) continue;

            fullAssistantText += delta;
            controller.enqueue(encoder.encode(delta));
          }

          // 3. After streaming: save to Supabase if we have a conversationId
          if (conversationId) {
            try {
              // ─────────────────────────────
              // Auto-title (only on first user message)
              // ─────────────────────────────
              let titleToUse = userMessage.slice(0, 80);

              if (isFirstMessage) {
                try {
                  const titleResp = await openai.chat.completions.create({
                    model: "gpt-4.1-mini",
                    temperature: 0.3,
                    max_tokens: 20,
                    messages: [
                      {
                        role: "system",
                        content:
                          "You generate short, descriptive conversation titles. Respond with ONLY the title text, no quotes.",
                      },
                      {
                        role: "user",
                        content:
                          `User's opening message:\n\n"${userMessage}"\n\n` +
                          "Create a 3–7 word title that summarises what this conversation is about.",
                      },
                    ],
                  });

                  const rawTitle =
                    titleResp.choices[0]?.message?.content?.trim();
                  if (rawTitle) {
                    titleToUse = rawTitle.replace(/^["']|["']$/g, "");
                  }
                } catch (titleErr) {
                  console.error("Auto-title error:", titleErr);
                  // fall back to snippet
                }
              }

              // Update conversation title
              await supabase
                .from("conversations")
                .update({
                  title: titleToUse,
                })
                .eq("id", conversationId);

              // Insert user + assistant messages
              await supabase.from("messages").insert([
                {
                  conversation_id: conversationId,
                  role: "user",
                  content: userMessage,
                },
                {
                  conversation_id: conversationId,
                  role: "assistant",
                  content: fullAssistantText,
                },
              ]);
            } catch (err) {
              console.error("Error inserting messages / title into Supabase:", err);
            }
          } else {
            console.warn(
              "No conversationId provided to /api/chat; messages not stored."
            );
          }

          controller.close();
        } catch (err) {
          console.error("OpenAI streaming error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    return new Response("Server error", { status: 500 });
  }
}
