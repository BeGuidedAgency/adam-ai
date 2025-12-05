// scripts/ingestAdamDocs.ts
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("Starting Adam AI ingestion from /data/adam…");

  const docsDir = path.join(process.cwd(), "data", "adam");
  const files = await fs.readdir(docsDir);

  for (const file of files) {
    if (!file.endsWith(".txt")) continue;

    const filePath = path.join(docsDir, file);
    const raw = await fs.readFile(filePath, "utf8");
    const content = raw.trim();
    if (!content) {
      console.log(`Skipping empty file: ${file}`);
      continue;
    }

    console.log(`Embedding file: ${file} (length ${content.length})`);

    const embeddingRes = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: content,
});

    const [embedding] = embeddingRes.data;
    const vector = embedding.embedding;

    const { error } = await supabase.from("adam_documents").insert({
      content,
      metadata: {
        source: file.replace(".txt", ""),
        path: `data/adam/${file}`,
      },
      embedding: vector,
    });

    if (error) {
      console.error(`❌ Failed to insert ${file}:`, error.message);
    } else {
      console.log(`✅ Inserted ${file}`);
    }
  }

  console.log("Ingestion complete ✅");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
