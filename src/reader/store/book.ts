import * as vscode from "vscode";

import type { Bookmark, Chapter } from "../types";
import { readJson, readText, storagePaths, writeJson } from "./storage";

const contentCache = new Map<string, string>();
const chaptersCache = new Map<string, Chapter[]>();

export async function loadChapters(
  context: vscode.ExtensionContext,
  bookId: string
): Promise<Chapter[]> {
  const cached = chaptersCache.get(bookId);
  if (cached) {
    return cached;
  }

  const uri = storagePaths(context, bookId).indexUri;
  const data = await readJson<{ version: number; chapters?: Chapter[] }>(uri, { version: 1 });
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  chaptersCache.set(bookId, chapters);
  return chapters;
}

export async function readChapterText(
  context: vscode.ExtensionContext,
  bookId: string,
  chapterId: string
): Promise<{ chapter: Chapter; text: string }> {
  const chapters = await loadChapters(context, bookId);
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    throw new Error("章节不存在。");
  }

  const contentUri = storagePaths(context, bookId).contentUri;
  let fullText = contentCache.get(bookId);
  if (!fullText) {
    fullText = await readText(contentUri);
    contentCache.set(bookId, fullText);
  }
  const text = fullText.slice(chapter.start, chapter.end);
  return { chapter, text };
}

export async function loadBookmarks(
  context: vscode.ExtensionContext,
  bookId: string
): Promise<Bookmark[]> {
  const uri = storagePaths(context, bookId).bookmarksUri;
  const data = await readJson<{ version: number; bookmarks?: Bookmark[] }>(uri, { version: 1 });
  return Array.isArray(data.bookmarks) ? data.bookmarks : [];
}

export async function saveBookmarks(
  context: vscode.ExtensionContext,
  bookId: string,
  bookmarks: Bookmark[]
): Promise<void> {
  const uri = storagePaths(context, bookId).bookmarksUri;
  await writeJson(uri, { version: 1, bookmarks });
}

