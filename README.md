## Zen Reader VS Code 插件

这是一个最小可运行的 VS Code 扩展骨架（TypeScript）。当前提供一个示例命令：`Zen Reader: Hello`。

### 开发文档

- 需求/架构/渲染方案与验收标准：`docs/DEVELOPMENT.md`

### 开发与调试

1. 安装依赖：
   - `pnpm install`
2. 在 VS Code 中按 `F5` 运行（会打开一个 Extension Development Host 窗口）。
3. 在命令面板（`Ctrl+Shift+P`）执行：
   - `Zen Reader: Hello`

### 打包（可选）

- `npx @vscode/vsce package`
  - 生成 `.vsix` 后，可在 VS Code 中通过 `Extensions: Install from VSIX...` 安装。

> 发布到 Marketplace 前，通常需要把 `package.json` 里的 `publisher` 改成你自己的发布者 ID。

### 下一步

告诉我你希望插件实现什么能力（例如：侧边栏/Webview、读取项目文件、格式化/命令、语言服务/语法高亮、与后端通信等），我可以在这个骨架上继续扩展。
