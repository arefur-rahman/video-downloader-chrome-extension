# Universal Video Downloader — Chrome Extension

Download videos and audio from **YouTube, TikTok, Facebook, Instagram, Twitter/X, Vimeo**, and more — directly to your computer using [yt-dlp](https://github.com/yt-dlp/yt-dlp).

Everything runs **locally on your machine**. No cloud uploads, no third-party download servers.

**Repository:** [youtube-downloader-chrome-extension v3.0.0](https://github.com/arefur-rahman/youtube-downloader-chrome-extension/releases/tag/v3.0.0)

[![BuyMeACha](https://img.shields.io/badge/☕-BuyMeACha-orange)](https://chabondhu.com/aref)

---

## Simple Guide (For Everyone)

If you just want to download a video, follow these steps:

### What you need installed first

| Requirement | What it is | Why you need it |
|---|---|---|
| **Google Chrome** | Your web browser | Runs the extension |
| **yt-dlp** | A free download tool | Actually downloads the video/audio |
| **ffmpeg** *(recommended)* | A free media tool | Merges video + audio into one file (e.g. MP4) |
| **Node.js** *(one-time setup)* | A free runtime | Lets the extension talk to yt-dlp on your computer |

> **Note:** You only install Node.js once to set up the extension. After that, you just open Chrome and click Download.

### How to install the required tools

#### macOS (using Homebrew)

```bash
# Install Homebrew first if you don't have it: https://brew.sh
brew install yt-dlp ffmpeg node
```

#### Windows (using winget)

Open **PowerShell** or **Command Prompt** and run:

```powershell
winget install -e --id OpenJS.NodeJS.LTS --version 24.14.1 --id=Gyan.FFmpeg --id=yt-dlp.yt-dlp
```

> **Tip:** Close and reopen your terminal after installing so `yt-dlp`, `ffmpeg`, and `node` are recognized.  
> Installing `yt-dlp` may also pull in FFmpeg automatically — running both commands is fine.

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install yt-dlp ffmpeg nodejs npm
```

Verify everything is installed:

```bash
yt-dlp --version
ffmpeg -version
node --version
```

### Install the extension (one-time)

#### Option A — Download the release *(recommended for most users)*

1. **Download the latest release (v3.0.0)**
   - Open: [youtube-downloader-chrome-extension v3.0.0](https://github.com/arefur-rahman/youtube-downloader-chrome-extension/releases/tag/v3.0.0)
   - Download the **video_downloader_3.0.0.zip** file
   - Extract the ZIP to a folder you will keep (e.g. `Downloads/youtube-downloader-chrome-extension`)

2. **Register the native download helper** (connects Chrome to yt-dlp)

   Open a terminal in the extracted folder, then run:

   ```bash
   node setup_native_host.js
   ```

3. **Load the extension in Chrome**
   - Open `chrome://extensions`
   - Turn on **Developer mode** (top-right toggle)
   - Click **Load unpacked** (at left side)
   - Select the **`video_downloader_3.0.0.zip`** folder inside the extracted project


> No build step needed — the release already includes the ready-to-use `dist` folder.

#### Option B — Clone from GitHub *(for developers)*

```bash
git clone https://github.com/arefur-rahman/youtube-downloader-chrome-extension.git
cd youtube-downloader-chrome-extension
pnpm install
pnpm build
node setup_native_host.js
```

Then load the **`dist`** folder in Chrome as described above.

### How to download a video

1. Open a video page (e.g. a YouTube video).
2. Click the **Video Downloader** icon in the Chrome toolbar.
3. Wait a moment while the extension detects the video and available qualities.
4. Choose **Video** or **Audio**, pick a resolution or format, then click **Download**.
5. The file is saved to your **Downloads** folder.

While a download is running, the popup shows progress. You can cancel from there at any time.

---

## Supported Sites

| Platform | Video | Audio |
|---|---|---|
| YouTube | ✅ | ✅ |
| Facebook | ✅ | ✅ |
| Instagram | ✅ | ✅ |
| TikTok | ✅ | ✅ |
| Twitter / X | ✅ | ✅ |

<sub>I tried on some 18+ website unfortunately it works.</sub>

---

## Features

- Download video in multiple resolutions (360p up to 4K, when available)
- Extract audio as MP3, WAV, Opus, or OGG
- Video-only (mute) or video + audio modes
- Live download progress in the popup
- Cancel downloads mid-way
- Works offline from your machine — powered by yt-dlp

---

## Troubleshooting

### "Engine unavailable" or download fails

- Make sure **yt-dlp** is installed and works in Terminal:
  ```bash
  yt-dlp --version
  ```
- Re-run the native host setup:
  ```bash
  node setup_native_host.js
  ```
- Restart Chrome completely (quit and reopen).

### Video downloads but has no sound

- Install **ffmpeg** and make sure it is on your PATH:
  ```bash
  ffmpeg -version
  ```

### Extension shows no resolutions / keeps loading

- Refresh the video page and open the popup again.
- Some sites (especially Facebook) take a few seconds to load format info.
- Update yt-dlp to the latest version:
  ```bash
  brew upgrade yt-dlp        # macOS
  yt-dlp -U                  # other platforms
  ```

### Native host not found (macOS)

- Confirm the manifest was created:
  ```bash
  ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
  ```
- You should see `com.videodownloader.yt_dlp.json`.
- Re-run `node setup_native_host.js` if it is missing.

---

## For Developers

### Tech stack

- **Extension:** Manifest V3, TypeScript
- **Popup UI:** React 19, Tailwind CSS 4, Vite 8
- **Download engine:** yt-dlp via Chrome Native Messaging
- **Fallback:** Local HTTP server on port 9000 (`local-server.js`)

### Project structure

```
src/
  App.tsx              # Popup UI
  background/index.ts  # Service worker (download orchestration)
  content/index.ts     # Page video detection
  types/extension.ts   # Shared types
  utils/media.ts       # URL normalization & cache helpers
native-host.js         # Native messaging host (spawns yt-dlp)
local-server.js        # Optional HTTP fallback server
setup_native_host.js   # Registers native host with Chrome
public/manifest.json   # Extension manifest
```

### Development

```bash
pnpm install
pnpm dev       # Vite dev server (popup UI only)
pnpm build     # Build extension to dist/
pnpm lint      # Run ESLint
```

After building, reload the extension at `chrome://extensions`.

### Optional: run the local fallback server

If native messaging is unavailable, the extension can fall back to a local server:

```bash
node local-server.js
```

This starts a server on `http://127.0.0.1:9000`.

---

## Legal Notice

Only download content you have the **right to download**. Respect copyright laws and each platform's Terms of Service. This tool is for personal, lawful use — such as saving your own content or media that is freely available for download.

---

## Author

Developed by **LOS** — [Portfolio](https://arefolio.vercel.app/) · [GitHub](https://github.com/arefur-rahman)

[![BuyMeACha](https://img.shields.io/badge/☕-BuyMeACha-orange)](https://chabondhu.com/aref)

---

## License

This project is open source. See the repository for license details.
