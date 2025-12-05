// lib/chunkText.ts
export function chunkText(
  text: string,
  maxChars = 1200,
  overlap = 200
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
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

  // Add overlap
  if (overlap > 0 && chunks.length > 1) {
    const overlapped: string[] = [];
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
