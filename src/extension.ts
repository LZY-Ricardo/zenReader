import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("zenReader.hello", async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const selectedText =
      editor && selection && !selection.isEmpty ? editor.document.getText(selection) : undefined;

    const message = selectedText
      ? `Zen Reader: 当前选中 ${selectedText.length} 个字符`
      : "Zen Reader: Hello!";

    await vscode.window.showInformationMessage(message);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

