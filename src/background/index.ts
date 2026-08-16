// Universal Video Downloader - Background Service Worker (On-Demand Native Host Engine)
import type {
    ActiveDownloadState,
    DownloadRequestPayload,
    MediaInfoData,
    VideoInfo,
} from "../types/extension";
import {
    MEDIA_INFO_CACHE_KEY,
    MEDIA_INFO_CACHE_TTL_MS,
    type MediaInfoCache,
    mergeMediaInfo,
    normalizeMediaUrl,
} from "./mediaCache";

const NATIVE_HOST_NAME = "com.videodownloader.yt_dlp";
const FALLBACK_LOCAL_SERVER_URL = "http://127.0.0.1:9000/";

interface NativeInfoResponse {
    status: string;
    text?: string;
    info?: {
        title?: string;
        thumbnail?: string;
        heights?: number[];
    };
}

interface NativeDownloadProgress {
    status: "progress" | "success" | "cancelled" | "error";
    percent?: number;
    text?: string;
    filename?: string;
    filepath?: string;
}

interface FallbackServerResponse {
    status: string;
    text?: string;
    url?: string;
    filename?: string;
}

function getFormattedTimestamp(d = new Date()): string {
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

function isGenericTitle(title?: string | null): boolean {
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

function sanitizeFilename(name: string): string {
    return name
        .replace(/[/\\?%*:|"<>]/g, "_")
        .trim()
        .slice(0, 120);
}

let activeNativePort: chrome.runtime.Port | null = null;
const mediaInfoPrefetchInFlight = new Set<string>();

async function readMediaInfoCache(): Promise<MediaInfoCache> {
    const stored = (await chrome.storage.session.get(MEDIA_INFO_CACHE_KEY)) as {
        [MEDIA_INFO_CACHE_KEY]?: MediaInfoCache;
    };
    return stored[MEDIA_INFO_CACHE_KEY] || {};
}

async function getCachedMediaInfo(url: string): Promise<MediaInfoData | null> {
    const cacheKey = normalizeMediaUrl(url);
    const cache = await readMediaInfoCache();
    const entry = cache[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MEDIA_INFO_CACHE_TTL_MS) return null;
    return entry.data;
}

async function setCachedMediaInfo(
    url: string,
    data: MediaInfoData,
): Promise<void> {
    if (!data.title && !data.thumbnail && !data.heights?.length) return;

    const cacheKey = normalizeMediaUrl(url);
    const cache = await readMediaInfoCache();
    cache[cacheKey] = {
        data: mergeMediaInfo(cache[cacheKey]?.data, data),
        timestamp: Date.now(),
    };
    await chrome.storage.session.set({ [MEDIA_INFO_CACHE_KEY]: cache });
}

async function fetchMediaInfoFromEngine(
    url: string,
): Promise<MediaInfoData | null> {
    const res = (await sendSingleNativeMessageAsync({
        action: "info",
        url,
    })) as NativeInfoResponse;

    if (res && res.status === "success" && res.info) {
        return res.info;
    }

    return null;
}

function scheduleMediaInfoPrefetch(
    url: string,
    preloaded?: MediaInfoData,
): void {
    const cacheKey = normalizeMediaUrl(url);
    if (mediaInfoPrefetchInFlight.has(cacheKey)) return;

    void (async () => {
        if (
            preloaded?.heights?.length ||
            preloaded?.title ||
            preloaded?.thumbnail
        ) {
            await setCachedMediaInfo(url, preloaded);
            if (preloaded.heights?.length) return;
        }

        const cached = await getCachedMediaInfo(url);
        if (cached?.heights?.length) return;

        mediaInfoPrefetchInFlight.add(cacheKey);
        try {
            const info = await fetchMediaInfoFromEngine(url);
            if (info) {
                await setCachedMediaInfo(url, info);
            }
        } catch (err: unknown) {
            const errorObj = err as { message?: string };
            console.warn(
                "[ServiceWorker] Media info prefetch failed:",
                errorObj.message,
            );
        } finally {
            mediaInfoPrefetchInFlight.delete(cacheKey);
        }
    })();
}

// Listen for messages from Content Script and Popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "MEDIA_STATE_UPDATED") {
        handleMediaStateUpdate(sender.tab?.id, request.data as VideoInfo);
        return false;
    }

    if (request.action === "GET_DOWNLOAD_STATUS") {
        (async () => {
            const { activeDownload } = (await chrome.storage.session.get(
                "activeDownload",
            )) as { activeDownload?: ActiveDownloadState };
            sendResponse({ success: true, data: activeDownload || null });
        })();
        return true;
    }

    if (request.action === "FETCH_MEDIA_INFO") {
        (async () => {
            try {
                const url = request.url as string;
                const preloaded = request.preloaded as
                    | MediaInfoData
                    | undefined;

                const cached = await getCachedMediaInfo(url);
                const merged = mergeMediaInfo(cached, preloaded);
                if (merged.heights?.length) {
                    await setCachedMediaInfo(url, merged);
                    sendResponse({ success: true, data: merged, cached: true });
                    return;
                }

                if (preloaded?.title || preloaded?.thumbnail) {
                    await setCachedMediaInfo(url, preloaded);
                }

                const info = await fetchMediaInfoFromEngine(url);
                if (info) {
                    const resolved = mergeMediaInfo(preloaded, info);
                    await setCachedMediaInfo(url, resolved);
                    sendResponse({ success: true, data: resolved });
                } else {
                    sendResponse({
                        success: false,
                        error: "Failed to fetch media formats",
                    });
                }
            } catch (err: unknown) {
                const errorObj = err as { message?: string };
                sendResponse({ success: false, error: errorObj.message });
            }
        })();
        return true;
    }

    if (request.action === "CANCEL_DOWNLOAD") {
        (async () => {
            try {
                if (activeNativePort) {
                    activeNativePort.postMessage({ action: "cancel" });
                    try {
                        activeNativePort.disconnect();
                    } catch {
                        // Ignore disconnect exception
                    }
                    activeNativePort = null;
                }

                await chrome.storage.session.set({
                    activeDownload: {
                        status: "cancelled",
                        error: "Download cancelled by user.",
                        code: "CANCELLED",
                        timestamp: Date.now(),
                    } as ActiveDownloadState,
                });

                await chrome.action.setBadgeText({ text: "CAN" });
                await chrome.action.setBadgeBackgroundColor({
                    color: "#64748B",
                });

                setTimeout(async () => {
                    await chrome.storage.session.remove("activeDownload");
                    await chrome.action.setBadgeText({ text: "" });
                }, 2000);

                sendResponse({ success: true, cancelled: true });
            } catch (err: unknown) {
                const errorObj = err as { message?: string };
                sendResponse({ success: false, error: errorObj.message });
            }
        })();
        return true;
    }

    if (request.action === "DOWNLOAD_MEDIA") {
        (async () => {
            try {
                const result = await processDownloadRequest(
                    request.payload as DownloadRequestPayload,
                );
                sendResponse({ success: true, data: result });
            } catch (err: unknown) {
                const errorObj = err as { message?: string; code?: string };
                console.error("[ServiceWorker] Download error:", errorObj);
                sendResponse({
                    success: false,
                    error:
                        errorObj.message ||
                        "Failed to process download request.",
                    code: errorObj.code || "UNKNOWN_ERROR",
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
                engine: "yt-dlp",
            });
        })();
        return true;
    }
});

async function handleMediaStateUpdate(
    tabId?: number,
    data?: VideoInfo,
): Promise<void> {
    if (!tabId) return;

    try {
        if (data?.url && data.hasVideo) {
            scheduleMediaInfoPrefetch(data.url, {
                title: data.title,
                thumbnail: data.thumbnail,
                heights: data.heights,
            });
        }

        const { activeDownload } = (await chrome.storage.session.get(
            "activeDownload",
        )) as { activeDownload?: ActiveDownloadState };
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
    } catch {
        // Tab closed
    }
}

async function processDownloadRequest(
    payload: DownloadRequestPayload,
): Promise<{ status: string; filename: string; filepath: string }> {
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
        const error = new Error("Invalid or missing video URL.") as Error & {
            code?: string;
        };
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
            startTime: Date.now(),
        } as ActiveDownloadState,
    });

    await chrome.action.setBadgeText({ text: "0%" });
    await chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" });

    try {
        let result: {
            status: string;
            filename: string;
            filepath?: string;
            url?: string;
            text?: string;
        };
        try {
            result = await executeNativePortDownload(requestPayload);
        } catch (nativeErr: unknown) {
            const nErr = nativeErr as Error & { code?: string };
            if (nErr.code === "CANCELLED") throw nErr;
            console.warn(
                "[ServiceWorker] Native messaging port fallback:",
                nErr.message,
            );

            // Fallback A: Direct video stream URL via Chrome Downloads API
            const direct = requestPayload.directUrl;
            const isDirectVideo =
                direct &&
                typeof direct === "string" &&
                direct.startsWith("http") &&
                !/\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(direct) &&
                !direct.includes("dst-jpg") &&
                !direct.includes("dst-png");

            if (isDirectVideo) {
                console.log(
                    "[ServiceWorker] Using Chrome Downloads API fallback for direct video stream:",
                    direct,
                );
                try {
                    const height = requestPayload.videoQuality || "1080";
                    const format = requestPayload.audioFormat || "mp3";
                    const mode = requestPayload.downloadMode || "auto";
                    const resLabel =
                        mode === "audio" ? format.toUpperCase() : `${height}p`;
                    const ext = mode === "audio" ? `.${format}` : ".mp4";

                    let targetFilename: string;
                    if (!isGenericTitle(requestPayload.title)) {
                        const cleanTitle = sanitizeFilename(
                            requestPayload.title!,
                        );
                        targetFilename = `${cleanTitle}_${resLabel}${ext}`;
                    } else {
                        targetFilename = `${getFormattedTimestamp()}_${resLabel}${ext}`;
                    }

                    await chrome.downloads.download({
                        url: direct,
                        filename: targetFilename,
                        saveAs: false,
                    });
                    result = {
                        status: "success",
                        filename: targetFilename,
                        filepath: "Downloads",
                    };
                } catch (dlErr: unknown) {
                    const dErr = dlErr as Error;
                    console.warn(
                        "[ServiceWorker] Chrome Downloads API fallback failed:",
                        dErr.message,
                    );
                    result = await fallbackLocalServerRequest(requestPayload);
                }
            } else {
                result = await fallbackLocalServerRequest(requestPayload);
            }
        }

        if (
            !result ||
            (result.status !== "success" &&
                result.status !== "tunnel" &&
                result.status !== "redirect" &&
                result.status !== "stream")
        ) {
            throw new Error(
                result?.text || "Download engine returned invalid result.",
            );
        }

        // Save completed state
        await chrome.storage.session.set({
            activeDownload: {
                status: "completed",
                filename: result.filename,
                timestamp: Date.now(),
            } as ActiveDownloadState,
        });

        // Flash DONE (Green)
        await chrome.action.setBadgeText({ text: "DONE" });
        await chrome.action.setBadgeBackgroundColor({ color: "#10B981" });

        setTimeout(async () => {
            const { activeDownload } = (await chrome.storage.session.get(
                "activeDownload",
            )) as { activeDownload?: ActiveDownloadState };
            if (activeDownload && activeDownload.status === "completed") {
                await chrome.storage.session.remove("activeDownload");
                await chrome.action.setBadgeText({ text: "" });
            }
        }, 4000);

        return {
            status: "success",
            filename: result.filename,
            filepath: result.filepath || result.url || "",
        };
    } catch (err: unknown) {
        const errorObj = err as Error & { code?: string };
        if (errorObj.code === "CANCELLED") {
            throw errorObj;
        }

        // Save error state
        await chrome.storage.session.set({
            activeDownload: {
                status: "error",
                error: errorObj.message,
                code: errorObj.code || "DOWNLOAD_FAILED",
                timestamp: Date.now(),
            } as ActiveDownloadState,
        });

        await chrome.action.setBadgeText({ text: "ERR" });
        await chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });

        setTimeout(async () => {
            const { activeDownload } = (await chrome.storage.session.get(
                "activeDownload",
            )) as { activeDownload?: ActiveDownloadState };
            if (activeDownload && activeDownload.status === "error") {
                await chrome.storage.session.remove("activeDownload");
                await chrome.action.setBadgeText({ text: "" });
            }
        }, 5000);

        throw errorObj;
    }
}

function executeNativePortDownload(payload: unknown): Promise<{
    status: string;
    filename: string;
    filepath?: string;
    text?: string;
}> {
    return new Promise((resolve, reject) => {
        if (!chrome.runtime.connectNative) {
            return reject(new Error("Native messaging API unavailable."));
        }

        const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
        activeNativePort = port;

        port.onMessage.addListener(async (msg: NativeDownloadProgress) => {
            if (msg.status === "progress") {
                const percent = msg.percent || 0;
                const text = msg.text || `Downloading... ${percent}%`;

                await chrome.storage.session.set({
                    activeDownload: {
                        status: "processing",
                        percent: percent,
                        progressText: text,
                        payload: payload as DownloadRequestPayload,
                        startTime: Date.now(),
                    } as ActiveDownloadState,
                });

                await chrome.action.setBadgeText({ text: `${percent}%` });
                await chrome.action.setBadgeBackgroundColor({
                    color: "#F59E0B",
                });
            } else if (msg.status === "success") {
                activeNativePort = null;
                resolve({
                    status: "success",
                    filename: msg.filename || "download",
                    filepath: msg.filepath,
                });
            } else if (msg.status === "cancelled") {
                activeNativePort = null;
                const err = new Error(
                    "Download cancelled by user.",
                ) as Error & { code?: string };
                err.code = "CANCELLED";
                reject(err);
            } else if (msg.status === "error") {
                activeNativePort = null;
                const err = new Error(
                    msg.text || "Native host error.",
                ) as Error & { code?: string };
                err.code = "NATIVE_ERROR";
                reject(err);
            }
        });

        port.onDisconnect.addListener(() => {
            activeNativePort = null;
            if (chrome.runtime.lastError) {
                console.warn(
                    "[ServiceWorker] Native port disconnected:",
                    chrome.runtime.lastError.message,
                );
            }
        });

        port.postMessage(payload);
    });
}

function sendSingleNativeMessageAsync(message: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
        if (!chrome.runtime.sendNativeMessage) {
            return reject(new Error("Native messaging API not available."));
        }

        chrome.runtime.sendNativeMessage(
            NATIVE_HOST_NAME,
            message as object,
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            },
        );
    });
}

async function fallbackLocalServerRequest(
    requestBody: unknown,
): Promise<{ status: string; filename: string; url?: string; text?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response: Response;
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
    } catch {
        clearTimeout(timeoutId);
        const err = new Error(
            "Media downloader engine is unavailable.",
        ) as Error & { code?: string };
        err.code = "ENGINE_UNAVAILABLE";
        throw err;
    }
    clearTimeout(timeoutId);

    let data: FallbackServerResponse;
    try {
        data = (await response.json()) as FallbackServerResponse;
    } catch {
        const err = new Error(
            `Server returned invalid response (HTTP ${response.status}).`,
        ) as Error & { code?: string };
        err.code = "INVALID_RESPONSE";
        throw err;
    }

    if (data.status === "error") {
        const err = new Error(
            data.text || "yt-dlp processing failed.",
        ) as Error & { code?: string };
        err.code = "YTDLP_ERROR";
        throw err;
    }

    if (
        data.status === "tunnel" ||
        data.status === "redirect" ||
        data.status === "stream"
    ) {
        const downloadId = await triggerChromeDownload(
            data.url || "",
            data.filename,
        );
        return {
            status: "success",
            url: data.url,
            filename: data.filename || "download",
            text: String(downloadId),
        };
    }

    const err = new Error(
        `Unknown response status: ${data.status}`,
    ) as Error & { code?: string };
    err.code = "UNKNOWN_STATUS";
    throw err;
}

function triggerChromeDownload(
    downloadUrl: string,
    suggestedFilename?: string,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const downloadOptions: chrome.downloads.DownloadOptions = {
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
