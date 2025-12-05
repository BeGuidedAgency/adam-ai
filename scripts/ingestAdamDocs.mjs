import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ENV VARIABLES
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,             // make sure this exists in .env.local
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// FOLDER WHERE YOUR FILES LIVE
const docsPath = path.join(__dirname, "../data/adam");

// Improved chunking (same logic as the TS version, but inline JS)
function chunkText(text, maxChars = 1200, overlap = 200) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    // If paragraph alone is bigger than maxChars, split by sentences
    if (para.length > maxChars) {
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((current + " " + sentence).length > maxChars) {
          if (current) chunks.push(current.trim());
          current = sentence;
        } else {
          current += (current ? " " : "") + sentence;
        }
      }
    } else {
      if ((current + "\n\n" + para).length > maxChars) {
        if (current) chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? "\n\n" : "") + para;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // Add overlap between chunks
  if (overlap > 0 && chunks.length > 1) {
    const overlapped = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (i === 0) {
        overlapped.push(chunk);
      } else {
        const prev = overlapped[overlapped.length - 1];
        const overlapText = prev.slice(-overlap);
        overlapped.push(overlapText + "\n\n" + chunk);
      }
    }
    return overlapped;
  }

  return chunks;
}

async function main() {
  console.log("\n🔍 Reading files from:", docsPath);

  const files = fs.readdirSync(docsPath).filter(f => f.endsWith(".txt"));
  console.log("📄 Found files:", files);

  for (const file of files) {
    const fullPath = path.join(docsPath, file);
    console.log(`\n📘 Processing file: ${file}`);

    const content = fs.readFileSync(fullPath, "utf8");
    const chunks = chunkText(content);

    console.log(`✂️  Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      console.log("⚠️  No content, skipping");
      continue;
    }

    // 🔹 Batch embeddings for all chunks in this file
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",   // upgrade from 3-small
      input: chunks
    });

    const rows = chunks.map((chunk, i) => ({
      title: file,
      content: chunk,
      embedding: embeddingResponse.data[i].embedding
    }));

    const { error } = await supabase.from("adam_documents").insert(rows);

    if (error) {
      console.error("❌ Supabase insert error:", error);
      process.exit(1);
    }

    console.log(`✅ Inserted ${rows.length} chunks for ${file}`);
  }

  console.log("\n🎉 All documents ingested successfully!");
}

main();
