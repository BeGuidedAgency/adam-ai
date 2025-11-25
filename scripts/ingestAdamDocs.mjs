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
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// FOLDER WHERE YOUR FILES LIVE
const docsPath = path.join(__dirname, "../data/adam");

// Chunking function
function chunkText(text, maxLength = 800) {
  const paragraphs = text.split("\n");
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > maxLength) {
      chunks.push(current.trim());
      current = "";
    }
    current += para + "\n";
  }

  if (current.trim()) chunks.push(current.trim());

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

    // For each chunk, generate embedding + insert into Supabase
    for (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small", // 1536 dimensions
  input: chunk
});


      const { error } = await supabase.from("adam_documents").insert({
        title: file,
        content: chunk,
        embedding: embedding.data[0].embedding
      });

      if (error) {
        console.error("❌ Supabase insert error:", error);
        process.exit(1);
      }
    }

    console.log(`✅ Done: ${file}`);
  }

  console.log("\n🎉 All documents ingested successfully!");
}

main();
