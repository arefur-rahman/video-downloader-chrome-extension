#!/usr/bin/env node

// Native Messaging Host for Universal Video Downloader
// Real-time progress reporting & cancellation support via Chrome Native Messaging

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const os = require('os');

const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');
const YTDLP_BIN = fs.existsSync('/opt/homebrew/bin/yt-dlp') 
    ? '/opt/homebrew/bin/yt-dlp' 
    : 'yt-dlp';

let activeChildProcess = null;
let activeFileId = null;

function getFormattedTimestamp(d = new Date()) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    
    return `${day}${month}${year}_${hours}_${mins}_${secs}_${ms}`;
}

function isGenericTitle(title) {
    if (!title || typeof title !== 'string') return true;
    const clean = title.trim().toLowerCase();
    return (
        !clean ||
        clean === 'na' ||
        clean === 'n_a' ||
        clean === 'none' ||
        clean === 'null' ||
        clean === 'undefined' ||
        clean === 'detected media' ||
        clean === 'facebook' ||
        clean === 'facebook video' ||
        clean === 'facebook reel' ||
        clean === 'video' ||
        clean === 'untitled' ||
        clean.startsWith('facebook_video_')
    );
}

function sanitizeFilename(name) {
    return name.replace(/[\/\\?%*:|"<>]/g, '_').trim().slice(0, 120);
}

function sendNativeMessage(msgObj) {
    try {
        let msgBuf = Buffer.from(JSON.stringify(msgObj), 'utf8');
        let lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32LE(msgBuf.length, 0);
        process.stdout.write(lenBuf);
        process.stdout.write(msgBuf);
    } catch (e) {
        console.error("Error sending native message:", e);
    }
}

function cleanupTempFiles(fileId) {
    if (!fileId) return;
    try {
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(fileId));
        files.forEach(f => {
            try { fs.unlinkSync(path.join(DOWNLOADS_DIR, f)); } catch (e) {}
        });
    } catch (e) {}
}

function listenNativeMessages(onMessage) {
    let buffer = Buffer.alloc(0);

    process.stdin.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 4) {
            let msgLen = buffer.readUInt32LE(0);
            if (buffer.length >= 4 + msgLen) {
                let msgBuf = buffer.slice(4, 4 + msgLen);
                buffer = buffer.slice(4 + msgLen);

                try {
                    let json = JSON.parse(msgBuf.toString('utf8'));
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
    if (payload.action === 'cancel') {
        if (activeChildProcess) {
            try {
                activeChildProcess.kill('SIGTERM');
                activeChildProcess.kill('SIGKILL');
            } catch (e) {}
            activeChildProcess = null;
        }
        cleanupTempFiles(activeFileId);
        sendNativeMessage({ status: 'cancelled', text: 'Download cancelled by user.' });
        setTimeout(() => process.exit(0), 100);
        return;
    }

    // Handle Fetch Info
    if (payload.action === 'info') {
        const targetUrl = payload.url;
        execFile(YTDLP_BIN, ['-J', '--no-playlist', targetUrl], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err || !stdout) {
                sendNativeMessage({ status: 'error', text: 'Failed to fetch media formats' });
                return;
            }

            try {
                const json = JSON.parse(stdout);
                const heights = [...new Set(
                    (json.formats || [])
                        .filter(f => f.height && (f.vcodec !== 'none' || !f.vcodec))
                        .map(f => f.height)
                )].sort((a, b) => b - a);

                sendNativeMessage({
                    status: 'success',
                    info: {
                        title: json.title || null,
                        thumbnail: json.thumbnail || null,
                        heights: heights.length > 0 ? heights : [1080, 720, 480, 360]
                    }
                });
            } catch (pErr) {
                sendNativeMessage({ status: 'error', text: 'Failed to parse media metadata' });
            }
        });
        return;
    }

    // Handle Download Execution
    let targetUrl = payload.url;
    const directUrl = payload.directUrl;
    
    if (!targetUrl || typeof targetUrl !== 'string') {
        sendNativeMessage({ status: 'error', text: 'Missing target URL' });
        return;
    }

    const isFacebook = targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fbcdn.net');
    
    // If Facebook page URL is passed and we have a direct video stream URL from DOM, use directUrl (ignoring images)
    const isDirectVideo = directUrl && 
        typeof directUrl === 'string' && 
        directUrl.startsWith('http') && 
        !/\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(directUrl) && 
        !directUrl.includes('dst-jpg');

    if (isFacebook && isDirectVideo) {
        targetUrl = directUrl;
    }

    const downloadMode = payload.downloadMode || 'auto';
    const height = payload.videoQuality || '1080';
    const audioFormat = payload.audioFormat || 'mp3';
    const resLabel = downloadMode === 'audio' ? audioFormat.toUpperCase() : `${height}p`;

    const fileId = Date.now().toString(36);
    activeFileId = fileId;

    const outTemplate = path.join(DOWNLOADS_DIR, `${fileId}_%(title)s_${resLabel}.%(ext)s`);

    let args = ['--newline'];

    if (isFacebook) {
        args.push(
            '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            '--referer', 'https://www.facebook.com/'
        );
    }

    if (downloadMode === 'audio') {
        args.push('-x', '--audio-format', audioFormat, '-o', outTemplate, '--no-playlist', targetUrl);
    } else if (downloadMode === 'mute') {
        args.push('-f', `bestvideo[height<=${height}]/best[height<=${height}]/b`, '-o', outTemplate, '--no-playlist', targetUrl);
    } else {
        args.push('-f', `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best/b`, '--merge-output-format', 'mp4', '-o', outTemplate, '--no-playlist', targetUrl);
    }

    const child = spawn(YTDLP_BIN, args);
    activeChildProcess = child;

    let lastPercent = 0;

    child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        const lines = text.split(/\r?\n/);

        lines.forEach((line) => {
            // Match progress percent e.g. "[download]  69.3% of ..."
            const pctMatch = line.match(/\[download\]\s+([\d\.]+)%/);
            if (pctMatch) {
                const percent = Math.min(99, Math.floor(parseFloat(pctMatch[1])));
                if (percent !== lastPercent) {
                    lastPercent = percent;
                    sendNativeMessage({
                        status: 'progress',
                        percent: percent,
                        text: `Downloading... ${percent}%`
                    });
                }
            } else if (line.includes('[Merger]')) {
                sendNativeMessage({
                    status: 'progress',
                    percent: 98,
                    text: 'Merging video & audio streams...'
                });
            }
        });
    });

    let stderrText = '';

    child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderrText += text;
        console.error('[yt-dlp stderr]', text);
    });

    child.on('close', (code) => {
        activeChildProcess = null;
        if (code !== 0) {
            const lastErrLine = stderrText.trim().split(/\r?\n/).filter(l => l.includes('ERROR:') || l.trim()).pop();
            const errDetail = lastErrLine || `yt-dlp process exited with code ${code}`;
            sendNativeMessage({ status: 'error', text: errDetail });
            return;
        }

        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(fileId));
        if (files.length === 0) {
            sendNativeMessage({ status: 'error', text: 'Downloaded file not found on disk.' });
            return;
        }

        const rawFile = files[0];
        const ext = path.extname(rawFile) || '.mp4';

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
            const timestamp = getFormattedTimestamp();
            finalName = `${timestamp}_${resLabel}${ext}`;
        }

        const rawPath = path.join(DOWNLOADS_DIR, rawFile);
        const finalPath = path.join(DOWNLOADS_DIR, finalName);

        try {
            fs.renameSync(rawPath, finalPath);
        } catch (e) {}

        sendNativeMessage({
            status: 'success',
            filename: finalName,
            filepath: finalPath
        });

        setTimeout(() => process.exit(0), 100);
    });
});
