import * as vscode from "vscode";

import {
  importTxtIntoLibrary,
  loadInitState,
  removeBook,
  setLastOpenedBook,
  updateProgress,
  updateSettings
} from "./store/library";
import { loadBookmarks, loadChapters, readChapterText, saveBookmarks } from "./store/book";
import type { Bookmark, ProgressAnchor, ReaderMode } from "./types";
import { uuidV4 } from "./util/uuid";
import { textToHtml } from "./web/textToHtml";

export class ReaderViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "zenReader.reader";

  private view?: vscode.WebviewView;
  private editorPanel?: vscode.WebviewPanel;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.log.appendLine("[view] resolveWebviewView");
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });

    void this.postInitState();
  }

  public async importTxtFromCommand(): Promise<void> {
    await this.importTxt();
  }

  public async openInEditorFromCommand(): Promise<void> {
    if (this.editorPanel) {
      this.editorPanel.reveal(this.editorPanel.viewColumn);
      return;
    }

    this.log.appendLine("[panel] openInEditor");
    const panel = vscode.window.createWebviewPanel(
      "zenReader.readerPanel",
      "Zen Reader",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );
    this.editorPanel = panel;

    panel.webview.html = this.getHtml(panel.webview);
    panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
    panel.onDidDispose(() => {
      this.editorPanel = undefined;
    });

    await this.postInitState();
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== "object") {
      return;
    }

    const type = (message as { type?: unknown }).type;
    if (typeof type !== "string") {
      return;
    }

    try {
      switch (type) {
        case "reader/ready":
          await this.postInitState();
          return;
        case "library/importTxt":
          await this.importTxt();
          return;
        case "library/openBook": {
          const bookId = (message as { bookId?: unknown }).bookId;
          if (typeof bookId !== "string" || !bookId) {
            return;
          }
          await this.openBook(bookId);
          return;
        }
        case "library/removeBook": {
          const payload = (message as { payload?: unknown }).payload;
          if (!payload || typeof payload !== "object") {
            return;
          }
          const bookId = (payload as { bookId?: unknown }).bookId;
          if (typeof bookId !== "string" || !bookId) {
            return;
          }
          await this.removeBook(bookId);
          return;
        }
        case "reader/requestChapter": {
          const bookId = (message as { bookId?: unknown }).bookId;
          const chapterId = (message as { chapterId?: unknown }).chapterId;
          if (typeof bookId !== "string" || !bookId) {
            return;
          }
          if (typeof chapterId !== "string" || !chapterId) {
            return;
          }
          await this.sendChapter(bookId, chapterId);
          return;
        }
        case "settings/update": {
          const payload = (message as { payload?: unknown }).payload;
          if (!payload || typeof payload !== "object") {
            return;
          }
          const mode = (payload as { mode?: unknown }).mode;
          const fontSize = (payload as { fontSize?: unknown }).fontSize;
          const patch: { mode?: ReaderMode; fontSize?: number } = {};
          if (mode === "paged" || mode === "scroll") {
            patch.mode = mode;
          }
          if (typeof fontSize === "number" && Number.isFinite(fontSize)) {
            patch.fontSize = clampInt(fontSize, 12, 28);
          }
          if (Object.keys(patch).length === 0) {
            return;
          }
          const settings = await updateSettings(this.context, patch);
          await this.postMessage({ type: "settings/changed", payload: { settings } });
          return;
        }
        case "reader/updateProgress": {
          const payload = (message as { payload?: unknown }).payload;
          if (!payload || typeof payload !== "object") {
            return;
          }
          const bookId = (payload as { bookId?: unknown }).bookId;
          const mode = (payload as { mode?: unknown }).mode;
          const chapterId = (payload as { chapterId?: unknown }).chapterId;
          const anchor = (payload as { anchor?: unknown }).anchor;
          if (typeof bookId !== "string" || !bookId) {
            return;
          }
          if (mode !== "paged" && mode !== "scroll") {
            return;
          }
          if (typeof chapterId !== "string" || !chapterId) {
            return;
          }
          const parsedAnchor = parseAnchor(mode, anchor);
          if (!parsedAnchor) {
            return;
          }
          await updateProgress(this.context, { bookId, mode, chapterId, anchor: parsedAnchor });
          return;
        }
        case "bookmark/add": {
          const payload = (message as { payload?: unknown }).payload;
          if (!payload || typeof payload !== "object") {
            return;
          }
          const bookId = (payload as { bookId?: unknown }).bookId;
          const chapterId = (payload as { chapterId?: unknown }).chapterId;
          const anchor = (payload as { anchor?: unknown }).anchor;
          if (typeof bookId !== "string" || !bookId) {
            return;
          }
          if (typeof chapterId !== "string" || !chapterId) {
            return;
          }
          const parsedAnchor = parseAnchorFromUnknown(anchor);
          if (!parsedAnchor) {
            return;
          }
          await this.addBookmark(bookId, chapterId, parsedAnchor);
          return;
        }
        case "bookmark/remove": {
          const payload = (message as { payload?: unknown }).payload;
          if (!payload || typeof payload !== "object") {
            return;
          }
          const bookId = (payload as { bookId?: unknown }).bookId;
          const bookmarkId = (payload as { bookmarkId?: unknown }).bookmarkId;
          if (typeof bookId !== "string" || !bookId) {
            return;
          }
          if (typeof bookmarkId !== "string" || !bookmarkId) {
            return;
          }
          await this.removeBookmark(bookId, bookmarkId);
          return;
        }
        case "reader/openInEditor":
          await this.openInEditorFromCommand();
          return;
        default:
          return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.appendLine(`[webview] error: ${err instanceof Error ? err.stack ?? msg : msg}`);
      await vscode.window.showErrorMessage(`Zen Reader：${msg}`);
    }
  }

  private async importTxt(): Promise<void> {
    const picks = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "导入 TXT",
      filters: {
        "Text Files": ["txt"]
      }
    });

    const fileUri = picks?.[0];
    if (!fileUri) {
      return;
    }

    try {
      await importTxtIntoLibrary(this.context, fileUri);
      await this.postInitState();
      await vscode.window.showInformationMessage("Zen Reader：已导入 TXT");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.appendLine(`[import] failed: ${err instanceof Error ? err.stack ?? message : message}`);
      await vscode.window.showErrorMessage(`Zen Reader：导入失败：${message}`);
    }
  }

  private async postInitState(): Promise<void> {
    const state = await loadInitState(this.context);
    await this.postMessage({ type: "init/state", payload: state });
  }

  private async openBook(bookId: string): Promise<void> {
    this.log.appendLine(`[view] openBook: ${bookId}`);
    await setLastOpenedBook(this.context, bookId);

    const chapters = await loadChapters(this.context, bookId);
    const bookmarks = await loadBookmarks(this.context, bookId);
    const state = await loadInitState(this.context);
    const progress = state.session.progressByBook[bookId];

    this.log.appendLine(`[view] chapters count: ${chapters.length}`);
    this.log.appendLine(`[view] sending openBookResult...`);

    await this.postMessage({
      type: "library/openBookResult",
      payload: { bookId, chapters, bookmarks, progress }
    });

    this.log.appendLine(`[view] openBookResult sent`);
  }

  private async sendChapter(bookId: string, chapterId: string): Promise<void> {
    const { chapter, text } = await readChapterText(this.context, bookId, chapterId);
    const html = textToHtml(text);

    await this.postMessage({
      type: "reader/chapterContent",
      payload: { bookId, chapterId: chapter.id, title: chapter.title, html }
    });
  }

  private async removeBook(bookId: string): Promise<void> {
    const init = await loadInitState(this.context);
    const book = init.library.books.find((b) => b.id === bookId);
    const name = book?.title ? `《${book.title}》` : "该书籍";

    const choice = await vscode.window.showWarningMessage(
      `确定移除 ${name} 吗？这将删除本机保存的书籍内容、目录索引与书签。`,
      { modal: true },
      "移除"
    );
    if (choice !== "移除") {
      return;
    }

    await removeBook(this.context, bookId);
    await this.postInitState();
    await vscode.window.showInformationMessage("Zen Reader：已移除书籍");
  }

  private async addBookmark(bookId: string, chapterId: string, anchor: ProgressAnchor): Promise<void> {
    const chapters = await loadChapters(this.context, bookId);
    const chapter = chapters.find((c) => c.id === chapterId);
    const label = buildBookmarkLabel(chapter?.title ?? "书签", anchor);

    const bookmarks = await loadBookmarks(this.context, bookId);
    const next: Bookmark = {
      id: uuidV4(),
      bookId,
      chapterId,
      anchor,
      label,
      createdAt: Date.now()
    };
    bookmarks.push(next);
    await saveBookmarks(this.context, bookId, bookmarks);
    await this.postMessage({ type: "bookmark/changed", payload: { bookId, bookmarks } });
  }

  private async removeBookmark(bookId: string, bookmarkId: string): Promise<void> {
    const bookmarks = await loadBookmarks(this.context, bookId);
    const next = bookmarks.filter((b) => b.id !== bookmarkId);
    await saveBookmarks(this.context, bookId, next);
    await this.postMessage({ type: "bookmark/changed", payload: { bookId, bookmarks: next } });
  }

  private async postMessage(message: unknown): Promise<void> {
    const targets: vscode.Webview[] = [];
    if (this.view) {
      targets.push(this.view.webview);
    }
    if (this.editorPanel) {
      targets.push(this.editorPanel.webview);
    }
    await Promise.all(targets.map((w) => w.postMessage(message)));
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "reader.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "reader.js")
    );

    const csp = [
      "default-src 'none';",
      `img-src ${webview.cspSource} data:;`,
      `style-src ${webview.cspSource};`,
      `script-src ${webview.cspSource} 'nonce-${nonce}';`
    ].join(" ");

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zen Reader</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.trunc(Math.max(min, Math.min(max, value)));
}

function parseAnchor(mode: ReaderMode, anchor: unknown): ProgressAnchor | undefined {
  if (!anchor || typeof anchor !== "object") {
    return;
  }
  const type = (anchor as { type?: unknown }).type;
  if (mode === "paged") {
    if (type !== "paged") return;
    const pageIndex = (anchor as { pageIndex?: unknown }).pageIndex;
    if (typeof pageIndex !== "number" || !Number.isFinite(pageIndex)) return;
    return { type: "paged", pageIndex: Math.max(0, Math.trunc(pageIndex)) };
  }
  if (type !== "scroll") return;
  const ratio = (anchor as { ratio?: unknown }).ratio;
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return;
  return { type: "scroll", ratio: Math.max(0, Math.min(1, ratio)) };
}

function parseAnchorFromUnknown(anchor: unknown): ProgressAnchor | undefined {
  if (!anchor || typeof anchor !== "object") {
    return;
  }
  const type = (anchor as { type?: unknown }).type;
  if (type === "paged") {
    const pageIndex = (anchor as { pageIndex?: unknown }).pageIndex;
    if (typeof pageIndex !== "number" || !Number.isFinite(pageIndex)) return;
    return { type: "paged", pageIndex: Math.max(0, Math.trunc(pageIndex)) };
  }
  if (type === "scroll") {
    const ratio = (anchor as { ratio?: unknown }).ratio;
    if (typeof ratio !== "number" || !Number.isFinite(ratio)) return;
    return { type: "scroll", ratio: Math.max(0, Math.min(1, ratio)) };
  }
  return;
}

function buildBookmarkLabel(chapterTitle: string, anchor: ProgressAnchor): string {
  if (anchor.type === "paged") {
    return `${chapterTitle} · 第${anchor.pageIndex + 1}页`;
  }
  return `${chapterTitle} · ${Math.round(anchor.ratio * 100)}%`;
}
