// app/api/conversations/route.ts
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

// GET /api/conversations?userId=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    let query = supabase
      .from("conversations")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[CONVERSATIONS] GET error:", error);
      return NextResponse.json(
        { error: "Failed to load conversations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversations: data ?? [] });
  } catch (err) {
    console.error("[CONVERSATIONS] GET unexpected error:", err);
    return NextResponse.json(
      { error: "Server error fetching conversations" },
      { status: 500 }
    );
  }
}

// POST /api/conversations
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body.userId;
    const title: string | null =
      typeof body.title === "string" ? body.title : null;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId in request body" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        title,
      })
      .select("id, title, created_at")
      .single();

    if (error || !data) {
      console.error("[CONVERSATIONS] POST insert error:", error);
      return NextResponse.json(
        { error: "Failed to create conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[CONVERSATIONS] POST unexpected error:", err);
    return NextResponse.json(
      { error: "Server error creating conversation" },
      { status: 500 }
    );
  }
}
