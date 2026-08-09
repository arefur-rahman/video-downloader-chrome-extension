// Local Downloader Server using installed yt-dlp
// Runs 100% locally on your Mac without remote third-party API dependencies.

const http = require('http');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const PORT = 9000;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const YTDLP_BIN = fs.existsSync('/opt/homebrew/bin/yt-dlp') 
    ? '/opt/homebrew/bin/yt-dlp' 
    : 'yt-dlp';

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

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

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

    // Serve downloaded files
    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/files/')) {
        const fileName = decodeURIComponent(parsedUrl.pathname.replace('/files/', ''));
        const filePath = path.join(DOWNLOADS_DIR, fileName);

        if (!filePath.startsWith(DOWNLOADS_DIR) || !fs.existsSync(filePath)) {
            return sendJSON(res, 404, { status: 'error', text: 'File not found.' });
        }

        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`
        });
        return fs.createReadStream(filePath).pipe(res);
    }

    // Health check endpoint
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
        return sendJSON(res, 200, { status: 'online', engine: 'yt-dlp-local' });
    }

    // Process Download Request
    if (req.method === 'POST' && (parsedUrl.pathname === '/' || parsedUrl.pathname === '/api')) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                let targetUrl = payload.url;
                const directUrl = payload.directUrl;

                if (!targetUrl || typeof targetUrl !== 'string') {
                    return sendJSON(res, 400, { status: 'error', text: 'Missing or invalid URL' });
                }

                const isFacebook = targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fbcdn.net');
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

                console.log(`[Local Server] Processing: ${targetUrl} (Mode: ${downloadMode}, Resolution: ${resLabel})`);

                const fileId = Date.now().toString(36);
                const outTemplate = path.join(DOWNLOADS_DIR, `${fileId}_%(title)s ${resLabel}.%(ext)s`);

                let args = [];
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

                execFile(YTDLP_BIN, args, (err, stdout, stderr) => {
                    if (err) {
                        console.error('[Local Server] yt-dlp error:', stderr || err.message);
                        return sendJSON(res, 500, {
                            status: 'error',
                            text: 'Failed to process media with local yt-dlp: ' + (stderr.split('\n')[0] || err.message)
                        });
                    }

                    // Find generated output file
                    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(fileId));
                    if (files.length === 0) {
                        return sendJSON(res, 500, { status: 'error', text: 'Downloaded file not found on disk.' });
                    }

                    const rawFile = files[0];
                    const ext = path.extname(rawFile) || '.mp4';
                    const timestampName = `${getFormattedTimestamp()}${ext}`;
                    const rawPath = path.join(DOWNLOADS_DIR, rawFile);
                    const finalPath = path.join(DOWNLOADS_DIR, timestampName);

                    try {
                        fs.renameSync(rawPath, finalPath);
                    } catch (e) {}

                    console.log(`[Local Server] Done! Serving file: ${timestampName}`);

                    return sendJSON(res, 200, {
                        status: 'success',
                        filename: timestampName,
                        downloadUrl: `http://localhost:${PORT}/files/${encodeURIComponent(timestampName)}`
                    });
                });

            } catch (pErr) {
                return sendJSON(res, 400, { status: 'error', text: 'Invalid JSON payload' });
            }
        });
        return;
    }

    sendJSON(res, 404, { status: 'error', text: 'Endpoint not found' });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`====================================================`);
    console.log(`🚀 Local Downloader Server running at http://127.0.0.1:${PORT}/`);
    console.log(`====================================================`);
});
