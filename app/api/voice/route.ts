import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response("Missing text", { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID");
      return new Response("Voice config missing", { status: 500 });
    }

    const elevenRes = await fetch(
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
            stability: 0.5,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!elevenRes.ok || !elevenRes.body) {
      console.error(
        "ElevenLabs error:",
        elevenRes.status,
        await elevenRes.text().catch(() => "")
      );
      return new Response("Failed to generate audio", { status: 500 });
    }

    return new Response(elevenRes.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Error in /api/voice:", err);
    return new Response("Server error", { status: 500 });
  }
}
