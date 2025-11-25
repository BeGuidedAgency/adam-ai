import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET /api/sessions → return all sessions
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ sessions: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// POST /api/sessions → create a new session
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, title } = body;

    const { data, error } = await supabase
      .from("sessions")
      .insert([
        {
          thread_id: threadId,
          title: title || "New Session",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
