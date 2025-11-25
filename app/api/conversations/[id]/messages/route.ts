// app/api/conversations/[id]/messages/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase env vars: SUPABASE_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at, conversation_id")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages for conversation", id, ":", error);
      return NextResponse.json(
        { error: "Failed to load messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages: data ?? [] });
  } catch (err) {
    console.error("Error in GET /api/conversations/[id]/messages:", err);
    return NextResponse.json(
      { error: "Server error fetching messages" },
      { status: 500 }
    );
  }
}
