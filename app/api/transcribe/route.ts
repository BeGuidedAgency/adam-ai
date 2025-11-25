import { NextRequest } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response("Missing audio file", { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1", // or "gpt-4o-transcribe" if enabled on your account
      file,
    });

    return Response.json({ text: transcription.text });
  } catch (err) {
    console.error("Transcription error:", err);
    return new Response("Transcription failed", { status: 500 });
  }
}
