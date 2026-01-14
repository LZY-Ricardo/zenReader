import type { Chapter } from "../types";

const DEFAULT_MIN_CHARS_BETWEEN_TITLES = 300;
const DEFAULT_MAX_TITLE_LEN = 40;
const DEFAULT_CHUNK_SIZE_CHARS = 12000;

const CHAPTER_TITLE_PATTERNS: RegExp[] = [
  /^第\s*[0-9０-９零一二三四五六七八九十百千万两]+?\s*[章回节卷部篇]\s*.*$/u,
  /^(序章|楔子|引子|前言|后记|番外|尾声|终章)\s*.*$/u,
  /^卷\s*[0-9０-９零一二三四五六七八九十百千万两]+\s*.*$/u
];

export function buildChaptersFromText(text: string): Chapter[] {
  const lines = text.split("\n");
  let offset = 0;
  const titles: Array<{ title: string; start: number }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (isCandidateTitle(trimmed)) {
      const last = titles.length > 0 ? titles[titles.length - 1] : undefined;
      if (!last || offset - last.start >= DEFAULT_MIN_CHARS_BETWEEN_TITLES) {
        titles.push({ title: trimmed, start: offset });
      }
    }
    offset += line.length + 1;
  }

  if (titles.length < 3) {
    return buildChunkChapters(text.length);
  }

  const chapters: Chapter[] = [];
  const starts = titles.map((t) => t.start);
  const firstStart = starts[0] ?? 0;
  const withPrelude = firstStart > 0;

  if (withPrelude) {
    chapters.push({
      id: "c0",
      title: "开始",
      order: 0,
      start: 0,
      end: firstStart
    });
  }

  for (let i = 0; i < titles.length; i++) {
    const order = chapters.length;
    const current = titles[i]!;
    const next = titles[i + 1];
    const start = current.start;
    const end = next ? next.start : text.length;
    chapters.push({
      id: `c${order}`,
      title: current.title,
      order,
      start,
      end
    });
  }

  return chapters;
}

function isCandidateTitle(line: string): boolean {
  if (!line) return false;
  if (line.length > DEFAULT_MAX_TITLE_LEN) return false;
  if (/[。！？!?]$/u.test(line)) return false;
  return CHAPTER_TITLE_PATTERNS.some((re) => re.test(line));
}

function buildChunkChapters(totalChars: number): Chapter[] {
  const chapters: Chapter[] = [];
  let start = 0;
  let order = 0;
  while (start < totalChars) {
    const end = Math.min(totalChars, start + DEFAULT_CHUNK_SIZE_CHARS);
    chapters.push({
      id: `c${order}`,
      title: `第 ${order + 1} 节`,
      order,
      start,
      end
    });
    order++;
    start = end;
  }
  return chapters;
}
