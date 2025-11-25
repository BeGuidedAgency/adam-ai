// scripts/ingest-adam.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Load env vars from .env.local
dotenv.config({ path: ".env.local" });

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Folder with your Adam text files
const DATA_DIR = path.join(__dirname, "..", "data", "adam");

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase client
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getAllTextFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTextFiles(fullPath));
    } else if (entry.isFile() && /\.(txt|md|markdown)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

// simple paragraph-based chunking
function chunkText(text, maxChars = 2000) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxChars) {
      if (current) chunks.push(current.trim());
      if (p.length > maxChars) {
        // hard split very long paragraphs
        for (let i = 0; i < p.length; i += maxChars) {
          chunks.push(p.slice(i, i + maxChars).trim());
        }
        current = "";
      } else {
        current = p;
      }
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

async function embedAndInsert(title, content) {
  // 1) Create embedding
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: content,
  });

  const embedding = embeddingResponse.data[0].embedding;

  // 2) Insert into adam_documents
  const { error } = await supabase.from("adam_documents").insert({
    title,
    content,
    embedding,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  console.log("Ingesting from:", DATA_DIR);

  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`DATA_DIR does not exist: ${DATA_DIR}`);
  }

  const files = getAllTextFiles(DATA_DIR);

  if (!files.length) {
    console.log("No .txt/.md files found in data/adam");
    return;
  }

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");

    const cleaned = raw
      .replace(/\r/g, "")
      .trim();

    if (!cleaned) {
      console.log(`Skipping empty file: ${file}`);
      continue;
    }

    const title = path.basename(file);
    const chunks = chunkText(cleaned);

    console.log(`\nFile: ${title} → ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`  Embedding chunk ${i + 1}/${chunks.length}`);
      await embedAndInsert(title, chunk);
    }
  }

  console.log("\n✅ Ingestion complete");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
