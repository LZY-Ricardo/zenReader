import * as path from "path";
import * as vscode from "vscode";

import type { BookMeta, LibraryFile, ReaderSettings, ReadingProgress, SessionFile } from "../types";
import { buildChaptersFromText } from "./parser";
import { uuidV4 } from "../util/uuid";
import {
  ensureDir,
  readJson,
  readText,
  storagePaths,
  writeJson,
  writeText
} from "./storage";

const DEFAULT_SETTINGS: ReaderSettings = {
  mode: "paged",
  fontSize: 16
};

export async function loadInitState(
  context: vscode.ExtensionContext
): Promise<{ library: LibraryFile; session: SessionFile }> {
  const library = await loadLibrary(context);
  const session = await loadSession(context);
  return { library, session };
}

export async function importTxtIntoLibrary(
  context: vscode.ExtensionContext,
  sourceFile: vscode.Uri
): Promise<BookMeta> {
  const library = await loadLibrary(context);
  if (library.books.length >= 5) {
    throw new Error("书库已满（最多 5 本），请先移除一本再导入。");
  }

  const raw = await readText(sourceFile);
  const text = normalizeNewlines(raw);
  if (!text.trim()) {
    throw new Error("文件为空。");
  }

  const title = path.basename(sourceFile.fsPath, path.extname(sourceFile.fsPath)).trim() || "未命名";
  const id = uuidV4();
  const now = Date.now();

  const book: BookMeta = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    format: "txt"
  };

  const paths = storagePaths(context, id);
  await ensureDir(paths.bookDir);
  await writeText(paths.contentUri, text);

  const chapters = buildChaptersFromText(text);
  await writeJson(paths.indexUri, { version: 1, chapters });
  await writeJson(paths.bookmarksUri, { version: 1, bookmarks: [] });

  library.books.push(book);
  await saveLibrary(context, library);

  const session = await loadSession(context);
  session.lastBookId = book.id;
  await saveSession(context, session);

  return book;
}

export async function setLastOpenedBook(context: vscode.ExtensionContext, bookId: string): Promise<void> {
  const session = await loadSession(context);
  session.lastBookId = bookId;
  await saveSession(context, session);
}

export async function updateSettings(
  context: vscode.ExtensionContext,
  patch: Partial<ReaderSettings>
): Promise<ReaderSettings> {
  const library = await loadLibrary(context);
  library.settings = { ...library.settings, ...patch };
  await saveLibrary(context, library);
  return library.settings;
}

export async function updateProgress(
  context: vscode.ExtensionContext,
  progress: Omit<ReadingProgress, "updatedAt"> & { updatedAt?: number }
): Promise<ReadingProgress> {
  const session = await loadSession(context);
  const now = progress.updatedAt ?? Date.now();
  const normalized: ReadingProgress = { ...progress, updatedAt: now };
  session.lastBookId = normalized.bookId;
  session.progressByBook[normalized.bookId] = normalized;
  await saveSession(context, session);
  return normalized;
}

export async function removeBook(context: vscode.ExtensionContext, bookId: string): Promise<void> {
  const library = await loadLibrary(context);
  const nextBooks = library.books.filter((b) => b.id !== bookId);
  if (nextBooks.length === library.books.length) {
    return;
  }

  library.books = nextBooks;
  await saveLibrary(context, library);

  const session = await loadSession(context);
  delete session.progressByBook[bookId];
  if (session.lastBookId === bookId) {
    session.lastBookId = nextBooks[0]?.id;
  }
  await saveSession(context, session);

  const paths = storagePaths(context, bookId);
  try {
    await vscode.workspace.fs.delete(paths.bookDir, { recursive: true, useTrash: true });
  } catch {
    // ignore
  }
}

async function loadLibrary(context: vscode.ExtensionContext): Promise<LibraryFile> {
  const root = storagePaths(context).root;
  await ensureDir(root);

  const uri = storagePaths(context).libraryUri;
  const library = await readJson<LibraryFile>(uri, {
    version: 1,
    settings: DEFAULT_SETTINGS,
    books: []
  });

  return {
    version: 1,
    settings: library.settings ?? DEFAULT_SETTINGS,
    books: Array.isArray(library.books) ? library.books : []
  };
}

async function saveLibrary(context: vscode.ExtensionContext, library: LibraryFile): Promise<void> {
  const uri = storagePaths(context).libraryUri;
  await writeJson(uri, library);
}

async function loadSession(context: vscode.ExtensionContext): Promise<SessionFile> {
  const uri = storagePaths(context).sessionUri;
  return await readJson<SessionFile>(uri, {
    version: 1,
    lastBookId: undefined,
    progressByBook: {}
  });
}

async function saveSession(context: vscode.ExtensionContext, session: SessionFile): Promise<void> {
  await writeJson(storagePaths(context).sessionUri, session);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
