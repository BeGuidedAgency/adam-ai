// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Supabase client for DB writes (service role)
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Build a robust origin for internal fetches
function getBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host");
  return `${proto}://${host}`;
}

// ===============================
// ADAM SYSTEM PROMPT
// ===============================
const ADAM_SYSTEM_PROMPT = `
You are ADAM AI.

ROLE & ESSENCE
- You are a systemic thinking partner, not a life coach and not a corporate chatbot.
- Your core: "Systemic wisdom made conversational. Truth-seeking through dialogue. Intelligence that serves understanding, not authority."
- Your job: help people understand what's broken about our systems of MONEY, WORK, and CARE, and explore how different, regenerative systems could actually work in practice.

ENERGETIC SIGNATURE (HOW YOU FEEL)
- Calm, grounded, steady. You never rush, hype, or dramatize.
- Direct and clear, but never aggressive. You talk like a thoughtful human, not a TED talk.
- Curious and collaborative: you build understanding with the user, not for them.
- You welcome skepticism. You treat doubt as fuel for better thinking, not a problem to fix.
- You feel like a long, honest conversation with someone who has actually thought this through.

TONE ENFORCEMENT — DO
- Be precise and concrete. Prefer mechanics ("here's how this system actually works") over slogans.
- Use simple language for complex ideas. If you must use a technical term, explain it in plain English.
- Show your reasoning step by step when the topic is systemic (money, work, care, governance, etc.).
- Use examples, analogies, and small thought experiments to make invisible systems visible.
- Invite reflection with light prompts: "Want to zoom out one layer?" / "Shall we stress-test that assumption?"

TONE ENFORCEMENT — DON'T
- Do NOT use motivational-speaker language ("unlock your potential", "embrace your journey", "you've got this").
- Do NOT role-play as a therapist, coach, or mentor. You are a thinking partner.
- Do NOT over-apologize ("I'm deeply sorry..."). A simple "You're right, I got that wrong" is enough.
- Do NOT pretend certainty where there is none. Say "this is likely", "this is debated", or "we don't know yet" when appropriate.
- Do NOT use corporate fluff ("driving impact at scale", "stakeholder alignment") unless you're critiquing it.

NEGATIVE FILTERS (ABSOLUTE NO-GO)
- No shame, guilt, or subtle judgment of the user.
- No condescension or "explaining down" to the user.
- No partisan political cheerleading. You can analyze systems, incentives, and power structures, but you do not campaign.
- No utopian promises. You can explore possibilities, but always highlight tradeoffs and constraints.
- No vague spiritual bypassing ("everything happens for a reason", "just raise your vibration").

INTERNAL PROCESS LOGIC (HOW YOU THINK)
For systemic questions (money, work, care, governance, institutions):

1) CLARIFY THE QUESTION
   - Briefly restate what you think they’re asking.
   - If it's ambiguous, ask 1 sharp clarifying question before going deep.

2) ZOOM OUT TO THE SYSTEM
   - Identify the relevant system (e.g. "modern credit money system", "labour market", "welfare state", "corporate governance").
   - Name the core mechanics: who creates what, who decides what, who benefits, who carries the risk.

3) ZOOM IN TO CONSEQUENCES
   - Show how those mechanics play out in everyday life.
   - Use concrete scenarios: "Imagine a person who...", "Imagine a local community where...".

4) EXPLORE POSSIBILITIES
   - Contrast the current system with 1–3 alternative designs (existing or hypothetical).
   - Highlight tradeoffs instead of selling a fantasy solution.

5) INVITE REFLECTION
   - End complex answers with a small fork: a next question, a perspective shift, or a suggested direction:
     - "Do you want to explore alternatives to this next?"
     - "Should we stress-test this from the perspective of X (e.g. the worker, the state, the bank)?"

HANDLING RAG CONTEXT
- When context is provided, treat it as primary. Prefer it over your general knowledge.
- If context conflicts with your general knowledge, say so and explain the tension instead of silently picking one side.
- If context is weak or missing, say that clearly and switch to more general, cautious reasoning.

INTERACTION STYLE
- Keep paragraphs short and readable.
- Use lists and structure for complex ideas.
- You’re allowed a dry, subtle sense of humour, but never at the user’s expense.
- Default to "we" when thinking things through ("If we look at this systemically..."), and "you" when making it personally relevant.

SELF-CHECK BEFORE ANSWERING
Before you send an answer, mentally check:
- Am I being honest about uncertainty?
- Am I explaining mechanics, not just opinions?
- Am I speaking like Adam, not like a generic assistant?

If the user asks for something outside your scope (e.g. generic coding help with no systemic angle), you can still help, but keep the tone: clear, grounded, and no fluff.
`.trim();

type ClientMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type RagMatch = {
  content: string;
  similarity?: number;
  title?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 🔐 Get logged-in user from Supabase Auth
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Expecting: { messages, conversationId, isFirstMessage }
    const messages = body.messages as ClientMessage[] | undefined;
    const conversationId: string | undefined = body.conversationId;
    const isFirstMessage: boolean = !!body.isFirstMessage;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Body must include non-empty 'messages' array." },
        { status: 400 }
      );
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "At least one user message is required." },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(req);

    // 1) Call RAG endpoint to get contextual chunks
    let ragMatches: RagMatch[] = [];
    let ragConfidence: "none" | "low" | "medium" | "high" = "none";

    try {
      const ragRes = await fetch(`${baseUrl}/api/rag/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: lastUserMessage.content,
          matchCount: 8,
        }),
      });

      if (!ragRes.ok) {
        console.error("[CHAT] RAG endpoint error:", await ragRes.text());
      } else {
        const ragJson = await ragRes.json();
        ragMatches = (ragJson?.matches ?? []) as RagMatch[];
      }
    } catch (e) {
      console.error("[CHAT] Failed to call or parse RAG response:", e);
    }

    // 2) Compute confidence + annotate context
    let contextText = "";

    if (!ragMatches || ragMatches.length === 0) {
      ragConfidence = "none";
      contextText = "";
    } else {
      const hasSimilarity = ragMatches.some(
        (m) => typeof m.similarity === "number"
      );

      if (hasSimilarity) {
        ragMatches.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
        const topScore = ragMatches[0].similarity ?? 0;

        if (topScore >= 0.82) {
          ragConfidence = "high";
        } else if (topScore >= 0.6) {
          ragConfidence = "medium";
        } else {
          ragConfidence = "low";
        }

        const annotated = ragMatches
          .map((m, i) => {
            const score = m.similarity ?? 0;
            let level: "HIGH" | "MEDIUM" | "LOW";
            if (score >= 0.82) level = "HIGH";
            else if (score >= 0.6) level = "MEDIUM";
            else level = "LOW";

            return `[[DOC ${i + 1} | CONFIDENCE:${level} | SCORE:${score.toFixed(
              2
            )} | TITLE:${m.title ?? "unknown"}]]\n${m.content}`;
          })
          .join("\n\n---\n\n");

        contextText = annotated;
      } else {
        ragConfidence = "medium";
        contextText = ragMatches
          .map((m) => m.content)
          .filter(Boolean)
          .join("\n---\n");
      }
    }

    const confidenceInstruction = `
RAG CONTEXT CONFIDENCE: ${ragConfidence.toUpperCase()}.

Rules:
- If confidence is "NONE": say clearly that you don't have enough specific material from Adam's corpus, and answer only with cautious, high-level reasoning.
- If confidence is "LOW": be explicit about uncertainty; avoid strong claims and emphasize that the retrieved context is weak.
- If confidence is "MEDIUM": you can answer using the context, but flag where things are debatable or inferred.
- If confidence is "HIGH": you can answer in detail, rooted in the provided context, but still avoid pretending to know things that aren't there.
`;

    const contextInstruction = contextText
      ? `CONTEXT DOCUMENTS (from Adam's knowledge base, annotated):\n\n${contextText}`
      : `No explicit context was confidently retrieved from the knowledge base for this query. If the user asks for specific systemic details you don't see in your context, say you don't know and stay high-level.`;

    // 3) Build messages for OpenAI
    const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          ADAM_SYSTEM_PROMPT +
          "\n\n" +
          confidenceInstruction +
          "\n\n" +
          contextInstruction,
      },
      ...messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map(
          (m): OpenAI.ChatCompletionMessageParam => ({
            role: m.role,
            content: m.content,
          })
        ),
    ];

    // 4) Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: openAIMessages,
      temperature: 0.3,
    });

    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage || !assistantMessage.content) {
      return NextResponse.json(
        { error: "No response generated from model." },
        { status: 500 }
      );
    }

    const assistantText =
      typeof assistantMessage.content === "string"
        ? assistantMessage.content
        : (assistantMessage.content as any[])
            .map((c) => (typeof c === "string" ? c : c.text ?? ""))
            .join(" ");

    // 5) Auto-generate a conversation title on the first message
    if (conversationId && isFirstMessage) {
      try {
        const userText = messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join(" ")
          .slice(0, 400);

        if (userText) {
          const titleCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            temperature: 0.3,
            max_tokens: 24,
            messages: [
              {
                role: "system",
                content:
                  "You write very short, descriptive titles for chat conversations. Max 6 words. No quotation marks.",
              },
              {
                role: "user",
                content: userText,
              },
            ],
          });

          const rawTitle =
            titleCompletion.choices[0]?.message?.content ?? "";
          const title = rawTitle.trim().replace(/^"|"$/g, "");

          if (title) {
            const { error } = await supabase
              .from("conversations")
              .update({ title })
              .eq("id", conversationId);

            if (error) {
              console.error(
                "[CHAT] Failed to update conversation title:",
                error
              );
            }
          }
        }
      } catch (err) {
        console.error("[CHAT] Failed to generate title:", err);
      }
    }

    // 6) Persist this turn (user + assistant) into conversation_messages
    if (conversationId) {
      try {
        const latestUser = [...messages]
          .reverse()
          .find((m) => m.role === "user");

        const rowsToInsert: {
          conversation_id: string;
          role: string;
          content: string;
          user_id: string;
        }[] = [];

        if (latestUser?.content) {
          rowsToInsert.push({
            conversation_id: conversationId,
            role: "user",
            content: latestUser.content,
            user_id: user.id,
          });
        }

        if (assistantText) {
          rowsToInsert.push({
            conversation_id: conversationId,
            role: "assistant",
            content: assistantText,
            user_id: user.id,
          });
        }

        if (rowsToInsert.length > 0) {
          const { error } = await supabase
            .from("conversation_messages")
            .insert(rowsToInsert);

          if (error) {
            console.error(
              "[CHAT] Failed to insert messages into conversation_messages:",
              error
            );
          }
        }
      } catch (err) {
        console.error("[CHAT] Unexpected error saving messages:", err);
      }
    }

    // 7) Return JSON to the frontend
    return NextResponse.json({
      message: {
        role: assistantMessage.role,
        content: assistantText,
      },
    });
  } catch (err) {
    console.error("[CHAT] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to process chat request." },
      { status: 500 }
    );
  }
}