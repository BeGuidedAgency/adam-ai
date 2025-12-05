import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // needed so we can work with File / FormData on the server

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("TRANSCRIBE ERROR: Missing OPENAI_API_KEY");
      return NextResponse.json(
        { error: "Server misconfigured: missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // Forward the audio file directly to OpenAI Whisper
    const upstreamForm = new FormData();
    upstreamForm.append("file", file);
    upstreamForm.append("model", "whisper-1"); // stable transcription model
    // upstreamForm.append("language", "en"); // optional

    const oaiRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: upstreamForm,
      }
    );

    if (!oaiRes.ok) {
      const errorText = await oaiRes.text().catch(() => "");
      console.error(
        "OpenAI transcription error:",
        oaiRes.status,
        oaiRes.statusText,
        errorText
      );
      return NextResponse.json(
        { error: "OpenAI transcription failed", details: errorText },
        { status: 502 }
      );
    }

    const data = (await oaiRes.json()) as { text?: string };
    return NextResponse.json({ text: data.text ?? "" }, { status: 200 });
  } catch (err) {
    console.error("TRANSCRIBE ERROR (unexpected):", err);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
