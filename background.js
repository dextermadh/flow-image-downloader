function sanitizeFolder(raw) {
  return (raw || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.trim().replace(/[<>:"|?*\x00-\x1f]/g, ""))
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
}

function isFlowDownload(item) {
  const url = item.url || "";
  const ref = item.referrer || "";
  return (
    url.startsWith("blob:https://labs.google") ||
    url.startsWith("blob:https://flow.google") ||
    ref.includes("labs.google") ||
    ref.includes("flow.google")
  );
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SET_ROUTING") {
    const patch = { routingActive: !!msg.active };
    if (typeof msg.folder === "string") {
      patch.folderName = sanitizeFolder(msg.folder);
    }
    chrome.storage.local.set(patch).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.local.get(["routingActive", "folderName"]).then(({ routingActive, folderName }) => {
    const folder = sanitizeFolder(folderName);
    if (!folder || (!routingActive && !isFlowDownload(item))) {
      suggest();
      return;
    }

    const baseName = (item.filename || "flow-image.png").split("/").pop();
    suggest({
      filename: `${folder}/${baseName}`,
      conflictAction: "uniquify"
    });
  });
  return true;
});
