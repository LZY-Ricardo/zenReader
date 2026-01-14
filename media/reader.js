(function () {
  const vscode = acquireVsCodeApi();

  const state = {
    library: null,
    session: null,
    currentBookId: null,
    chapters: [],
    bookmarks: [],
    currentChapterId: null,
    mode: "paged",
    fontSize: 16,
    pendingChapterRequest: null,
    scrollRendered: [],
    scrollLoading: false
  };

  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="zr">
      <div class="zr-toolbar">
        <select id="bookSelect" title="书籍"></select>
        <button id="importBtn" class="primary" title="导入 TXT">导入</button>
        <button id="removeBtn" title="移除当前书籍">移除</button>
        <button id="openEditorBtn" title="在编辑区打开">编辑区</button>
        <button id="tocBtn" title="目录">目录</button>
        <button id="bmBtn" title="书签">书签</button>
      </div>
      <div class="zr-main">
        <div id="empty" class="zr-empty hidden"></div>

        <div id="paged" class="zr-reader zr-reader--paged hidden">
          <div id="pagedChapter" class="zr-chapter"></div>
        </div>

        <div id="scroll" class="zr-reader zr-reader--scroll hidden">
          <div id="scrollWrap" class="zr-scroll-wrap"></div>
        </div>

        <div class="zr-footer">
          <button id="prevChapterBtn" title="上一章">上一章</button>
          <button id="prevPageBtn" title="上一页">◀</button>
          <button id="nextPageBtn" title="下一页">▶</button>
          <button id="nextChapterBtn" title="下一章">下一章</button>
          <span class="zr-spacer"></span>
          <button id="modePagedBtn" title="分页">分页</button>
          <button id="modeScrollBtn" title="滚动">滚动</button>
          <button id="fontMinusBtn" title="字号减小">A-</button>
          <button id="fontPlusBtn" title="字号增大">A+</button>
          <button id="addBmBtn" class="primary" title="添加书签">+书签</button>
        </div>

        <div id="drawer" class="zr-drawer" aria-hidden="true">
          <div class="zr-drawer-header">
            <h4 id="drawerTitle">目录</h4>
            <button id="drawerCloseBtn" title="关闭">关闭</button>
          </div>
          <div class="zr-drawer-body">
            <div id="drawerBody" class="zr-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const elBookSelect = byId("bookSelect");
  const elImportBtn = byId("importBtn");
  const elRemoveBtn = byId("removeBtn");
  const elOpenEditorBtn = byId("openEditorBtn");
  const elTocBtn = byId("tocBtn");
  const elBmBtn = byId("bmBtn");
  const elEmpty = byId("empty");
  const elPaged = byId("paged");
  const elPagedChapter = byId("pagedChapter");
  const elScroll = byId("scroll");
  const elScrollWrap = byId("scrollWrap");
  const elPrevChapter = byId("prevChapterBtn");
  const elNextChapter = byId("nextChapterBtn");
  const elPrevPage = byId("prevPageBtn");
  const elNextPage = byId("nextPageBtn");
  const elModePaged = byId("modePagedBtn");
  const elModeScroll = byId("modeScrollBtn");
  const elFontMinus = byId("fontMinusBtn");
  const elFontPlus = byId("fontPlusBtn");
  const elAddBm = byId("addBmBtn");
  const elDrawer = byId("drawer");
  const elDrawerTitle = byId("drawerTitle");
  const elDrawerClose = byId("drawerCloseBtn");
  const elDrawerBody = byId("drawerBody");

  let saveProgressTimer = null;
  let lastProgressKey = "";

  elImportBtn.addEventListener("click", () => vscode.postMessage({ type: "library/importTxt" }));
  elRemoveBtn.addEventListener("click", () => {
    if (!state.currentBookId) return;
    vscode.postMessage({ type: "library/removeBook", payload: { bookId: state.currentBookId } });
  });
  elOpenEditorBtn.addEventListener("click", () => vscode.postMessage({ type: "reader/openInEditor" }));

  elBookSelect.addEventListener("change", () => {
    const id = elBookSelect.value;
    if (!id) return;
    openBook(id);
  });

  elTocBtn.addEventListener("click", () => openDrawer("toc"));
  elBmBtn.addEventListener("click", () => openDrawer("bookmarks"));
  elDrawerClose.addEventListener("click", closeDrawer);

  elModePaged.addEventListener("click", () => setMode("paged"));
  elModeScroll.addEventListener("click", () => setMode("scroll"));

  elFontMinus.addEventListener("click", () => adjustFont(-1));
  elFontPlus.addEventListener("click", () => adjustFont(+1));

  elAddBm.addEventListener("click", () => addBookmark());

  elPrevChapter.addEventListener("click", () => jumpChapter(-1));
  elNextChapter.addEventListener("click", () => jumpChapter(+1));

  elPrevPage.addEventListener("click", () => pagedScrollBy(-1));
  elNextPage.addEventListener("click", () => pagedScrollBy(+1));

  elPaged.addEventListener("scroll", () => scheduleProgressSave());
  elScroll.addEventListener("scroll", () => {
    maybeLoadNextChapter();
    scheduleProgressSave();
  });

  const ro = new ResizeObserver(() => applyPagedLayout());
  ro.observe(elPaged);

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    const type = msg.type;
    const payload = msg.payload;
    if (typeof type !== "string") return;

    switch (type) {
      case "init/state":
        onInitState(payload);
        break;
      case "library/openBookResult":
        onOpenBookResult(payload);
        break;
      case "reader/chapterContent":
        onChapterContent(payload);
        break;
      case "settings/changed":
        onSettingsChanged(payload);
        break;
      case "bookmark/changed":
        onBookmarksChanged(payload);
        break;
      default:
        break;
    }
  });

  vscode.postMessage({ type: "reader/ready" });

  function onInitState(payload) {
    state.library = payload?.library ?? null;
    state.session = payload?.session ?? null;
    const settings = state.library?.settings;
    if (settings?.mode === "paged" || settings?.mode === "scroll") {
      state.mode = settings.mode;
    }
    if (typeof settings?.fontSize === "number") {
      state.fontSize = clampInt(settings.fontSize, 12, 28);
    }
    applyFontSize();
    renderLibrary();

    const lastBookId = state.session?.lastBookId;
    const books = state.library?.books ?? [];
    const initialBook = lastBookId && books.some((b) => b.id === lastBookId) ? lastBookId : books[0]?.id;
    if (initialBook) {
      openBook(initialBook);
    } else {
      showEmpty("还没有书籍，点击“导入”导入 TXT。");
    }
  }

  function renderLibrary() {
    const books = state.library?.books ?? [];
    elBookSelect.innerHTML = "";

    if (books.length === 0) {
      elBookSelect.disabled = true;
      addOption(elBookSelect, "", "（暂无书籍）");
      setControlsEnabled(false);
      return;
    }

    elBookSelect.disabled = false;
    for (const book of books) {
      addOption(elBookSelect, book.id, book.title);
    }

    if (state.currentBookId && books.some((b) => b.id === state.currentBookId)) {
      elBookSelect.value = state.currentBookId;
    }
    setControlsEnabled(true);
  }

  function setControlsEnabled(enabled) {
    const ids = [
      elRemoveBtn,
      elOpenEditorBtn,
      elTocBtn,
      elBmBtn,
      elPrevChapter,
      elNextChapter,
      elPrevPage,
      elNextPage,
      elModePaged,
      elModeScroll,
      elFontMinus,
      elFontPlus,
      elAddBm
    ];
    for (const el of ids) {
      el.disabled = !enabled;
    }
  }

  function openBook(bookId) {
    state.currentBookId = bookId;
    renderLibrary();
    closeDrawer();
    showEmpty("正在加载书籍…");
    vscode.postMessage({ type: "library/openBook", bookId });
  }

  function onOpenBookResult(payload) {
    if (!payload || typeof payload.bookId !== "string") return;
    state.currentBookId = payload.bookId;
    renderLibrary();

    state.chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
    state.bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    state.pendingChapterRequest = null;
    state.scrollRendered = [];
    state.scrollLoading = false;

    const progress = payload.progress;
    const progressMode = progress?.mode;
    if (progressMode === "paged" || progressMode === "scroll") {
      applyMode(progressMode);
    } else {
      applyMode(state.mode);
    }

    const chapterId = progress?.chapterId && state.chapters.some((c) => c.id === progress.chapterId)
      ? progress.chapterId
      : state.chapters[0]?.id;

    if (!chapterId) {
      showEmpty("未能生成目录（章节为空）。请确认 TXT 内容是否有效。");
      return;
    }

    const anchor = progress?.mode === state.mode ? progress.anchor : null;
    requestChapter(chapterId, { append: false, anchor });
  }

  function requestChapter(chapterId, options) {
    if (!state.currentBookId) return;
    state.pendingChapterRequest = { chapterId, ...options };
    vscode.postMessage({ type: "reader/requestChapter", bookId: state.currentBookId, chapterId });
  }

  function onChapterContent(payload) {
    if (!payload) return;
    if (payload.bookId !== state.currentBookId) return;
    const chapterId = payload.chapterId;
    const html = payload.html ?? "";
    const title = payload.title ?? "";

    const pending = state.pendingChapterRequest && state.pendingChapterRequest.chapterId === chapterId
      ? state.pendingChapterRequest
      : { append: false, anchor: null };

    state.pendingChapterRequest = null;

    if (state.mode === "paged") {
      state.currentChapterId = chapterId;
      elPagedChapter.innerHTML = `<h2 class="zr-chapter-title">${escapeHtml(title)}</h2>${html}`;
      applyPagedLayout();
      showReader("paged");

      const pageIndex = pending.anchor?.type === "paged" ? pending.anchor.pageIndex : 0;
      requestAnimationFrame(() => {
        elPaged.scrollLeft = Math.max(0, pageIndex) * elPaged.clientWidth;
        scheduleProgressSave(true);
      });
      return;
    }

    // scroll mode
    state.scrollLoading = false;
    if (!pending.append) {
      state.scrollRendered = [];
      elScrollWrap.innerHTML = "";
    }

    appendScrollChapter({ chapterId, title, html });
    showReader("scroll");

    if (!pending.append) {
      state.currentChapterId = chapterId;
      const ratio = pending.anchor?.type === "scroll" ? pending.anchor.ratio : 0;
      requestAnimationFrame(() => {
        scrollToRatio(chapterId, ratio);
        scheduleProgressSave(true);
      });
    }
  }

  function applyMode(mode) {
    state.mode = mode;
    elModePaged.classList.toggle("active", mode === "paged");
    elModeScroll.classList.toggle("active", mode === "scroll");
    elPrevPage.title = mode === "paged" ? "上一页" : "上一屏";
    elNextPage.title = mode === "paged" ? "下一页" : "下一屏";
    if (mode === "paged") {
      showReader("paged");
      applyPagedLayout();
    } else {
      showReader("scroll");
    }
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    applyMode(mode);
    vscode.postMessage({ type: "settings/update", payload: { mode } });

    // 重开当前章节（以新模式展示）
    const chapterId = state.currentChapterId ?? state.chapters[0]?.id;
    if (chapterId) {
      requestChapter(chapterId, { append: false, anchor: null });
    }
  }

  function applyFontSize() {
    document.documentElement.style.setProperty("--zr-font-size", `${state.fontSize}px`);
    applyPagedLayout();
  }

  function adjustFont(delta) {
    const next = clampInt(state.fontSize + delta, 12, 28);
    if (next === state.fontSize) return;
    state.fontSize = next;
    applyFontSize();
    vscode.postMessage({ type: "settings/update", payload: { fontSize: next } });
  }

  function applyPagedLayout() {
    const width = Math.max(240, elPaged.clientWidth || 240);
    document.documentElement.style.setProperty("--zr-page-width", `${width}px`);
  }

  function pagedScrollBy(direction) {
    if (state.mode === "paged") {
      const delta = elPaged.clientWidth * direction;
      elPaged.scrollLeft += delta;
      scheduleProgressSave(true);
      return;
    }

    if (state.mode === "scroll") {
      const step = Math.max(120, Math.round(elScroll.clientHeight * 0.9));
      elScroll.scrollTop += step * direction;
      maybeLoadNextChapter();
      scheduleProgressSave(true);
    }
  }

  function showEmpty(text) {
    elEmpty.textContent = text;
    elEmpty.classList.remove("hidden");
    elPaged.classList.add("hidden");
    elScroll.classList.add("hidden");
  }

  function showReader(which) {
    elEmpty.classList.add("hidden");
    elPaged.classList.toggle("hidden", which !== "paged");
    elScroll.classList.toggle("hidden", which !== "scroll");
  }

  function openDrawer(kind) {
    if (kind === "toc") {
      elDrawerTitle.textContent = "目录";
      elDrawerBody.innerHTML = renderTocList();
      bindTocClicks();
    } else {
      elDrawerTitle.textContent = "书签";
      elDrawerBody.innerHTML = renderBookmarkList();
      bindBookmarkClicks();
    }
    elDrawer.classList.add("open");
    elDrawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    elDrawer.classList.remove("open");
    elDrawer.setAttribute("aria-hidden", "true");
  }

  function renderTocList() {
    if (!state.currentBookId || state.chapters.length === 0) {
      return `<div class="zr-empty">暂无目录</div>`;
    }
    return state.chapters
      .map((c) => {
        const active = c.id === state.currentChapterId ? "active" : "";
        return `<button class="${active}" data-action="openChapter" data-chapter-id="${escapeAttr(c.id)}">${escapeHtml(c.title)}</button>`;
      })
      .join("");
  }

  function bindTocClicks() {
    elDrawerBody.querySelectorAll("button[data-action='openChapter']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chapterId = btn.getAttribute("data-chapter-id");
        if (!chapterId) return;
        closeDrawer();
        requestChapter(chapterId, { append: false, anchor: null });
      });
    });
  }

  function renderBookmarkList() {
    if (!state.currentBookId) {
      return `<div class="zr-empty">请先打开一本书</div>`;
    }
    if (state.bookmarks.length === 0) {
      return `<div class="zr-empty">暂无书签</div>`;
    }
    return state.bookmarks
      .map((b) => {
        const label = b.label || "书签";
        return `
          <button data-action="openBookmark" data-bookmark-id="${escapeAttr(b.id)}">
            <div class="zr-list-item-row">
              <span class="grow">${escapeHtml(label)}</span>
              <span class="zr-mini" data-action="removeBookmark" data-bookmark-id="${escapeAttr(b.id)}">删除</span>
            </div>
          </button>
        `;
      })
      .join("");
  }

  function bindBookmarkClicks() {
    elDrawerBody.querySelectorAll("[data-action='openBookmark']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-bookmark-id");
        if (!id) return;
        const bm = state.bookmarks.find((x) => x.id === id);
        if (!bm) return;
        closeDrawer();
        requestChapter(bm.chapterId, { append: false, anchor: bm.anchor });
      });
    });

    elDrawerBody.querySelectorAll("[data-action='removeBookmark']").forEach((span) => {
      span.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = span.getAttribute("data-bookmark-id");
        if (!id || !state.currentBookId) return;
        vscode.postMessage({ type: "bookmark/remove", payload: { bookId: state.currentBookId, bookmarkId: id } });
      });
    });
  }

  function onBookmarksChanged(payload) {
    if (!payload || payload.bookId !== state.currentBookId) return;
    state.bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
  }

  function onSettingsChanged(payload) {
    const settings = payload?.settings;
    if (!settings) return;
    if (settings.mode === "paged" || settings.mode === "scroll") {
      state.mode = settings.mode;
      applyMode(state.mode);
    }
    if (typeof settings.fontSize === "number") {
      state.fontSize = clampInt(settings.fontSize, 12, 28);
      applyFontSize();
    }
  }

  function addBookmark() {
    if (!state.currentBookId || !state.currentChapterId) return;
    const { chapterId, anchor } = getCurrentAnchor();
    if (!chapterId) return;
    vscode.postMessage({
      type: "bookmark/add",
      payload: { bookId: state.currentBookId, chapterId, anchor }
    });
  }

  function jumpChapter(delta) {
    if (!state.currentChapterId) return;
    const idx = state.chapters.findIndex((c) => c.id === state.currentChapterId);
    if (idx < 0) return;
    const next = state.chapters[idx + delta];
    if (!next) return;
    requestChapter(next.id, { append: false, anchor: null });
  }

  function appendScrollChapter({ chapterId, title, html }) {
    state.scrollRendered.push(chapterId);
    const article = document.createElement("article");
    article.className = "zr-chapter zr-chapter-block";
    article.setAttribute("data-chapter-id", chapterId);
    article.innerHTML = `<h2 class="zr-chapter-title">${escapeHtml(title)}</h2>${html}`;
    elScrollWrap.appendChild(article);

    // DOM 上限：最多保留 3 章
    const MAX = 3;
    while (elScrollWrap.children.length > MAX) {
      const first = elScrollWrap.children[0];
      const h = first.offsetHeight || 0;
      elScrollWrap.removeChild(first);
      elScroll.scrollTop = Math.max(0, elScroll.scrollTop - h);
      state.scrollRendered.shift();
    }
  }

  function maybeLoadNextChapter() {
    if (state.mode !== "scroll") return;
    if (state.scrollLoading) return;
    if (!state.currentBookId) return;
    if (state.chapters.length === 0) return;
    if (elScroll.scrollTop + elScroll.clientHeight < elScroll.scrollHeight - 240) return;

    const lastId = state.scrollRendered[state.scrollRendered.length - 1] || state.currentChapterId;
    const idx = state.chapters.findIndex((c) => c.id === lastId);
    const next = idx >= 0 ? state.chapters[idx + 1] : null;
    if (!next) return;

    state.scrollLoading = true;
    state.pendingChapterRequest = { chapterId: next.id, append: true, anchor: null };
    vscode.postMessage({ type: "reader/requestChapter", bookId: state.currentBookId, chapterId: next.id });
  }

  function scrollToRatio(chapterId, ratio) {
    const block = elScrollWrap.querySelector(`[data-chapter-id="${CSS.escape(chapterId)}"]`);
    if (!block) return;
    const top = block.offsetTop;
    const h = block.offsetHeight || 1;
    const y = top + clamp(ratio, 0, 1) * h;
    elScroll.scrollTop = y;
  }

  function scheduleProgressSave(immediate) {
    if (!state.currentBookId) return;
    if (saveProgressTimer) clearTimeout(saveProgressTimer);
    saveProgressTimer = setTimeout(() => {
      saveProgressTimer = null;
      saveProgress();
    }, immediate ? 150 : 600);
  }

  function saveProgress() {
    if (!state.currentBookId) return;
    const { chapterId, anchor } = getCurrentAnchor();
    if (!chapterId || !anchor) return;
    const key = `${state.currentBookId}:${state.mode}:${chapterId}:${JSON.stringify(anchor)}`;
    if (key === lastProgressKey) return;
    lastProgressKey = key;
    vscode.postMessage({
      type: "reader/updateProgress",
      payload: {
        bookId: state.currentBookId,
        mode: state.mode,
        chapterId,
        anchor
      }
    });
  }

  function getCurrentAnchor() {
    if (state.mode === "paged") {
      const pageIndex = elPaged.clientWidth > 0 ? Math.round(elPaged.scrollLeft / elPaged.clientWidth) : 0;
      const chapterId = state.currentChapterId;
      return { chapterId, anchor: { type: "paged", pageIndex: Math.max(0, pageIndex) } };
    }

    // scroll
    const blocks = Array.from(elScrollWrap.querySelectorAll("[data-chapter-id]"));
    if (blocks.length === 0) {
      return { chapterId: state.currentChapterId, anchor: { type: "scroll", ratio: 0 } };
    }

    const scrollTop = elScroll.scrollTop + 8;
    let active = blocks[0];
    for (const b of blocks) {
      if (b.offsetTop <= scrollTop) active = b;
      else break;
    }
    const chapterId = active.getAttribute("data-chapter-id");
    const ratio =
      active.offsetHeight > 0 ? clamp((scrollTop - active.offsetTop) / active.offsetHeight, 0, 1) : 0;
    if (chapterId) state.currentChapterId = chapterId;
    return { chapterId: chapterId || state.currentChapterId, anchor: { type: "scroll", ratio } };
  }

  function addOption(select, value, label) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }

  function byId(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function clampInt(n, min, max) {
    return Math.trunc(clamp(n, min, max));
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#96;");
  }
})();
