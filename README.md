# Google Flow 2K Bulk Downloader

A Manifest V3 browser extension for Chromium-based browsers (Chrome, Brave, Edge, etc.) that automates bulk **2K upscaled image downloads** on Google Flow (`labs.google` / `flow.google`).

## Features

- **Dry Scan (`Scan Page`)**: Detects visible generated images on the current Flow page (filtering out navigation icons and small thumbnails) and checks whether inline or modal download controls are available.
- **Bulk 2K Download (`Start 2K`)**: Iterates through every detected image, opens its download menu, and selects the **2K** (`2K` / `2048` / `Upscale`) option automatically.
- **Stop Anytime (`Stop`)**: Requests a clean stop during a bulk run.
- **Custom Download Subfolder**: Routes Flow downloads into a configurable subfolder inside your browser's `Downloads` directory (default: `flow-2k`) with automatic filename deduplication (`uniquify`).
- **Configurable Delay**: Adjust the delay between downloads from `1.0s` to `10.0s` (`0.5s` increments, default `3.0s`).
- **Live Progress & Debug Log**: Tracks `completed / total`, `Failed` count, progress bar, and a scrollable **Debug Selector Log** (up to 120 entries) with **Copy** and **Clear** actions.

## How It Works

1. **Popup UI (`popup.html`, `popup.js`, `popup.css`)**
   - Verifies the active tab matches `labs.google` or `flow.google` (`flow.google.com`).
   - Automatically injects `content.js` via `chrome.scripting.executeScript` if it is not yet active on the tab.
   - Saves your subfolder and delay preferences in `chrome.storage.local`.

2. **Page Automation (`content.js`)**
   - Finds visible `<img>` elements outside `header`, `nav`, and `[role='navigation']` that are at least `110x110` rendered pixels (and `>= 128x128` natural pixels when loaded), deduplicated by `src` and sorted top-to-bottom, left-to-right.
   - For each image:
     1. Scrolls the image into view and dispatches hover events (`pointerover`, `pointerenter`, `mouseover`, `mouseenter`) to reveal the card's download button.
     2. If no inline download button appears, clicks the image to open its detail modal and locates the visible download button.
     3. Clicks the download button, waits for the `2K` / `2048` / `upscale` menu item, and clicks it.
     4. Waits for the configured delay and closes any opened modal/overlay before moving to the next image.

3. **Download Routing (`background.js`)**
   - Listens to `chrome.downloads.onDeterminingFilename`.
   - When routing is active or the download originates from `labs.google` / `flow.google`, sanitizes the configured subfolder name and saves the file to `<Downloads>/<subfolder>/<filename>` with `conflictAction: "uniquify"`.

## How to Add It to Your Browser

1. Clone or download this repository to your machine.
2. Open your Chromium-based browser (Chrome, Brave, Edge, etc.) and navigate to:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `flow-image-downloader` folder (the folder containing `manifest.json`).
5. Open [Google Flow](https://labs.google/fx/tools/flow), scroll your generated images into view, and click the **Flow 2K Bulk Downloader** extension icon in the toolbar.

## Usage

1. Set your desired **Subfolder** (e.g. `flow-2k`) and **Delay** (default `3.0s`).
2. Click **Scan Page** to verify how many images are detected.
3. Click **Start 2K** to begin bulk downloading, or **Stop** to halt after the current item.
