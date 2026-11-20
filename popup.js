const els = {
  tabStatus: document.getElementById("tabStatus"),
  scanBtn: document.getElementById("scanBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  delayRange: document.getElementById("delayRange"),
  delayVal: document.getElementById("delayVal"),
  folderInput: document.getElementById("folderInput"),
  progressText: document.getElementById("progressText"),
  failedText: document.getElementById("failedText"),
  barFill: document.getElementById("barFill"),
  logBox: document.getElementById("logBox"),
  copyLogsBtn: document.getElementById("copyLogsBtn"),
  clearLogsBtn: document.getElementById("clearLogsBtn")
};

let activeTabId = null;

function renderState(s) {
  if (!s) return;
  const done = (s.completed || 0) + (s.failed || 0);
  const total = s.total || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  els.progressText.textContent = `${s.completed || 0} / ${total}`;
  els.failedText.textContent = `Failed: ${s.failed || 0}`;
  els.barFill.style.width = `${pct}%`;

  els.scanBtn.disabled = !!s.running;
  els.startBtn.disabled = !!s.running;
  els.stopBtn.disabled = !s.running;

  if (Array.isArray(s.logs) && s.logs.length > 0) {
    els.logBox.textContent = s.logs.join("\n");
    els.logBox.scrollTop = els.logBox.scrollHeight;
  } else {
    els.logBox.textContent = "Ready. Click Scan Page to detect images.";
  }
}

function sendToTab(msg) {
  if (!activeTabId) return Promise.resolve(null);
  return chrome.tabs.sendMessage(activeTabId, msg).catch(() => null);
}

const FLOW_URL_RE = /^https:\/\/(([\w-]+\.)?labs\.google|flow\.google(\.com)?)\//i;

async function ensureContentScript(tabId) {
  let status = await sendToTab({ type: "GET_STATUS" });
  if (status) return { status, error: null };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    status = await sendToTab({ type: "GET_STATUS" });
    if (!status) {
      return { status: null, error: "Injected content.js but no response. Refresh Flow tab." };
    }
    return { status, error: null };
  } catch (err) {
    return { status: null, error: `Inject failed: ${err.message}` };
  }
}

async function init() {
  const saved = await chrome.storage.local.get(["delayMs", "folderName"]);
  if (saved.delayMs) {
    els.delayRange.value = saved.delayMs;
    els.delayVal.textContent = `${(saved.delayMs / 1000).toFixed(1)}s`;
  }
  if (typeof saved.folderName === "string") {
    els.folderInput.value = saved.folderName;
  } else {
    chrome.storage.local.set({ folderName: els.folderInput.value.trim() });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  if (tab?.id && FLOW_URL_RE.test(url)) {
    activeTabId = tab.id;
    els.tabStatus.textContent = "Flow Active";
    els.tabStatus.classList.add("ok");
    const { status, error } = await ensureContentScript(tab.id);
    if (status) {
      renderState(status);
    } else {
      els.logBox.textContent = `${error}\nURL: ${url}`;
    }
  } else {
    els.tabStatus.textContent = "Not Flow";
    els.tabStatus.classList.add("warn");
    els.scanBtn.disabled = true;
    els.startBtn.disabled = true;
    els.stopBtn.disabled = true;
    els.logBox.textContent = `Current tab URL not matched:\n${url || "(unavailable)"}`;
  }
}

els.folderInput.addEventListener("input", () => {
  chrome.storage.local.set({ folderName: els.folderInput.value.trim() });
});

els.delayRange.addEventListener("input", () => {
  const ms = Number(els.delayRange.value);
  els.delayVal.textContent = `${(ms / 1000).toFixed(1)}s`;
  chrome.storage.local.set({ delayMs: ms });
});

els.scanBtn.addEventListener("click", async () => {
  let status = await sendToTab({ type: "SCAN" });
  if (!status && activeTabId) {
    const res = await ensureContentScript(activeTabId);
    if (res.error) {
      els.logBox.textContent = res.error;
      return;
    }
    status = await sendToTab({ type: "SCAN" });
  }
  if (status) renderState(status);
  else els.logBox.textContent = "Scan failed: no response from Flow tab. Refresh tab.";
});

els.startBtn.addEventListener("click", async () => {
  const delayMs = Number(els.delayRange.value);
  const folder = els.folderInput.value.trim();
  await chrome.runtime.sendMessage({ type: "SET_ROUTING", active: true, folder });
  let res = await sendToTab({ type: "START", delayMs });
  if (!res && activeTabId) {
    const inj = await ensureContentScript(activeTabId);
    if (inj.error) {
      els.logBox.textContent = inj.error;
      return;
    }
    res = await sendToTab({ type: "START", delayMs });
  }
  if (!res) {
    els.logBox.textContent = "Start failed: no response from Flow tab. Refresh tab.";
  }
});

els.stopBtn.addEventListener("click", async () => {
  await sendToTab({ type: "STOP" });
  await chrome.runtime.sendMessage({ type: "SET_ROUTING", active: false });
});

els.copyLogsBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.logBox.textContent || "");
  els.copyLogsBtn.textContent = "Copied";
  setTimeout(() => (els.copyLogsBtn.textContent = "Copy"), 1200);
});

els.clearLogsBtn.addEventListener("click", async () => {
  const status = await sendToTab({ type: "CLEAR_LOGS" });
  renderState(status);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATUS_UPDATE") {
    renderState(msg.state);
  }
});

init();
