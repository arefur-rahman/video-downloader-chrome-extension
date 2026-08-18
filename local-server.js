// Local Downloader Server using installed yt-dlp
// Runs 100% locally on your Mac without remote third-party API dependencies.

import { execFile } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { URL, fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 9000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
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

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

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

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const reqUrl = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`,
    );

    if (req.method === "GET" && reqUrl.pathname.startsWith("/downloads/")) {
        const filename = path.basename(reqUrl.pathname);
        const filePath = path.join(DOWNLOADS_DIR, filename);

        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({ status: "error", text: "File not found." }),
            );
            return;
        }

        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": stat.size,
        });

        fs.createReadStream(filePath).pipe(res);
        return;
    }

    if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk.toString()));
        req.on("end", () => {
            let payload = {};
            try {
                payload = JSON.parse(body);
            } catch (e) {}

            let targetUrl = payload.url;

            if (!targetUrl || typeof targetUrl !== "string") {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        status: "error",
                        text: "Missing target URL.",
                    }),
                );
                return;
            }

            const isFacebook =
                targetUrl.includes("facebook.com") ||
                targetUrl.includes("fb.watch") ||
                targetUrl.includes("fbcdn.net");

            const downloadMode = payload.downloadMode || "auto";
            const height = payload.videoQuality || "1080";
            const audioFormat = payload.audioFormat || "mp3";
            const audioBitrate = payload.audioBitrate || "128";
            const resLabel =
                downloadMode === "audio" ? `${audioBitrate}kbps` : `${height}p`;

            const fileId = Date.now().toString(36);
            const outTemplate = path.join(
                DOWNLOADS_DIR,
                `${fileId}_%(title)s_${resLabel}.%(ext)s`,
            );

            let args = [...YTDLP_RELIABILITY_ARGS];
            if (isFacebook) {
                args.push(
                    "--user-agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

            execFile(
                YTDLP_BIN,
                args,
                { maxBuffer: 50 * 1024 * 1024 },
                (err, _stdout, stderr) => {
                    if (err) {
                        console.error("[yt-dlp error]", stderr || err.message);
                        res.writeHead(500, {
                            "Content-Type": "application/json",
                        });
                        res.end(
                            JSON.stringify({
                                status: "error",
                                text: "yt-dlp execution failed.",
                            }),
                        );
                        return;
                    }

                    const files = fs
                        .readdirSync(DOWNLOADS_DIR)
                        .filter((f) => f.startsWith(fileId));
                    if (files.length === 0) {
                        res.writeHead(500, {
                            "Content-Type": "application/json",
                        });
                        res.end(
                            JSON.stringify({
                                status: "error",
                                text: "Downloaded file not found.",
                            }),
                        );
                        return;
                    }

                    const rawFile = files[0];
                    const ext = path.extname(rawFile) || ".mp4";

                    let extractedTitle = rawFile.slice(fileId.length + 1);
                    const suffix = `_${resLabel}${ext}`;
                    if (extractedTitle.endsWith(suffix)) {
                        extractedTitle = extractedTitle.slice(
                            0,
                            -suffix.length,
                        );
                    } else if (extractedTitle.endsWith(ext)) {
                        extractedTitle = extractedTitle.slice(0, -ext.length);
                    }

                    let finalName;
                    if (!isGenericTitle(extractedTitle)) {
                        const cleanTitle = sanitizeFilename(extractedTitle);
                        finalName = `${cleanTitle}_${resLabel}${ext}`;
                    } else {
                        const timestamp = getFormattedTimestamp();
                        finalName = `${timestamp}_${resLabel}${ext}`;
                    }

                    const rawPath = path.join(DOWNLOADS_DIR, rawFile);
                    const finalPath = path.join(DOWNLOADS_DIR, finalName);

                    try {
                        fs.renameSync(rawPath, finalPath);
                    } catch (e) {}

                    const downloadServeUrl = `http://127.0.0.1:${PORT}/downloads/${encodeURIComponent(finalName)}`;
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(
                        JSON.stringify({
                            status: "tunnel",
                            filename: finalName,
                            url: downloadServeUrl,
                        }),
                    );
                },
            );
        });
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`[Local Server] Running at http://127.0.0.1:${PORT}/`);
});
