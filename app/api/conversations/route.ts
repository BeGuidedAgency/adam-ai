// app/api/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// GET /api/conversations
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

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
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const title: string | null =
      typeof body.title === "string" ? body.title : null;

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
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