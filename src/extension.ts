import * as vscode from "vscode";

import { ReaderViewProvider } from "./reader/ReaderViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("Zen Reader");
  context.subscriptions.push(log);
  log.appendLine(`[activate] start (vscode=${vscode.version})`);

  try {
    const canRegister =
      typeof (vscode.window as unknown as { registerWebviewViewProvider?: unknown })
        .registerWebviewViewProvider === "function";

    if (!canRegister) {
      log.appendLine("[activate] registerWebviewViewProvider is not available");
      void vscode.window.showErrorMessage(
        "Zen Reader：当前 VS Code 版本不支持 WebviewView（请升级 VS Code）。"
      );
      return;
    }

    const readerProvider = new ReaderViewProvider(context, log);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(ReaderViewProvider.viewType, readerProvider, {
        webviewOptions: { retainContextWhenHidden: true }
      })
    );
    log.appendLine(`[activate] registered view provider: ${ReaderViewProvider.viewType}`);

    context.subscriptions.push(
      vscode.commands.registerCommand("zenReader.focus", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.zenReader");
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("zenReader.importTxt", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.zenReader");
        await readerProvider.importTxtFromCommand();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("zenReader.openInEditor", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.zenReader");
        await readerProvider.openInEditorFromCommand();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("zenReader.toggle", async () => {
        // 检查侧边栏是否可见且 Zen Reader 容器是否活跃
        const activeView = vscode.window.activeTextEditor;
        const sidebarVisible = vscode.window.visibleTextEditors.some(editor =>
          editor.document.uri.scheme === 'webview'
        );

        // 尝试获取当前侧边栏视图
        const sidebarView = (vscode.window as any).activeViewColumn;

        // 如果侧边栏可见且可能是 Zen Reader，则隐藏
        if (sidebarView === 2 || (sidebarView === undefined && readerProvider.view?.visible)) {
          await vscode.commands.executeCommand("workbench.action.closeSidebar");
        } else {
          // 否则显示 Zen Reader
          await vscode.commands.executeCommand("workbench.view.extension.zenReader");
        }
      })
    );

    log.appendLine("[activate] done");
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    log.appendLine(`[activate] failed: ${message}`);
    void vscode.window.showErrorMessage("Zen Reader：激活失败（详情见 Output -> Zen Reader）");
  }
}

export function deactivate() {}
