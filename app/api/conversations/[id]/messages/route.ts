// app/api/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getConversationId(req: NextRequest): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // [..., "api", "conversations", "{id}", "messages"]
  if (parts.length < 5) return null;
  const id = parts[parts.length - 2];
  return id || null;
}

// GET /api/conversations/:id/messages
export async function GET(req: NextRequest) {
  const conversationId = getConversationId(req);
  if (!conversationId) {
    return NextResponse.json(
      { error: "Missing conversation id" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("conversation_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[MESSAGES] GET error:", error);
      return NextResponse.json(
        { error: "Failed to load messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages: data ?? [] });
  } catch (err) {
    console.error("[MESSAGES] GET unexpected error:", err);
    return NextResponse.json(
      { error: "Server error loading messages" },
      { status: 500 }
    );
  }
}
