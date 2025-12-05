// app/api/conversations/[id]/route.ts
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

// Helper to extract :id from /api/conversations/[id]
function getId(req: NextRequest): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // [..., "api", "conversations", "{id}"]
  const maybeId = parts[parts.length - 1];
  return maybeId || null;
}

// GET /api/conversations/:id  (optional, but handy)
export async function GET(req: NextRequest) {
  const id = getId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, user_id")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[CONVERSATIONS] GET /:id error:", error);
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

// PATCH /api/conversations/:id  (rename)
export async function PATCH(req: NextRequest) {
  const id = getId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const title: string | undefined = body.title;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("conversations")
      .update({ title: title.trim() })
      .eq("id", id)
      .select("id, title")
      .single();

    if (error || !data) {
      console.error("[CONVERSATIONS] PATCH /:id error:", error);
      return NextResponse.json(
        { error: "Failed to update conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[CONVERSATIONS] PATCH /:id unexpected error:", err);
    return NextResponse.json(
      { error: "Server error updating conversation" },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/:id
export async function DELETE(req: NextRequest) {
  const id = getId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  try {
    // If your DB doesn't have ON DELETE CASCADE, you may also want to manually
    // delete from conversation_messages here.
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[CONVERSATIONS] DELETE /:id error:", error);
      return NextResponse.json(
        { error: "Failed to delete conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CONVERSATIONS] DELETE /:id unexpected error:", err);
    return NextResponse.json(
      { error: "Server error deleting conversation" },
      { status: 500 }
    );
  }
}
