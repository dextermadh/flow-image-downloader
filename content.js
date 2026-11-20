(() => {
  if (window.__flow2kInitialized) return;
  window.__flow2kInitialized = true;

  const MAX_LOGS = 120;
  const DOWNLOAD_ICON_NAMES = new Set(["download", "file_download", "get_app", "save_alt", "arrow_downward"]);

  const state = {
    running: false,
    stopRequested: false,
    total: 0,
    completed: 0,
    failed: 0,
    currentIndex: 0,
    delayMs: 3000,
    logs: []
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function ts() {
    return new Date().toTimeString().slice(0, 8);
  }

  function log(msg, level = "info") {
    const entry = `[${ts()}] [${level.toUpperCase()}] ${msg}`;
    state.logs.push(entry);
    if (state.logs.length > MAX_LOGS) {
      state.logs.splice(0, state.logs.length - MAX_LOGS);
    }
    broadcastStatus();
  }

  function broadcastStatus() {
    chrome.runtime.sendMessage({ type: "STATUS_UPDATE", state: getPublicState() }).catch(() => {});
  }

  function getPublicState() {
    return {
      running: state.running,
      total: state.total,
      completed: state.completed,
      failed: state.failed,
      currentIndex: state.currentIndex,
      delayMs: state.delayMs,
      logs: state.logs
    };
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function describeEl(el) {
    if (!el) return "null";
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute("aria-label");
    const role = el.getAttribute("role");
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `<${tag}${role ? ` role="${role}"` : ""}${aria ? ` aria="${aria}"` : ""}>${text ? ` "${text}"` : ""}`;
  }

  function getButtonLabel(el) {
    const parts = [
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.getAttribute("data-tooltip") || "",
      el.innerText || el.textContent || ""
    ];
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function isDownloadButton(el) {
    if (!isVisible(el)) return false;
    const label = getButtonLabel(el).toLowerCase();
    if (/\bdownload\b/.test(label)) return true;

    // Check Material Symbols / Icons inside button
    const icon = el.querySelector("span, i, mat-icon, svg");
    if (icon) {
      const iconText = (icon.textContent || "").trim().toLowerCase();
      if (DOWNLOAD_ICON_NAMES.has(iconText)) return true;
    }
    return false;
  }

  function findGeneratedImages() {
    const imgs = Array.from(document.querySelectorAll("img"));
    const candidates = [];
    const seenSrc = new Set();

    for (const img of imgs) {
      if (!isVisible(img)) continue;
      if (img.closest("header, nav, [role='navigation']")) continue;

      const rect = img.getBoundingClientRect();
      const nw = img.naturalWidth || 0;
      const nh = img.naturalHeight || 0;
      // Skip tiny icons, avatars, or decorative thumbnails
      if (rect.width < 110 || rect.height < 110) continue;
      if (nw > 0 && (nw < 128 || nh < 128)) continue;

      const src = img.currentSrc || img.src || "";
      if (!src || seenSrc.has(src)) continue;
      seenSrc.add(src);

      candidates.push({ img, rect });
    }

    // Sort top-to-bottom, left-to-right
    candidates.sort((a, b) => {
      const dy = a.rect.top - b.rect.top;
      return Math.abs(dy) > 20 ? dy : a.rect.left - b.rect.left;
    });

    return candidates.map((c) => c.img);
  }

  function hoverCard(img) {
    let cur = img;
    for (let i = 0; i < 5 && cur && cur !== document.body; i++) {
      for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter"]) {
        cur.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      cur = cur.parentElement;
    }
  }

  function findDownloadButtonInScope(root) {
    if (!root) return null;
    const btns = Array.from(root.querySelectorAll("button, [role='button'], a[download]"));
    return btns.find(isDownloadButton) || null;
  }

  function findCardContainer(img) {
    let cur = img.parentElement;
    for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
      const rect = cur.getBoundingClientRect();
      // Card container shouldn't be the entire viewport/grid
      if (rect.width > window.innerWidth * 0.85 && rect.height > window.innerHeight * 0.85) {
        return cur.previousElementSibling ? img.parentElement : cur;
      }
      if (findDownloadButtonInScope(cur)) return cur;
      cur = cur.parentElement;
    }
    return img.parentElement;
  }

  async function waitFor(fn, timeoutMs = 3000, intervalMs = 120) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (state.stopRequested) return null;
      const res = fn();
      if (res) return res;
      await sleep(intervalMs);
    }
    return null;
  }

  function find2KMenuOption() {
    const selectors = "[role='menuitem'], [role='option'], [role='menu'] button, [role='listbox'] button, button";
    const items = Array.from(document.querySelectorAll(selectors)).filter(isVisible);

    const menuScoped = items.filter((el) =>
      el.closest("[role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], .cdk-overlay-pane")
    );
    const pool = menuScoped.length > 0 ? menuScoped : items;

    const exact2k = pool.find((el) => {
      const txt = getButtonLabel(el);
      return /\b2\s*k\b/i.test(txt) || /\b2048\b/.test(txt);
    });
    if (exact2k) return { match: exact2k, pool };

    const upscale = pool.find((el) => /upscale/i.test(getButtonLabel(el)));
    return { match: upscale || null, pool };
  }

  function findVisibleDownloadButton() {
    const exact = document.querySelector('button[aria-label="Download media"]');
    if (exact && isVisible(exact)) return exact;
    const all = Array.from(document.querySelectorAll("button, [role='button']"));
    return all.reverse().find(isDownloadButton) || null;
  }

  function findCloseOrBackButton() {
    const btns = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible);
    return (
      btns.find((b) => {
        const lbl = getButtonLabel(b).toLowerCase();
        if (/\b(close|dismiss|back)\b/.test(lbl)) return true;
        const icon = b.querySelector("span, i, mat-icon");
        const iconTxt = (icon?.textContent || "").trim().toLowerCase();
        return iconTxt === "close" || iconTxt === "arrow_back";
      }) || null
    );
  }

  async function closeOverlays(beforeUrl) {
    for (const target of [document.activeElement, document, window]) {
      if (!target) continue;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    }
    await sleep(250);

    if (location.href !== beforeUrl) {
      const backBtn = findCloseOrBackButton();
      if (backBtn) {
        backBtn.click();
      } else {
        history.back();
      }
      await waitFor(() => location.href === beforeUrl, 2500);
      await sleep(300);
      return;
    }

    // If detail overlay is still open (Download media button still visible), click close/back
    if (findVisibleDownloadButton()) {
      const closeBtn = findCloseOrBackButton();
      if (closeBtn) {
        closeBtn.click();
        await sleep(300);
      }
    }
  }

  async function processImage(img, idx, total) {
    const beforeUrl = location.href;
    log(`Item ${idx + 1}/${total}: scrolling & hovering`);
    img.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(350);

    hoverCard(img);
    await sleep(250);

    const card = findCardContainer(img);
    let downloadBtn = findDownloadButtonInScope(card);
    let openedModal = false;

    if (!downloadBtn) {
      log(`No inline download btn on card; clicking image to open modal`);
      img.click();
      openedModal = true;
      downloadBtn = await waitFor(findVisibleDownloadButton, 2500);
    }

    if (!downloadBtn) {
      log(`Item ${idx + 1}: Download button not found (connected=${img.isConnected})`, "warn");
      if (openedModal) await closeOverlays(beforeUrl);
      return false;
    }

    log(`Item ${idx + 1}: clicking ${describeEl(downloadBtn)}`);
    downloadBtn.click();

    // Wait for 2K menu option
    const menuResult = await waitFor(() => {
      const res = find2KMenuOption();
      return res.match ? res : null;
    }, 2500);

    if (!menuResult || !menuResult.match) {
      const seen = find2KMenuOption().pool.slice(0, 8).map(getButtonLabel).filter(Boolean);
      log(`Item ${idx + 1}: 2K option not found. Visible options: [${seen.join(" | ")}]`, "warn");
      await closeOverlays(beforeUrl);
      return false;
    }

    log(`Item ${idx + 1}: clicking 2K option ${describeEl(menuResult.match)}`);
    menuResult.match.click();

    await sleep(state.delayMs);
    if (openedModal) await closeOverlays(beforeUrl);
    return true;
  }

  async function runBulk(delayMs) {
    if (state.running) return;
    state.running = true;
    state.stopRequested = false;
    state.delayMs = delayMs || 3000;
    state.completed = 0;
    state.failed = 0;
    state.currentIndex = 0;

    const initialImages = findGeneratedImages();
    const targetSrcs = initialImages.map((el) => el.currentSrc || el.src);
    state.total = initialImages.length;
    log(`Scan found ${initialImages.length} generated image(s). Delay=${state.delayMs}ms`);
    broadcastStatus();

    if (initialImages.length === 0) {
      log("No generated images found. Scroll gallery into view or open a project.", "warn");
      state.running = false;
      broadcastStatus();
      return;
    }

    for (let i = 0; i < targetSrcs.length; i++) {
      if (state.stopRequested) {
        log("Stopped by user.", "warn");
        break;
      }
      state.currentIndex = i + 1;
      broadcastStatus();

      let img = initialImages[i];
      if (!img || !img.isConnected) {
        const refreshed = findGeneratedImages();
        img = refreshed.find((el) => (el.currentSrc || el.src) === targetSrcs[i]) || refreshed[i];
      }
      if (!img) {
        state.failed++;
        log(`Item ${i + 1}: image element missing after navigation`, "warn");
        broadcastStatus();
        continue;
      }

      try {
        const ok = await processImage(img, i, targetSrcs.length);
        if (ok) state.completed++;
        else state.failed++;
      } catch (err) {
        state.failed++;
        log(`Item ${i + 1} error: ${err.message}`, "error");
      }
      broadcastStatus();
    }

    state.running = false;
    log(`Done. Completed=${state.completed}, Failed=${state.failed}, Total=${state.total}`);
    broadcastStatus();
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "SET_ROUTING", active: false }).catch(() => {});
    }, 2000);
  }

  function scanOnly() {
    const images = findGeneratedImages();
    state.total = images.length;
    log(`Dry scan: ${images.length} candidate image(s) on page.`);
    if (images.length > 0) {
      const sample = images[0];
      hoverCard(sample);
      const card = findCardContainer(sample);
      const btn = findDownloadButtonInScope(card);
      log(`Sample[0]: ${sample.naturalWidth}x${sample.naturalHeight}, inlineBtn=${btn ? describeEl(btn) : "none (will try modal)"}`);
    }
    broadcastStatus();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "GET_STATUS") {
      sendResponse(getPublicState());
      return true;
    }
    if (msg.type === "SCAN") {
      scanOnly();
      sendResponse(getPublicState());
      return true;
    }
    if (msg.type === "START") {
      runBulk(msg.delayMs);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "STOP") {
      state.stopRequested = true;
      log("Stop requested...");
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "CLEAR_LOGS") {
      state.logs = [];
      broadcastStatus();
      sendResponse(getPublicState());
      return true;
    }
  });
})();
