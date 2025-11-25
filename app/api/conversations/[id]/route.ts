// app/api/conversations/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase env vars: SUPABASE_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// PATCH → rename conversation
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;

  try {
    const body = await req.json().catch(() => ({}));
    const title: string | undefined = body.title;
    const userId: string | undefined = body.userId;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Missing or empty title" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("conversations")
      .update({ title: title.trim() })
      .eq("id", id);

    // Safety: only allow user to edit their own convo
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query
      .select("id, title, created_at")
      .single();

    if (error || !data) {
      console.error("Error updating conversation title:", error);
      return NextResponse.json(
        { error: "Failed to update conversation title" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("Error in PATCH /api/conversations/[id]:", err);
    return NextResponse.json(
      { error: "Server error updating conversation" },
      { status: 500 }
    );
  }
}

// DELETE → delete conversation + messages
export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // Delete messages first
    const { error: msgError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", id);

    if (msgError) {
      console.error("Error deleting messages:", msgError);
      return NextResponse.json(
        { error: "Failed to delete conversation messages" },
        { status: 500 }
      );
    }

    // Delete conversation, optionally scoped to user
    let query = supabase.from("conversations").delete().eq("id", id);
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { error: convError } = await query;

    if (convError) {
      console.error("Error deleting conversation:", convError);
      return NextResponse.json(
        { error: "Failed to delete conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Error in DELETE /api/conversations/[id]:", err);
    return NextResponse.json(
      { error: "Server error deleting conversation" },
      { status: 500 }
    );
  }
}
