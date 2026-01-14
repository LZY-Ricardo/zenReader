## Zen Reader VS Code 插件

一个在 VS Code 侧边栏阅读 TXT 小说的扩展（MVP 实现中）。

### 开发文档

- 需求/架构/渲染方案与验收标准：`docs/DEVELOPMENT.md`

### 开发与调试

1. 安装依赖：
   - `pnpm install`
2. 在 VS Code 中按 `F5` 运行（会打开一个 Extension Development Host 窗口）。
3. 在新窗口左侧 Activity Bar 点击 `Zen Reader` 图标，进入 `Reader` 面板后点击“导入”选择 TXT。

### 使用方式（当前）

- 侧边栏：书籍下拉切换、导入/移除、目录跳转、书签
- 阅读模式：
  - 分页：左右翻页（底部 ◀ ▶）
  - 滚动：连续下滚，接近底部自动加载下一章
- 可选：点击“编辑区”在编辑区打开阅读面板（侧边栏与编辑区共享同一份本机数据）

### 打包（可选）

- `npx @vscode/vsce package`
  - 生成 `.vsix` 后，可在 VS Code 中通过 `Extensions: Install from VSIX...` 安装。

> 发布到 Marketplace 前，通常需要把 `package.json` 里的 `publisher` 改成你自己的发布者 ID。

### 下一步

告诉我你希望插件实现什么能力（例如：侧边栏/Webview、读取项目文件、格式化/命令、语言服务/语法高亮、与后端通信等），我可以在这个骨架上继续扩展。
