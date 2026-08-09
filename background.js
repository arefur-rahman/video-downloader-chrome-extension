// Universal Video Downloader - Background Service Worker (On-Demand Native Host Engine)

const NATIVE_HOST_NAME = "com.videodownloader.yt_dlp";
const FALLBACK_LOCAL_SERVER_URL = "http://127.0.0.1:9000/";

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

let activeNativePort = null;

// Listen for messages from Content Script and Popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "MEDIA_STATE_UPDATED") {
        handleMediaStateUpdate(sender.tab?.id, request.data);
        return false;
    }

    if (request.action === "GET_DOWNLOAD_STATUS") {
        (async () => {
            const { activeDownload } = await chrome.storage.session.get("activeDownload");
            sendResponse({ success: true, data: activeDownload || null });
        })();
        return true;
    }

    if (request.action === "FETCH_MEDIA_INFO") {
        (async () => {
            try {
                const res = await sendSingleNativeMessageAsync({ action: "info", url: request.url });
                if (res && res.status === "success" && res.info) {
                    sendResponse({ success: true, data: res.info });
                } else {
                    sendResponse({ success: false, error: res?.text || "Failed to fetch media formats" });
                }
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === "CANCEL_DOWNLOAD") {
        (async () => {
            try {
                if (activeNativePort) {
                    activeNativePort.postMessage({ action: "cancel" });
                    try { activeNativePort.disconnect(); } catch (e) {}
                    activeNativePort = null;
                }

                await chrome.storage.session.set({
                    activeDownload: {
                        status: "cancelled",
                        error: "Download cancelled by user.",
                        code: "CANCELLED",
                        timestamp: Date.now()
                    }
                });

                await chrome.action.setBadgeText({ text: "CAN" });
                await chrome.action.setBadgeBackgroundColor({ color: "#64748B" });

                setTimeout(async () => {
                    await chrome.storage.session.remove("activeDownload");
                    await chrome.action.setBadgeText({ text: "" });
                }, 2000);

                sendResponse({ success: true, cancelled: true });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === "DOWNLOAD_MEDIA") {
        (async () => {
            try {
                const result = await processDownloadRequest(request.payload, sender.tab?.id);
                sendResponse({ success: true, data: result });
            } catch (err) {
                console.error("[ServiceWorker] Download error:", err);
                sendResponse({
                    success: false,
                    error: err.message || "Failed to process download request.",
                    code: err.code || "UNKNOWN_ERROR",
                });
            }
        })();
        return true;
    }

    if (request.action === "PING_SERVER") {
        (async () => {
            sendResponse({
                success: true,
                online: true,
                engine: "yt-dlp (Native On-Demand)"
            });
        })();
        return true;
    }
});

async function handleMediaStateUpdate(tabId, data) {
    if (!tabId) return;

    try {
        const { activeDownload } = await chrome.storage.session.get("activeDownload");
        if (activeDownload && activeDownload.status === "processing") {
            return;
        }

        if (data && data.isPlaying) {
            await chrome.action.setBadgeText({ tabId, text: "PLAY" });
            await chrome.action.setBadgeBackgroundColor({
                tabId,
                color: "#10B981",
            });
        } else if (data && data.hasVideo) {
            await chrome.action.setBadgeText({ tabId, text: "READY" });
            await chrome.action.setBadgeBackgroundColor({
                tabId,
                color: "#3B82F6",
            });
        } else {
            await chrome.action.setBadgeText({ tabId, text: "" });
        }
    } catch (e) {
        // Tab closed
    }
}

async function processDownloadRequest(payload, tabId) {
    const {
        url,
        title,
        directUrl,
        videoQuality,
        audioFormat,
        downloadMode,
        audioBitrate,
    } = payload;

    if (!url || typeof url !== "string" || !url.startsWith("http")) {
        const error = new Error("Invalid or missing video URL.");
        error.code = "INVALID_URL";
        throw error;
    }

    const requestPayload = {
        action: "download",
        url: url,
        title: title || null,
        directUrl: directUrl || null,
        downloadMode: downloadMode || "auto",
        videoQuality: videoQuality || "1080",
        audioFormat: audioFormat || "mp3",
        audioBitrate: audioBitrate || "128",
    };

    // Initialize session state
    await chrome.storage.session.set({
        activeDownload: {
            status: "processing",
            percent: 0,
            progressText: "Starting download...",
            payload: requestPayload,
            startTime: Date.now()
        }
    });

    await chrome.action.setBadgeText({ text: "0%" });
    await chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" });

    try {
        let result;
        try {
            result = await executeNativePortDownload(requestPayload);
        } catch (nativeErr) {
            if (nativeErr.code === "CANCELLED") throw nativeErr;
            console.warn("[ServiceWorker] Native messaging port fallback:", nativeErr.message);

            // Fallback A: If direct video stream URL is available (e.g. from Facebook DOM/network), download directly via Chrome Downloads API
            const directUrl = requestPayload.directUrl;
            const isDirectVideo = directUrl && 
                typeof directUrl === "string" && 
                directUrl.startsWith("http") && 
                !/\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(directUrl) && 
                !directUrl.includes("dst-jpg") && 
                !directUrl.includes("dst-png");

            if (isDirectVideo) {
                console.log("[ServiceWorker] Using Chrome Downloads API fallback for direct video stream:", directUrl);
                try {
                    const height = requestPayload.videoQuality || "1080";
                    const audioFormat = requestPayload.audioFormat || "mp3";
                    const downloadMode = requestPayload.downloadMode || "auto";
                    const resLabel = downloadMode === "audio" ? audioFormat.toUpperCase() : `${height}p`;
                    const ext = downloadMode === "audio" ? `.${audioFormat}` : ".mp4";

                    let targetFilename;
                    if (!isGenericTitle(requestPayload.title)) {
                        const cleanTitle = sanitizeFilename(requestPayload.title);
                        targetFilename = `${cleanTitle}_${resLabel}${ext}`;
                    } else {
                        targetFilename = `${getFormattedTimestamp()}_${resLabel}${ext}`;
                    }

                    const downloadId = await chrome.downloads.download({
                        url: directUrl,
                        filename: targetFilename,
                        saveAs: false
                    });
                    result = {
                        status: "success",
                        filename: targetFilename,
                        filepath: "Downloads"
                    };
                } catch (dlErr) {
                    console.warn("[ServiceWorker] Chrome Downloads API fallback failed:", dlErr.message);
                    result = await fallbackLocalServerRequest(requestPayload);
                }
            } else {
                result = await fallbackLocalServerRequest(requestPayload);
            }
        }

        if (!result || (result.status !== "success" && result.status !== "tunnel" && result.status !== "redirect" && result.status !== "stream")) {
            throw new Error(result?.text || "Download engine returned invalid result.");
        }

        // Save completed state
        await chrome.storage.session.set({
            activeDownload: {
                status: "completed",
                filename: result.filename,
                timestamp: Date.now()
            }
        });

        // Flash DONE (Green)
        await chrome.action.setBadgeText({ text: "DONE" });
        await chrome.action.setBadgeBackgroundColor({ color: "#10B981" });

        setTimeout(async () => {
            const { activeDownload } = await chrome.storage.session.get("activeDownload");
            if (activeDownload && activeDownload.status === "completed") {
                await chrome.storage.session.remove("activeDownload");
                await chrome.action.setBadgeText({ text: "" });
            }
        }, 4000);

        return {
            status: "success",
            filename: result.filename,
            filepath: result.filepath || result.url
        };

    } catch (err) {
        if (err.code === "CANCELLED") {
            throw err;
        }

        // Save error state
        await chrome.storage.session.set({
            activeDownload: {
                status: "error",
                error: err.message,
                code: err.code || "DOWNLOAD_FAILED",
                timestamp: Date.now()
            }
        });

        await chrome.action.setBadgeText({ text: "ERR" });
        await chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });

        setTimeout(async () => {
            const { activeDownload } = await chrome.storage.session.get("activeDownload");
            if (activeDownload && activeDownload.status === "error") {
                await chrome.storage.session.remove("activeDownload");
                await chrome.action.setBadgeText({ text: "" });
            }
        }, 5000);

        throw err;
    }
}

function executeNativePortDownload(payload) {
    return new Promise((resolve, reject) => {
        if (!chrome.runtime.connectNative) {
            return reject(new Error("Native messaging API unavailable."));
        }

        const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
        activeNativePort = port;

        port.onMessage.addListener(async (msg) => {
            if (msg.status === "progress") {
                const percent = msg.percent || 0;
                const text = msg.text || `Downloading... ${percent}%`;

                await chrome.storage.session.set({
                    activeDownload: {
                        status: "processing",
                        percent: percent,
                        progressText: text,
                        payload: payload,
                        startTime: Date.now()
                    }
                });

                await chrome.action.setBadgeText({ text: `${percent}%` });
                await chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" });

            } else if (msg.status === "success") {
                activeNativePort = null;
                resolve(msg);
            } else if (msg.status === "cancelled") {
                activeNativePort = null;
                const err = new Error("Download cancelled by user.");
                err.code = "CANCELLED";
                reject(err);
            } else if (msg.status === "error") {
                activeNativePort = null;
                const err = new Error(msg.text || "Native host error.");
                err.code = "NATIVE_ERROR";
                reject(err);
            }
        });

        port.onDisconnect.addListener(() => {
            activeNativePort = null;
            if (chrome.runtime.lastError) {
                console.warn("[ServiceWorker] Native port disconnected:", chrome.runtime.lastError.message);
            }
        });

        port.postMessage(payload);
    });
}

function sendSingleNativeMessageAsync(message) {
    return new Promise((resolve, reject) => {
        if (!chrome.runtime.sendNativeMessage) {
            return reject(new Error("Native messaging API not available."));
        }

        chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

async function fallbackLocalServerRequest(requestBody) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
        response = await fetch(FALLBACK_LOCAL_SERVER_URL, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });
    } catch (netErr) {
        clearTimeout(timeoutId);
        const err = new Error("Media downloader engine is unavailable.");
        err.code = "ENGINE_UNAVAILABLE";
        throw err;
    }
    clearTimeout(timeoutId);

    let data;
    try {
        data = await response.json();
    } catch (parseErr) {
        const err = new Error(`Server returned invalid response (HTTP ${response.status}).`);
        err.code = "INVALID_RESPONSE";
        throw err;
    }

    if (data.status === "error") {
        const err = new Error(data.text || "yt-dlp processing failed.");
        err.code = "YTDLP_ERROR";
        throw err;
    }

    if (data.status === "tunnel" || data.status === "redirect" || data.status === "stream") {
        const downloadId = await triggerChromeDownload(data.url, data.filename);
        return {
            status: "success",
            url: data.url,
            filename: data.filename || "download",
            downloadId: downloadId,
        };
    }

    const err = new Error(`Unknown response status: ${data.status}`);
    err.code = "UNKNOWN_STATUS";
    throw err;
}

function triggerChromeDownload(downloadUrl, suggestedFilename) {
    return new Promise((resolve, reject) => {
        const downloadOptions = {
            url: downloadUrl,
            conflictAction: "uniquify",
            saveAs: false,
        };

        if (suggestedFilename) {
            downloadOptions.filename = suggestedFilename;
        }

        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(
                    new Error(
                        chrome.runtime.lastError.message ||
                            "Chrome download manager error.",
                    ),
                );
            } else {
                resolve(downloadId);
            }
        });
    });
}
