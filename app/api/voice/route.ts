import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_ADAM_VOICE_ID;

    if (!apiKey || !voiceId) {
      console.error("VOICE ERROR: Missing API key or voice ID");
      return NextResponse.json(
        { error: "Missing ELEVENLABS_API_KEY or ELEVENLABS_ADAM_VOICE_ID" },
        { status: 500 }
      );
    }

    // Build request to ElevenLabs
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("ElevenLabs TTS error:", res.status, res.statusText, errorBody);

      return NextResponse.json(
        {
          error: "ElevenLabs TTS failed",
          status: res.status,
          details: errorBody,
        },
        { status: 500 }
      );
    }

    const audio = await res.arrayBuffer();

    return new NextResponse(audio, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    console.error("VOICE API FATAL ERROR:", err);
    return NextResponse.json(
      { error: "Failed to generate voice" },
      { status: 500 }
    );
  }
}
