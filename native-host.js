#!/usr/bin/env node

// Native Messaging Host for Universal Video Downloader
// Real-time progress reporting & cancellation support via Chrome Native Messaging

import { execFile, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
const YTDLP_BIN = fs.existsSync("/opt/homebrew/bin/yt-dlp")
    ? "/opt/homebrew/bin/yt-dlp"
    : "yt-dlp";

const YTDLP_RELIABILITY_ARGS = [
    "--retries",
    "10",
    "--fragment-retries",
    "15",
    "--extractor-retries",
    "3",
    "--retry-sleep",
    "linear=1::2",
    "--socket-timeout",
    "30",
    "--no-abort-on-error",
];

const FACEBOOK_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let activeChildProcess = null;
let activeFileId = null;

function getFormattedTimestamp(d = new Date()) {
    const months = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
    ];
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const secs = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");

    return `${day}${month}${year}_${hours}_${mins}_${secs}_${ms}`;
}

function isGenericTitle(title) {
    if (!title || typeof title !== "string") return true;
    const clean = title.trim().toLowerCase();
    return (
        !clean ||
        clean === "na" ||
        clean === "n_a" ||
        clean === "none" ||
        clean === "null" ||
        clean === "undefined" ||
        clean === "detected media" ||
        clean === "facebook" ||
        clean === "facebook video" ||
        clean === "facebook reel" ||
        clean === "video" ||
        clean === "untitled" ||
        clean.startsWith("facebook_video_")
    );
}

function sanitizeFilename(name) {
    return name
        .replace(/[\/\\?%*:|"<>]/g, "_")
        .trim()
        .slice(0, 120);
}

function sendNativeMessage(msgObj) {
    try {
        let msgBuf = Buffer.from(JSON.stringify(msgObj), "utf8");
        let lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32LE(msgBuf.length, 0);
        process.stdout.write(lenBuf);
        process.stdout.write(msgBuf);
    } catch (e) {
        console.error("Error sending native message:", e);
    }
}

function isDirectVideoUrl(url) {
    return (
        url &&
        typeof url === "string" &&
        url.startsWith("http") &&
        !/\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(url) &&
        !url.includes("dst-jpg") &&
        !url.includes("dst-png")
    );
}

function isRetryableYtdlpError(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
        lower.includes("bytes read") ||
        lower.includes("giving up after") ||
        lower.includes("unable to download") ||
        lower.includes("http error 403") ||
        lower.includes("http error 416") ||
        lower.includes("connection reset") ||
        lower.includes("timed out") ||
        lower.includes("network is unreachable") ||
        lower.includes("ssl:") ||
        lower.includes("urlopen error")
    );
}

function buildDownloadArgs({
    targetUrl,
    downloadMode,
    height,
    audioFormat,
    audioBitrate,
    resLabel,
    fileId,
    isFacebook,
}) {
    const outTemplate = path.join(
        DOWNLOADS_DIR,
        `${fileId}_%(title)s_${resLabel}.%(ext)s`,
    );

    const args = ["--newline", ...YTDLP_RELIABILITY_ARGS];

    if (isFacebook) {
        args.push(
            "--user-agent",
            FACEBOOK_UA,
            "--referer",
            "https://www.facebook.com/",
        );
    }

    if (downloadMode === "audio") {
        args.push(
            "-f",
            "bestaudio/best",
            "-x",
            "--audio-format",
            audioFormat,
            "--audio-quality",
            `${audioBitrate}K`,
            "-o",
            outTemplate,
            "--no-playlist",
            targetUrl,
        );
    } else if (downloadMode === "mute") {
        args.push(
            "-f",
            `bestvideo[height<=${height}]/best[height<=${height}]/b`,
            "-o",
            outTemplate,
            "--no-playlist",
            targetUrl,
        );
    } else {
        args.push(
            "-f",
            `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best/b`,
            "--merge-output-format",
            "mp4",
            "-o",
            outTemplate,
            "--no-playlist",
            targetUrl,
        );
    }

    return args;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function runYtdlpDownload(args, fileId, resLabel, onProgress) {
    return new Promise((resolve, reject) => {
        const child = spawn(YTDLP_BIN, args);
        activeChildProcess = child;

        let lastPercent = 0;
        let stderrText = "";

        child.stdout.on("data", (chunk) => {
            const text = chunk.toString("utf8");
            const lines = text.split(/\r?\n/);

            lines.forEach((line) => {
                const pctMatch = line.match(/\[download\]\s+([\d\.]+)%/);
                if (pctMatch) {
                    const percent = Math.min(
                        99,
                        Math.floor(parseFloat(pctMatch[1])),
                    );
                    if (percent !== lastPercent) {
                        lastPercent = percent;
                        onProgress(percent);
                    }
                } else if (line.includes("[Merger]")) {
                    onProgress(98, "Merging video & audio streams...");
                }
            });
        });

        child.stderr.on("data", (chunk) => {
            stderrText += chunk.toString("utf8");
        });

        child.on("close", (code) => {
            activeChildProcess = null;
            if (code !== 0) {
                const lastErrLine = stderrText
                    .trim()
                    .split(/\r?\n/)
                    .filter((l) => l.includes("ERROR:") || l.trim())
                    .pop();
                const errDetail =
                    lastErrLine || `yt-dlp process exited with code ${code}`;
                const err = new Error(errDetail);
                err.retryable = isRetryableYtdlpError(errDetail);
                reject(err);
                return;
            }

            const files = fs
                .readdirSync(DOWNLOADS_DIR)
                .filter((f) => f.startsWith(fileId));
            if (files.length === 0) {
                reject(new Error("Downloaded file not found on disk."));
                return;
            }

            resolve({ rawFile: files[0], resLabel });
        });
    });
}

function finalizeDownload(rawFile, fileId, resLabel) {
    const ext = path.extname(rawFile) || ".mp4";

    let extractedTitle = rawFile.slice(fileId.length + 1);
    const suffix = `_${resLabel}${ext}`;
    if (extractedTitle.endsWith(suffix)) {
        extractedTitle = extractedTitle.slice(0, -suffix.length);
    } else if (extractedTitle.endsWith(ext)) {
        extractedTitle = extractedTitle.slice(0, -ext.length);
    }

    let finalName;
    if (!isGenericTitle(extractedTitle)) {
        const cleanTitle = sanitizeFilename(extractedTitle);
        finalName = `${cleanTitle}_${resLabel}${ext}`;
    } else {
        finalName = `${getFormattedTimestamp()}_${resLabel}${ext}`;
    }

    const rawPath = path.join(DOWNLOADS_DIR, rawFile);
    const finalPath = path.join(DOWNLOADS_DIR, finalName);

    try {
        fs.renameSync(rawPath, finalPath);
    } catch (e) {}

    return { finalName, finalPath };
}

function cleanupTempFiles(fileId) {
    if (!fileId) return;
    try {
        const files = fs
            .readdirSync(DOWNLOADS_DIR)
            .filter((f) => f.startsWith(fileId));
        files.forEach((f) => {
            try {
                fs.unlinkSync(path.join(DOWNLOADS_DIR, f));
            } catch (e) {}
        });
    } catch (e) {}
}

function listenNativeMessages(onMessage) {
    let buffer = Buffer.alloc(0);

    process.stdin.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 4) {
            let msgLen = buffer.readUInt32LE(0);
            if (buffer.length >= 4 + msgLen) {
                let msgBuf = buffer.slice(4, 4 + msgLen);
                buffer = buffer.slice(4 + msgLen);

                try {
                    let json = JSON.parse(msgBuf.toString("utf8"));
                    onMessage(json);
                } catch (e) {
                    console.error("Failed to parse native JSON message:", e);
                }
            } else {
                break;
            }
        }
    });
}

listenNativeMessages((payload) => {
    // Handle Cancellation
    if (payload.action === "cancel") {
        if (activeChildProcess) {
            try {
                activeChildProcess.kill("SIGTERM");
                activeChildProcess.kill("SIGKILL");
            } catch (e) {}
            activeChildProcess = null;
        }
        cleanupTempFiles(activeFileId);
        sendNativeMessage({
            status: "cancelled",
            text: "Download cancelled by user.",
        });
        setTimeout(() => process.exit(0), 100);
        return;
    }

    // Handle Fetch Info
    if (payload.action === "info") {
        const targetUrl = payload.url;
        execFile(
            YTDLP_BIN,
            ["-J", "--no-playlist", "--no-warnings", "--quiet", targetUrl],
            { maxBuffer: 10 * 1024 * 1024, timeout: 45000 },
            (err, stdout, _stderr) => {
                if (err || !stdout) {
                    sendNativeMessage({
                        status: "error",
                        text: "Failed to fetch media formats",
                    });
                    return;
                }

                try {
                    const json = JSON.parse(stdout);
                    const heights = [
                        ...new Set(
                            (json.formats || [])
                                .filter(
                                    (f) =>
                                        f.height &&
                                        (f.vcodec !== "none" || !f.vcodec),
                                )
                                .map((f) => f.height),
                        ),
                    ].sort((a, b) => b - a);

                    sendNativeMessage({
                        status: "success",
                        info: {
                            title: json.title || null,
                            thumbnail: json.thumbnail || null,
                            heights,
                        },
                    });
                } catch (pErr) {
                    sendNativeMessage({
                        status: "error",
                        text: "Failed to parse media metadata",
                    });
                }
            },
        );
        return;
    }

    // Handle Download Execution
    if (payload.action !== "download") {
        sendNativeMessage({
            status: "error",
            text: `Unknown action: ${payload.action || "none"}`,
        });
        return;
    }

    void handleDownloadRequest(payload);
});

async function handleDownloadRequest(payload) {
    const pageUrl = payload.url;
    const directUrl = payload.directUrl;

    if (!pageUrl || typeof pageUrl !== "string") {
        sendNativeMessage({ status: "error", text: "Missing target URL" });
        return;
    }

    const isFacebook =
        pageUrl.includes("facebook.com") ||
        pageUrl.includes("fb.watch") ||
        pageUrl.includes("fbcdn.net");

    const downloadMode = payload.downloadMode || "auto";
    const height = payload.videoQuality || "1080";
    const audioFormat = payload.audioFormat || "mp3";
    const audioBitrate = payload.audioBitrate || "128";
    const resLabel =
        downloadMode === "audio" ? `${audioBitrate}kbps` : `${height}p`;

    const fileId = Date.now().toString(36);
    activeFileId = fileId;

    const downloadTargets = [pageUrl];
    if (
        isFacebook &&
        isDirectVideoUrl(directUrl) &&
        directUrl !== pageUrl
    ) {
        downloadTargets.push(directUrl);
    }

    const onProgress = (percent, text) => {
        sendNativeMessage({
            status: "progress",
            percent,
            text: text || `Downloading... ${percent}%`,
        });
    };

    let lastError = null;

    for (let i = 0; i < downloadTargets.length; i++) {
        const targetUrl = downloadTargets[i];
        const maxAttempts = i === 0 ? 2 : 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) {
                cleanupTempFiles(fileId);
                await sleep(1500);
                onProgress(0, "Retrying download...");
            }

            const args = buildDownloadArgs({
                targetUrl,
                downloadMode,
                height,
                audioFormat,
                audioBitrate,
                resLabel,
                fileId,
                isFacebook,
            });

            try {
                const { rawFile } = await runYtdlpDownload(
                    args,
                    fileId,
                    resLabel,
                    onProgress,
                );
                const { finalName, finalPath } = finalizeDownload(
                    rawFile,
                    fileId,
                    resLabel,
                );

                sendNativeMessage({
                    status: "success",
                    filename: finalName,
                    filepath: finalPath,
                });
                setTimeout(() => process.exit(0), 100);
                return;
            } catch (err) {
                lastError = err;
                cleanupTempFiles(fileId);

                const canRetrySameTarget =
                    attempt < maxAttempts && err.retryable !== false;
                if (canRetrySameTarget) continue;

                const hasNextTarget = i < downloadTargets.length - 1;
                if (hasNextTarget && err.retryable !== false) break;
            }
        }
    }

    sendNativeMessage({
        status: "error",
        text:
            lastError?.message ||
            "Download failed after multiple attempts.",
    });
    setTimeout(() => process.exit(0), 100);
}
