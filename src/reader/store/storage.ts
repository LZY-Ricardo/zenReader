import * as vscode from "vscode";

export function storagePaths(context: vscode.ExtensionContext): {
  root: vscode.Uri;
  booksDir: vscode.Uri;
  libraryUri: vscode.Uri;
  sessionUri: vscode.Uri;
};
export function storagePaths(context: vscode.ExtensionContext, bookId: string): {
  root: vscode.Uri;
  booksDir: vscode.Uri;
  libraryUri: vscode.Uri;
  sessionUri: vscode.Uri;
  bookDir: vscode.Uri;
  contentUri: vscode.Uri;
  indexUri: vscode.Uri;
  bookmarksUri: vscode.Uri;
};
export function storagePaths(context: vscode.ExtensionContext, bookId?: string) {
  const root = context.globalStorageUri;
  if (!root) {
    throw new Error("globalStorageUri 不可用。");
  }

  const booksDir = vscode.Uri.joinPath(root, "books");
  const libraryUri = vscode.Uri.joinPath(root, "library.json");
  const sessionUri = vscode.Uri.joinPath(root, "session.json");

  if (!bookId) {
    return { root, booksDir, libraryUri, sessionUri };
  }

  const bookDir = vscode.Uri.joinPath(booksDir, bookId);
  return {
    root,
    booksDir,
    libraryUri,
    sessionUri,
    bookDir,
    contentUri: vscode.Uri.joinPath(bookDir, "content.txt"),
    indexUri: vscode.Uri.joinPath(bookDir, "index.json"),
    bookmarksUri: vscode.Uri.joinPath(bookDir, "bookmarks.json")
  };
}

export async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.createDirectory(uri);
  }
}

export async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder("utf-8").decode(bytes);
}

export async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  await vscode.workspace.fs.writeFile(uri, bytes);
}

export async function readJson<T>(uri: vscode.Uri, fallback: T): Promise<T> {
  try {
    const text = await readText(uri);
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof vscode.FileSystemError && err.code === "FileNotFound") {
      return fallback;
    }
    return fallback;
  }
}

export async function writeJson(uri: vscode.Uri, data: unknown): Promise<void> {
  await writeText(uri, JSON.stringify(data, null, 2));
}
