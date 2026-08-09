# Universal Video & Audio Downloader (Chrome Extension)

A powerful, privacy-first Chrome Extension (Manifest V3) that detects and downloads videos and audio from YouTube, TikTok, Facebook, Instagram, Twitter/X, Vimeo, Reddit, SoundCloud, and thousands of other sites using your local `yt-dlp` installation via Chrome Native Messaging.

---

## 🌟 Key Features

- **100% Local & Private**: No third-party servers, subscription paywalls, or API rate limits. All video processing and downloading happen on your own computer.
- **Chrome Native Messaging Integration**: Instant on-demand execution with real-time download progress (0%–100%) and instant process cancellation.
- **Dynamic Quality Detection**: Automatically fetches available video resolutions (4K/2160p, 1080p, 720p, 480p, 360p).
- **Audio Extraction Mode**: Convert and extract audio in formats like **MP3**, **M4A**, **WAV**, **FLAC**, **OPUS**, or **AAC** with customizable bitrates (128kbps – 320kbps).
- **Mute Video Option**: Download video tracks without audio streams.
- **Auto Video Playback Detection**: Injected content script detects video playback on active tabs and displays status badges (`PLAY` / `READY`) directly on the extension icon.
- **Dual Engine Execution**: Primary Chrome Native Messaging engine with an optional standalone Express HTTP server fallback (`http://127.0.0.1:9000`).

---

## 🛠️ Prerequisites & Installing Dependencies

Before installing the extension, ensure you have **Node.js**, **yt-dlp**, and **ffmpeg** installed on your operating system.

### 🍎 macOS
#### 1. Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Install Node.js, yt-dlp, and ffmpeg
```bash
brew install node yt-dlp ffmpeg
```

### 🐧 Linux (Ubuntu / Debian / Fedora / Arch)

#### Ubuntu / Debian:
##### 1. Install Node.js & ffmpeg
```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg curl
```

##### 2. Install yt-dlp (Recommended latest binary build)
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### Fedora:
```bash
sudo dnf install nodejs ffmpeg yt-dlp
```

#### Arch Linux:
```bash
sudo pacman -S nodejs npm ffmpeg yt-dlp
```

### 🪟 Windows

#### Option A: Using `winget` (Windows Package Manager - Built into Windows 10/11)
Open PowerShell or Command Prompt as Administrator and run:
```powershell
winget install OpenJS.NodeJS
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

#### Option B: Using `Chocolatey`
```powershell
choco install nodejs-lts yt-dlp ffmpeg
```

#### Option C: Manual Installation
1. **Node.js**: Download & run the installer from [nodejs.org](https://nodejs.org/).
2. **yt-dlp**: Download `yt-dlp.exe` from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and place it in a folder in your System `PATH` (e.g. `C:\Windows`).
3. **ffmpeg**: Download Windows build from [ffmpeg.org](https://ffmpeg.org/download.html) and add `ffmpeg.exe` to your System `PATH`.

---

## 🚀 Installation & Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/arefur-rahman/youtube-downloader-chrome-extension.git
```
Or, download the zip file from [here](https://github.com/arefur-rahman/youtube-downloader-chrome-extension/releases) and unzip it.

```bash
cd youtube-downloader-chrome-extension
```

### Step 2: Set File Permissions (macOS / Linux)
On macOS or Linux, grant execution permissions to the native host launcher:
```bash
chmod +x run-native-host.sh
```
*(Windows users may skip this step).*

### Step 3: Register the Native Messaging Host
Run the cross-platform registration script to automatically register the Native Host for macOS, Linux, or Windows:
```bash
node setup_native_host.js
```
- **macOS**: Registers host at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.videodownloader.yt_dlp.json`
- **Linux**: Registers host at `~/.config/google-chrome/NativeMessagingHosts/com.videodownloader.yt_dlp.json`
- **Windows**: Adds Registry key at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.videodownloader.yt_dlp` pointing to `run-native-host.bat`.

### Step 4: Load Extension into Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the project folder (`yt-downloader-browser-ext`).

> **Note**: If your Chrome Extension ID differs from `mmomedlkkgpfdmfhdpigjamlbdmpcdon`, update the `EXTENSION_ID` variable in `setup_native_host.js` and re-run `node setup_native_host.js`.

---

## 🇧🇩 সেটআপ এবং ইনস্টলেশন নির্দেশিকা (Bangla Installation & Setup Guide)

### 📋 পূর্বশর্ত ও ডিপেন্ডেন্সি ইনস্টলেশন (Installing Dependencies)

এক্সটেনশনটি চালানোর জন্য আপনার কম্পিউটারে **Node.js**, **yt-dlp**, এবং **ffmpeg** ইনস্টল থাকতে হবে।

#### 🍎 ম্যাকওএস (macOS)
```bash
brew install node yt-dlp ffmpeg
```

#### 🐧 লিনাক্স (Linux - Ubuntu / Debian)
##### 1. Node.js ও ffmpeg ইনস্টল করুন
```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg curl
```

##### 2. yt-dlp ইনস্টল করুন
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### 🪟 উইন্ডোজ (Windows)
PowerShell বা Command Prompt এডমিন মোডে রান করে কমান্ড দিন:
```powershell
winget install OpenJS.NodeJS
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```
*(অথবা Chocolatey ব্যবহার করলে:)*
```powershell
choco install nodejs-lts yt-dlp ffmpeg
```

---

### 🚀 ইনস্টলেশন ও সেটআপ ধাপসমূহ (Setup Steps)

#### ধাপ ১: রিপোজিটরি ক্লোন করুন
```bash
git clone https://github.com/arefur-rahman/youtube-downloader-chrome-extension.git
```

অথবা, [এখানে](https://github.com/arefur-rahman/youtube-downloader-chrome-extension/releases) থেকে zip ফাইল ডাউনলোড করে আনজিপ করুন।

```bash
cd youtube-downloader-chrome-extension
```

#### ধাপ ২: পারমিশন সেট করুন (macOS / Linux)
```bash
chmod +x run-native-host.sh
```
*(উইন্ডোজ ইউজাররা এটা স্কিপ করতে পারেন।)*

#### ধাপ ৩: নেটিভ মেসেজিং হোস্ট রেজিস্টার করুন
অপারেটিং সিস্টেম অনুযায়ী (macOS, Linux বা Windows) নেটিভ হোস্ট অটোমেটিক রেজিস্টার করতে কমান্ড দিন:
```bash
node setup_native_host.js
```

#### ধাপ ৪: ক্রোমে এক্সটেনশন লোড করুন
১. গুগল ক্রোমে গিয়ে অ্যাড্রেসবারে লিখুন: `chrome://extensions`  
২. ডানপাশের ওপরের কোণ থেকে **Developer mode** অন করুন।  
৩. **Load unpacked** বাটনে ক্লিক করে এই প্রজেক্ট ফোল্ডারটি অর্থাত `yt-downloader-browser-ext` সিলেক্ট করুন।

---

### 💡 কীভাবে ব্যবহার করবেন (How to Use)

১. **ভিডিও পেজ ওপেন করুন**: YouTube, TikTok, Facebook, Instagram বা অন্য কোনো সাপোর্টেড সাইটে ভিডিও প্লে করুন।  
২. **কোয়ালিটি বেছে নিন**: পপআপ ওপেন করে ভিডিও রেজোলেশন (4K, 1080p, 720p ইত্যাদি) সিলেক্ট করুন।  
৩. **অডিও ডাউনলোড করতে**: `Audio` ট্যাবে গিয়ে অডিও ফরম্যাট (MP3, M4A, WAV ইত্যাদি) এবং বিটরেট বেছে নিন।  
৪. **ডাউনলোড শুরু করুন**: **Download** বাটনে ক্লিক করুন। ফাইলটি সরাসরি আপনার `Downloads` ফোল্ডারে সেভ হবে।

---

## 📁 Project Architecture

```
yt-downloader-browser-ext/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── content.js            # Injected script detecting media elements and playback state
├── background.js         # Service worker handling native messaging, state management & badges
├── popup.html            # Extension popup user interface markup
├── popup.js              # Extension popup controller (quality select, progress, cancel)
├── styles.css            # Dark mode styling & responsive components
├── native-host.js        # Node.js Native Host communicating with yt-dlp via stdio
├── run-native-host.sh    # macOS / Linux launcher script for Chrome Native Host
├── run-native-host.bat   # Windows batch launcher script for Chrome Native Host
├── setup_native_host.js  # Cross-platform registration script (macOS / Linux / Windows)
├── local-server.js       # Fallback local HTTP Express/HTTP server (Port 9000)
└── icons/                # Extension icon set (16x16, 48x48, 128x128)
```

---

## 🔄 How It Works

```
┌─────────────────┐      Chrome Messages     ┌─────────────────────┐
│  Content Script │ ───────────────────────> │  Background Worker  │
└─────────────────┘                          └──────────┬──────────┘
                                                        │ Chrome Native
                                                        │ Messaging (stdio)
                                                        ▼
                                             ┌─────────────────────┐
                                             │   native-host.js    │
                                             └──────────┬──────────┘
                                                        │ child_process.spawn
                                                        ▼
                                             ┌─────────────────────┐
                                             │       yt-dlp        │
                                             └──────────┬──────────┘
                                                        │
                                                        ▼
                                             Saved to ~/Downloads
```

---

## ⚡ Fallback Local Server (Optional)

If Native Messaging is restricted or unavailable on your setup, you can run the built-in HTTP server:

```bash
node local-server.js
```
The background service worker automatically falls back to `http://127.0.0.1:9000/` if Native Messaging fails.

---

## ❓ FAQ & Troubleshooting

- **Extension says "Engine Offline"**:
  - Run `node setup_native_host.js` and restart Google Chrome.
  - Verify that `yt-dlp` is installed and accessible in your system `$PATH` (`yt-dlp --version`).
- **4K / High quality downloads missing audio**:
  - Make sure `ffmpeg` is installed so `yt-dlp` can merge separate video and audio streams into an MP4 container.
- **Where are downloads saved?**:
  - Standard downloads are placed directly into your system `Downloads` folder.

---

## 📄 License

[MIT License](LICENSE)
