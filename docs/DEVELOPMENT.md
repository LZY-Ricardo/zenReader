# Zen Reader 开发文档（草案）

> 目标：在 VS Code 内提供一个“侧边栏小说阅读器”，支持 TXT 导入、目录跳转、左右翻页与连续滚动阅读，并能在下次打开时恢复到上次位置。

## 1. 范围定义

### 1.1 MVP（本阶段必做）

- 书库（最多 5 本）
  - 仅支持本地 `txt` 导入（先假设 UTF-8）
  - 书籍列表：打开/切换/移除
- 阅读形态
  - 侧边栏：正文阅读区 + 工具栏（目录/书签/设置）
  - 编辑区：可选“在编辑区打开阅读”（编辑区显示正文，侧边栏变为功能区）
- 阅读模式
  - 左右翻页（分页模式）
  - 连续滚动（滚动模式）：可一直往下滚动，按需加载下一章，不出现翻页动画
- 目录（章节）
  - 自动分章生成目录
  - 目录跳转到指定章节
- 进度保存与恢复（本机）
  - 退出 VS Code / 重启后，恢复到上次书籍与上次位置
- 书签
  - 添加/列表/跳转/删除
- 外观设置
  - 字号可调
  - 主题：跟随 VS Code 深浅色（可预留自定义主题）

### 1.2 明确不做（至少 MVP 不做）

- 在线书源抓取/解析（后续迭代）
- EPUB/HTML 等格式导入（后续迭代）
- 划线/笔记（可不做）
- 统计（阅读时长/速度等）
- TTS（Text-to-Speech 文本转语音）
- 跨设备/云同步

## 2. 关键验收标准（可测试）

1. **导入 TXT 成功**：导入后出现在书库中，显示目录（自动分章或降级目录）。
2. **书库上限**：最多 5 本；超过时给出明确提示（或要求移除一本后再导入）。
3. **进度恢复**：关闭并重新打开 VS Code 后：
   - 自动恢复到上次阅读的书籍；
   - 恢复到上次阅读位置（误差不超过 1 屏）。
4. **左右翻页**：分页模式下能稳定左右翻页；到章节末页时可进入下一章（或给出明确“下一章”按钮）。
5. **连续滚动**：滚动模式下可一直下滚阅读；靠近底部时自动加载下一章并无明显卡顿；DOM 不无限增长（有上限策略）。
6. **目录跳转**：点击目录章节可立即跳转并更新进度。
7. **书签持久化**：书签在重启后仍存在，并可跳转到正确位置。

## 3. UX 与交互设计

### 3.1 侧边栏（WebviewView）

布局建议（从上到下）：

- 顶部工具栏
  - 书籍下拉选择（最多 5 本）
  - 导入（+）
  - 目录按钮
  - 书签按钮
  - 模式切换：`分页 / 滚动`
  - 字号：`A- / A+` 或滑条
  - “在编辑区打开阅读”
- 主阅读区
  - 分页模式：左右翻页容器 + 页码/进度提示
  - 滚动模式：连续滚动容器
- 侧滑面板
  - 目录：章节列表（支持搜索可后续加）
  - 书签：书签列表

交互原则：

- 主操作不应要求用户离开阅读区（目录/书签以面板覆盖或侧滑展开）。
- 所有状态变化（切章/翻页/滚动）应节流写入进度，避免频繁 IO。

### 3.2 编辑区阅读（WebviewPanel）

- 编辑区打开一个 WebviewPanel 显示正文（更宽、更适合长时间阅读）。
- 侧边栏 Zen Reader 视图保留为“功能区”（目录、书签、设置、书库切换）。
- 两个视图共享同一份“阅读会话状态”（由 Extension Host 作为唯一真相源）。

### 3.3 快捷键（建议）

> 快捷键可先留空，后续通过 `contributes.keybindings` 补齐默认值，或仅提供命令让用户自行绑定。

- 下一页 / 上一页
- 下一章 / 上一章
- 打开目录
- 添加书签
- 切换模式（分页/滚动）

## 4. 技术架构

### 4.1 组件划分

- Extension Host（Node.js 侧）
  - 书库管理：导入/移除/选择
  - TXT 解析与分章索引生成
  - 持久化：书籍元数据、章节索引、书签、阅读进度
  - WebviewViewProvider & WebviewPanel 生命周期管理
  - 与 Webview 双向消息通信（`postMessage` / `onDidReceiveMessage`）
- Webview（浏览器侧）
  - UI 渲染、主题适配
  - 分页/滚动渲染
  - 用户交互事件（翻页、滚动、点目录、点书签）
  - 读取进度采集并发送给 Extension Host

### 4.2 通信方式（权威 API）

Webview 侧通过 `acquireVsCodeApi()` 获取对象，并使用 `vscode.postMessage(...)` 与扩展通信；
扩展侧通过 `webview.onDidReceiveMessage(...)` 接收消息，并用 `webview.postMessage(...)` 回传数据。

Webview 可用 `vscode.getState()/vscode.setState()` 保存“视图级临时状态”（例如展开/折叠面板），但**持久化阅读进度**仍以 Extension Host 存储为准。

### 4.3 建议的消息协议（示例）

统一包结构：

- `type`: 字符串，消息类型
- `requestId`: 可选，用于请求-响应匹配
- `payload`: 负载

典型消息：

- Webview -> Extension
  - `reader/ready`
  - `library/importTxt`
  - `library/openBook` `{ bookId }`
  - `reader/requestChapter` `{ bookId, chapterId }`
  - `reader/updateProgress` `{ bookId, mode, chapterId, anchor }`
  - `bookmark/add` `{ bookId, chapterId, anchor, label? }`
  - `bookmark/remove` `{ bookmarkId }`
  - `settings/update` `{ fontSize, mode }`
  - `reader/openInEditor`
- Extension -> Webview
  - `init/state` `{ library, settings, lastSession }`
  - `library/changed` `{ library }`
  - `reader/chapterContent` `{ bookId, chapterId, title, html }`
  - `bookmark/changed` `{ bookmarks }`
  - `error` `{ message, detail? }`

## 5. 数据模型（建议）

### 5.1 Book（书籍）

- `id`: string（uuid）
- `title`: string
- `createdAt`: number（epoch ms）
- `updatedAt`: number
- `format`: `"txt"`
- `encoding`: `"utf-8"`（MVP）
- `storage`: `{ contentUri: Uri, indexUri: Uri }`
- `chapters`: `Chapter[]`（可只存于 index 文件）

### 5.2 Chapter（章节）

> MVP 推荐“字符偏移”索引：实现简单，性能足够（百万字级别可接受）。

- `id`: string
- `title`: string
- `order`: number
- `start`: number（章节在全文字符串中的起始字符偏移）
- `end`: number（结束字符偏移）

### 5.3 ReadingProgress（阅读进度）

- `bookId`
- `mode`: `"paged" | "scroll"`
- `chapterId`
- `anchor`
  - 分页：`{ pageIndex: number }`
  - 滚动：`{ chapterId: string, ratio: number }`（ratio=0..1，表示章节内相对位置）
- `updatedAt`

### 5.4 Bookmark（书签）

- `id`
- `bookId`
- `chapterId`
- `anchor`（同上，或存滚动专用 anchor）
- `label?`
- `createdAt`

## 6. 持久化方案（本机）

### 6.1 存储位置选择（权威 API）

- 小体积状态可放 `ExtensionContext.globalState`
- 文件/索引/较大 JSON 推荐放 `ExtensionContext.globalStorageUri` 下，用 `vscode.workspace.fs` 读写

### 6.2 目录结构（建议）

在 `globalStorageUri` 下：

- `library.json`：书库列表（最多 5 本）与全局设置
- `books/<bookId>/content.txt`：书籍正文（UTF-8）
- `books/<bookId>/index.json`：章节索引（chapters）
- `books/<bookId>/bookmarks.json`：书签列表
- `session.json`：最近一次会话（last opened book + progress）

## 7. TXT 导入与分章

### 7.1 编码约束

MVP 仅支持 UTF-8。若用户导入后乱码：

- 提示用户将 TXT 转为 UTF-8 后再导入（后续可引入编码选择/探测）。

### 7.2 分章规则（默认）

章节标题候选行满足：

1. 匹配标题模式（正则），例如：
   - `第XX章/回/节/卷/部/篇`
   - `序章/楔子/引子/前言/后记/番外/尾声`
   - `卷一/卷1 ...`
2. 启发式过滤（降低误判）：
   - 行长度不超过 40（可调）
   - 不以 `。！？` 结尾（可调）
   - 与上一个标题间隔至少 `minChapterChars`（默认 200~500，可调）

### 7.3 降级目录（无明显章节时）

若识别到的章节数过少（例如 < 3），则按固定字符数切块生成“临时章节”：

- `chunkSizeChars`：例如 8000~15000
- 标题：`第 1 节 / 第 2 节 ...`

## 8. 渲染方案

### 8.1 纯文本到 HTML

- 必须 HTML escape
- 段落策略：
  - 按空行分段：每段包一层 `<p>`
  - 段内单换行可转 `<br/>`（避免破坏原格式）

### 8.2 分页模式（左右翻页）

目标：实现“左右翻页”，无需复杂分页算法。

推荐实现：

- 使用 CSS Columns 将章节排成多列：
  - 容器固定高度、横向滚动
  - `column-width` ≈ 视图宽度
  - 通过设置 `scrollLeft += width` 实现翻页
- 进度：`pageIndex = round(scrollLeft / width)`
- 交互：按钮/命令触发上一页/下一页；到末页可进入下一章

### 8.3 滚动模式（连续滚动）

目标：用户可持续下滚阅读，不出现翻页动画。

推荐实现：

- 初始渲染：当前章节
- 触底加载：滚动接近底部阈值时自动请求下一章并 append
- DOM 上限：最多保留 N 个章节块（例如 2~3）
  - 超过上限时移除最上方章节块，并补偿 `scrollTop`，避免可视区域跳变
- 进度 anchor：
  - 用 IntersectionObserver 找到“当前主章节块”
  - 记录该章节块内的相对比例 `ratio`（0..1）

## 9. 状态恢复与同步

### 9.1 统一真相源

Extension Host 保存：

- 当前书籍/模式/章节/anchor
- 设置（字号等）
- 书签

Webview 仅负责：

- 渲染与交互
- 临时 UI 状态（可用 `vscode.setState`）

### 9.2 双视图同步（侧边栏 + 编辑区）

- Extension Host 维护 `activeViews`（所有活跃 webview）
- 当进度/设置/书签变化时，广播 `.../changed` 消息到所有视图，保证一致

## 10. 边界情况与错误处理

- 导入文件为空/过大：提示并拒绝或给出明确反馈
- 无法解析章节：使用降级目录
- 书籍被移除：清理对应 storage 目录（执行前需用户确认）
- Webview 重建：通过 `init/state` 重新下发状态并渲染

## 11. 性能策略（百万字级别）

- 只缓存“当前书籍全文字符串”与少量章节 HTML（LRU/按需）
- Webview 端避免渲染全书：
  - 分页：仅渲染当前章节
  - 滚动：最多保留 2~3 个章节块
- 进度写入节流：例如 500ms~1000ms 写一次，且仅在变化时写

## 12. 安全与合规（Webview）

- Webview HTML 设置 CSP（默认禁用外部资源）
- 不引入远程脚本/样式（MVP）
- 在线书源后续若加入：需要明确免责声明与站点条款风险评估

## 13. 开发工作流（pnpm）

### 13.1 选择 pnpm 的结论

pnpm 可行且推荐：

- 安装更快、磁盘占用更低
- 对多包/未来扩展更友好

### 13.2 日常命令

- 安装依赖：`pnpm install`
- 编译：`pnpm run compile`
- 监听编译：`pnpm run watch`
- 调试：VS Code 中按 `F5`

### 13.3 从 npm 迁移到 pnpm（需确认后执行）

迁移建议步骤：

1. 删除 `node_modules/`
2. 删除 `package-lock.json`
3. 执行 `pnpm install` 生成 `pnpm-lock.yaml`
4. 将 `.vscode/tasks.json` 从 `npm` 任务切换为 `pnpm`（或改为 shell 任务）

> 该仓库已完成上述迁移：现在使用 `pnpm-lock.yaml`，VS Code 的 `preLaunchTask` 也已切换为 `pnpm: watch`。

## 14. 里程碑建议

- M0：侧边栏 WebviewView + 最小 UI 骨架（无导入）
- M1：TXT 导入 + 分章 + 目录 + 章节阅读
- M2：进度持久化 + 恢复（滚动 + 分页两种）
- M3：书签 + 书库管理（最多 5 本）
- M4：编辑区阅读模式（WebviewPanel）+ 双视图同步
- M5：主题/字号完善 + 快捷键（可选）
