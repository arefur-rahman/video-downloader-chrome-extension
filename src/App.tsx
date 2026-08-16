import {
    Coffee,
    Download,
    Film,
    Globe,
    Loader2,
    Music,
    RotateCw,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
    ActiveDownloadState,
    DownloadRequestPayload,
    MediaInfoData,
    VideoInfo,
} from "./types/extension";
import { normalizeMediaUrl } from "./utils/media";

export default function App() {
    // State Variables
    const [serverOnline, setServerOnline] = useState<boolean | null>(null);
    const [engineName, setEngineName] = useState<string>("Checking...");

    const [activeTabUrl, setActiveTabUrl] = useState<string>("");
    const [activeTabTitle, setActiveTabTitle] = useState<string>("");
    const [activeDirectUrl, setActiveDirectUrl] = useState<string | null>(null);
    const [platform, setPlatform] = useState<string>("Detecting...");
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [isRestrictedPage, setIsRestrictedPage] = useState<boolean>(false);

    const [activeMode, setActiveMode] = useState<"video" | "audio">("video");
    const [selectedQuality, setSelectedQuality] = useState<string>("");
    const [availableHeights, setAvailableHeights] = useState<number[]>([]);
    const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    const [downloadMode, setDownloadMode] = useState<"auto" | "mute">("auto");
    const [selectedFormat, setSelectedFormat] = useState<string>("mp3");
    const [selectedBitrate, setSelectedBitrate] = useState<string>("128");

    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [progressPercent, setProgressPercent] = useState<number>(0);
    const [progressText, setProgressText] = useState<string>("");

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const activeTabUrlRef = useRef<string>("");

    const showError = useCallback((message: string, code?: string) => {
        setErrorMsg(message);
        setErrorCode(code || null);
        setSuccessMsg(null);
    }, []);

    const showSuccess = useCallback((message: string) => {
        setSuccessMsg(message);
        setErrorMsg(null);
        setTimeout(() => setSuccessMsg(null), 5000);
    }, []);

    const handleDownloadSessionUpdate = useCallback(
        (downloadState?: ActiveDownloadState) => {
            if (!downloadState) return;

            if (downloadState.status === "processing") {
                setIsDownloading(true);
                setProgressPercent(downloadState.percent || 0);
                setProgressText(downloadState.progressText || "Downloading...");
            } else if (downloadState.status === "completed") {
                setIsDownloading(false);
                if (
                    downloadState.timestamp &&
                    Date.now() - downloadState.timestamp < 15000
                ) {
                    showSuccess(
                        `🚀 Download completed: ${downloadState.filename || "file"}`,
                    );
                }
            } else if (downloadState.status === "cancelled") {
                setIsDownloading(false);
                if (
                    downloadState.timestamp &&
                    Date.now() - downloadState.timestamp < 15000
                ) {
                    showError("Download cancelled by user.", "CANCELLED");
                }
            } else if (downloadState.status === "error") {
                setIsDownloading(false);
                if (
                    downloadState.timestamp &&
                    Date.now() - downloadState.timestamp < 15000
                ) {
                    showError(
                        downloadState.error || "Download failed",
                        downloadState.code || "ERR",
                    );
                }
            }
        },
        [showError, showSuccess],
    );

    const syncDownloadSessionState = useCallback(async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: "GET_DOWNLOAD_STATUS",
            });
            if (response && response.success && response.data) {
                handleDownloadSessionUpdate(response.data);
            }
        } catch {
            // Session sync fallback
        }
    }, [handleDownloadSessionUpdate]);

    const checkServerStatus = useCallback(async () => {
        try {
            const res = await chrome.runtime.sendMessage({
                action: "PING_SERVER",
            });
            if (res && res.online) {
                setServerOnline(true);
                setEngineName("yt-dlp");
            } else {
                setServerOnline(false);
                setEngineName("Offline");
            }
        } catch {
            setServerOnline(false);
            setEngineName("Offline");
        }
    }, []);

    const detectPlatformFromUrl = useCallback((urlStr: string): string => {
        try {
            const host = new URL(urlStr).hostname.toLowerCase();
            if (host.includes("youtube.com") || host.includes("youtu.be"))
                return "YouTube";
            if (host.includes("tiktok.com")) return "TikTok";
            if (host.includes("facebook.com") || host.includes("fb.watch"))
                return "Facebook";
            if (host.includes("instagram.com")) return "Instagram";
            if (host.includes("twitter.com") || host.includes("x.com"))
                return "Twitter/X";
            if (host.includes("vimeo.com")) return "Vimeo";
            if (host.includes("reddit.com")) return "Reddit";
            return "Web Video";
        } catch {
            return "Web Video";
        }
    }, []);

    const applyMediaInfo = useCallback((data?: MediaInfoData | null) => {
        if (!data) return;

        if (data.heights && data.heights.length > 0) {
            setAvailableHeights(data.heights);
            setSelectedQuality(String(data.heights[0]));
            setIsLoadingMediaInfo(false);
        }
        if (data.title) {
            setActiveTabTitle(data.title);
        }
        if (data.thumbnail) {
            setThumbnail(data.thumbnail);
        }
    }, []);

    const initActiveTab = useCallback(async () => {
        try {
            setIsLoadingMediaInfo(true);
            setAvailableHeights([]);
            setSelectedQuality("");

            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (!tab || !tab.url) {
                setPlatform("N/A");
                setActiveTabTitle("No active tab detected");
                setIsRestrictedPage(true);
                setIsLoadingMediaInfo(false);
                return;
            }

            const urlStr = tab.url;
            activeTabUrlRef.current = urlStr;
            setActiveTabUrl(urlStr);
            const rawTitle = tab.title || "Detected Video";
            setActiveTabTitle(rawTitle);

            if (
                urlStr.startsWith("chrome://") ||
                urlStr.startsWith("chrome-extension://") ||
                urlStr.startsWith("about:")
            ) {
                setIsRestrictedPage(true);
                setPlatform("Unsupported");
                setActiveTabTitle("Browser Internal Page");
                setIsLoadingMediaInfo(false);
                showError(
                    "Open a video page on YouTube, TikTok, Facebook, Instagram, Twitter, etc. to start downloading.",
                    "PAGE_UNSUPPORTED",
                );
                return;
            }

            setIsRestrictedPage(false);
            setPlatform(detectPlatformFromUrl(urlStr));

            let pageMediaInfo: MediaInfoData | null = null;

            if (tab.id) {
                try {
                    const response = (await chrome.tabs.sendMessage(tab.id, {
                        action: "GET_VIDEO_INFO",
                    })) as { success?: boolean; data?: VideoInfo };

                    if (response?.success && response.data) {
                        const data = response.data;
                        if (data.url) setActiveTabUrl(data.url);
                        if (data.directUrl) setActiveDirectUrl(data.directUrl);
                        if (data.platform) setPlatform(data.platform);

                        pageMediaInfo = {
                            title: data.title,
                            thumbnail: data.thumbnail,
                            heights: data.heights,
                        };
                        applyMediaInfo(pageMediaInfo);

                        if (pageMediaInfo.heights?.length) {
                            void chrome.runtime.sendMessage({
                                action: "FETCH_MEDIA_INFO",
                                url: urlStr,
                                preloaded: pageMediaInfo,
                            });
                            return;
                        }
                    }
                } catch {
                    // Content script unavailable on this tab
                }
            }

            const mediaResponse = (await chrome.runtime.sendMessage({
                action: "FETCH_MEDIA_INFO",
                url: urlStr,
                preloaded: pageMediaInfo,
            })) as { success?: boolean; data?: MediaInfoData };

            if (mediaResponse?.success && mediaResponse.data) {
                applyMediaInfo(mediaResponse.data);
            } else if (!pageMediaInfo?.heights?.length) {
                setIsLoadingMediaInfo(false);
            }
        } catch {
            setIsRestrictedPage(true);
            setIsLoadingMediaInfo(false);
        }
    }, [applyMediaInfo, detectPlatformFromUrl, showError]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            await Promise.all([
                checkServerStatus(),
                initActiveTab(),
                syncDownloadSessionState(),
            ]);
        } finally {
            setIsRefreshing(false);
        }
    }, [checkServerStatus, initActiveTab, syncDownloadSessionState]);

    // Initial load: sync download session, check server, query active tab
    useEffect(() => {
        let isMounted = true;
        const loadInitialState = async () => {
            if (!isMounted) return;
            await Promise.all([
                syncDownloadSessionState(),
                checkServerStatus(),
                initActiveTab(),
            ]);
        };

        void loadInitialState();

        const storageListener = (changes: {
            [key: string]: chrome.storage.StorageChange;
        }) => {
            if (!isMounted) return;

            if (changes.activeDownload) {
                const downloadState = changes.activeDownload
                    .newValue as ActiveDownloadState;
                handleDownloadSessionUpdate(downloadState);
            }

            if (changes.mediaInfoCache) {
                const cache = changes.mediaInfoCache.newValue as
                    | Record<
                          string,
                          { data?: MediaInfoData; timestamp?: number }
                      >
                    | undefined;
                if (!cache) return;

                const entry = cache[normalizeMediaUrl(activeTabUrlRef.current)];
                if (entry?.data?.heights?.length) {
                    applyMediaInfo(entry.data);
                }
            }
        };

        if (chrome.storage?.session?.onChanged) {
            chrome.storage.session.onChanged.addListener(storageListener);
            return () => {
                isMounted = false;
                chrome.storage.session.onChanged.removeListener(
                    storageListener,
                );
            };
        }
        return () => {
            isMounted = false;
        };
    }, [
        syncDownloadSessionState,
        checkServerStatus,
        initActiveTab,
        handleDownloadSessionUpdate,
        applyMediaInfo,
    ]);

    // Clear alert banners on tab switch
    const handleModeSwitch = (mode: "video" | "audio") => {
        setActiveMode(mode);
        setErrorMsg(null);
        setSuccessMsg(null);
    };

    const handleCancelDownload = async () => {
        try {
            setProgressText("Cancelling download...");
            const res = await chrome.runtime.sendMessage({
                action: "CANCEL_DOWNLOAD",
            });
            setIsDownloading(false);
            if (res && res.cancelled) {
                showError("Download cancelled by user.", "CANCELLED");
            }
        } catch {
            setIsDownloading(false);
        }
    };

    const handleStartDownload = async () => {
        if (isDownloading || isRestrictedPage || isLoadingMediaInfo) return;
        setErrorMsg(null);
        setSuccessMsg(null);

        if (
            !activeTabUrl ||
            activeTabUrl.startsWith("chrome://") ||
            activeTabUrl.startsWith("chrome-extension://")
        ) {
            showError(
                "Cannot download media from internal browser pages. Please open a video on YouTube, TikTok, Facebook, etc.",
                "INVALID_PAGE",
            );
            return;
        }

        const payload: DownloadRequestPayload = {
            url: activeTabUrl,
            title: activeTabTitle || null,
            directUrl: activeDirectUrl || null,
            downloadMode: activeMode === "audio" ? "audio" : downloadMode,
            videoQuality: selectedQuality,
            audioFormat: selectedFormat,
            audioBitrate: selectedBitrate,
            filenameStyle: "basic",
        };

        setIsDownloading(true);
        setProgressPercent(0);
        setProgressText("Initializing download...");

        try {
            const response = await chrome.runtime.sendMessage({
                action: "DOWNLOAD_MEDIA",
                payload,
            });

            setIsDownloading(false);

            if (response && response.success) {
                showSuccess(
                    response.data?.filename
                        ? `🚀 Download completed: ${response.data.filename}`
                        : "🚀 Download completed!",
                );
            } else if (response && response.code === "CANCELLED") {
                showError("Download cancelled by user.", "CANCELLED");
            } else {
                showError(
                    response?.error || "Download failed.",
                    response?.code || "DOWNLOAD_FAILED",
                );
            }
        } catch (err: unknown) {
            setIsDownloading(false);
            const errorObj = err as { message?: string };
            if (errorObj.message && errorObj.message.includes("cancelled")) {
                showError("Download cancelled by user.", "CANCELLED");
            } else {
                showError(
                    errorObj.message || "Communication with extension failed.",
                    "RUNTIME_ERROR",
                );
            }
        }
    };

    return (
        <div className="w-95 p-4 bg-[#090d16] text-slate-100 text-xs font-sans box-border">
            {/* Header */}
            <header className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-linear-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-md shadow-indigo-500/25">
                        <Download className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span className="font-bold text-sm tracking-tight text-white">
                        Video Downloader
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded-full border border-slate-800 whitespace-nowrap">
                        <span
                            className={`w-2 h-2 rounded-full ${
                                serverOnline
                                    ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                                    : "bg-rose-500 shadow-[0_0_6px_#ef4444]"
                            }`}
                        />
                        <span className="font-medium text-[11px]">
                            {engineName}
                        </span>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing || isDownloading}
                        className="p-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
                        title="Reload Information"
                        aria-label="Reload Information"
                    >
                        <RotateCw
                            className={`w-3.5 h-3.5 ${
                                isRefreshing || isLoadingMediaInfo
                                    ? "animate-spin text-indigo-400"
                                    : "group-hover:rotate-45 transition-transform"
                            }`}
                        />
                    </button>
                </div>
            </header>

            {/* Detected Video Card */}
            <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 mb-3 flex gap-3 items-center hover:border-slate-700 transition-all shadow-xs">
                <div className="w-18 h-12 rounded-lg bg-slate-950 overflow-hidden shrink-0 relative flex items-center justify-center border border-slate-800 shadow-inner">
                    {thumbnail ? (
                        <img
                            src={thumbnail}
                            alt="Thumbnail"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <Film className="w-5 h-5 text-slate-600" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div
                        className="font-bold text-xs leading-tight text-slate-100 truncate mb-1"
                        title={activeTabTitle}
                    >
                        {activeTabTitle || "Detecting video..."}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30">
                            {platform}
                        </span>
                        {!isRestrictedPage && (
                            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
                                Ready
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Navigation Tabs + Controls — hidden while downloading */}
            {!isDownloading && (
                <>
                    <nav className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 mb-3">
                        <button
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                activeMode === "video"
                                    ? "bg-slate-800/90 text-white shadow-xs border border-slate-700/80"
                                    : "text-slate-400 hover:text-white"
                            }`}
                            onClick={() => handleModeSwitch("video")}
                        >
                            <Film className="w-3.5 h-3.5" /> Video
                        </button>
                        <button
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                activeMode === "audio"
                                    ? "bg-slate-800/90 text-white shadow-xs border border-slate-700/80"
                                    : "text-slate-400 hover:text-white"
                            }`}
                            onClick={() => handleModeSwitch("audio")}
                        >
                            <Music className="w-3.5 h-3.5" /> Audio
                        </button>
                    </nav>

                    {/* Tab Panel: Video */}
                    {activeMode === "video" && (
                        <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Select Resolution
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {isLoadingMediaInfo ? (
                                    Array.from({ length: 6 }).map(
                                        (_, index) => (
                                            <div
                                                key={index}
                                                className="py-2.5 px-2 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse"
                                            >
                                                <div className="h-4 bg-slate-800 rounded-md" />
                                            </div>
                                        ),
                                    )
                                ) : availableHeights.length > 0 ? (
                                    availableHeights.map((h) => (
                                        <button
                                            key={h}
                                            className={`relative py-2.5 px-2 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                                                selectedQuality === String(h)
                                                    ? "bg-indigo-600/30 border-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                                                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
                                            }`}
                                            onClick={() =>
                                                setSelectedQuality(String(h))
                                            }
                                        >
                                            {h}p
                                            {h >= 2160 && (
                                                <span className="absolute top-1 right-1 text-[8px] font-black bg-linear-to-r from-indigo-500 to-pink-500 text-white px-1 py-0.5 rounded-sm shadow-xs">
                                                    4K
                                                </span>
                                            )}
                                            {h === 1080 && (
                                                <span className="absolute top-1 right-1 text-[8px] font-black bg-linear-to-r from-indigo-500 to-pink-500 text-white px-1 py-0.5 rounded-sm shadow-xs">
                                                    HD
                                                </span>
                                            )}
                                        </button>
                                    ))
                                ) : (
                                    <div className="col-span-3 py-3 px-3 rounded-xl border border-slate-800 bg-slate-900/60 text-[11px] text-slate-400 text-center flex flex-col items-center gap-1.5">
                                        <span>
                                            No video formats detected for this
                                            page.
                                        </span>
                                        <button
                                            onClick={handleRefresh}
                                            disabled={
                                                isRefreshing || isDownloading
                                            }
                                            className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        >
                                            <RotateCw
                                                className={`w-3 h-3 ${isRefreshing || isLoadingMediaInfo ? "animate-spin" : ""}`}
                                            />{" "}
                                            Reload Info
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="mb-3.5">
                                <label className="block text-[11px] text-slate-400 mb-1 font-bold">
                                    Download Mode
                                </label>
                                <select
                                    value={downloadMode}
                                    onChange={(e) =>
                                        setDownloadMode(
                                            e.target.value as "auto" | "mute",
                                        )
                                    }
                                    className="w-full bg-slate-900/90 border border-slate-800 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                >
                                    <option value="auto">
                                        Video + Audio (Standard)
                                    </option>
                                    <option value="mute">
                                        Mute (Video Only)
                                    </option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Tab Panel: Audio */}
                    {activeMode === "audio" && (
                        <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Audio Format
                            </div>
                            <div className="grid grid-cols-4 gap-2 mb-3">
                                {["mp3", "wav", "opus", "ogg"].map((fmt) => (
                                    <button
                                        key={fmt}
                                        className={`py-2.5 px-2 rounded-xl text-xs font-bold uppercase transition-all border text-center cursor-pointer ${
                                            selectedFormat === fmt
                                                ? "bg-indigo-600/30 border-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                                                : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
                                        }`}
                                        onClick={() => setSelectedFormat(fmt)}
                                    >
                                        {fmt}
                                    </button>
                                ))}
                            </div>

                            <div className="mb-3.5">
                                <label className="block text-[11px] text-slate-400 mb-1 font-bold">
                                    Audio Bitrate
                                </label>
                                <select
                                    value={selectedBitrate}
                                    onChange={(e) =>
                                        setSelectedBitrate(e.target.value)
                                    }
                                    className="w-full bg-slate-900/90 border border-slate-800 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                >
                                    <option value="320">
                                        320 kbps (High Quality)
                                    </option>
                                    <option value="128">
                                        128 kbps (Standard)
                                    </option>
                                    <option value="64">
                                        64 kbps (Compact)
                                    </option>
                                </select>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Live Progress Box */}
            {isDownloading && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 mb-3 shadow-xs animate-fadeIn">
                    <div className="flex justify-between items-center text-xs font-bold mb-1.5 text-white">
                        <span>Downloading Media</span>
                        <span className="font-extrabold text-indigo-300">
                            {progressPercent}%
                        </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden mb-2 border border-slate-800/50 p-0.5">
                        <div
                            className="h-full bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 truncate max-w-52.5">
                            {progressText || "Preparing engine..."}
                        </span>
                        <button
                            onClick={handleCancelDownload}
                            className="bg-red-500/15 border border-red-500/40 text-red-300 px-2.5 py-0.5 rounded-lg text-[10px] font-bold hover:bg-red-500/30 flex items-center gap-1 transition-all cursor-pointer"
                        >
                            <X className="w-3 h-3" /> Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Action Download Button */}
            <button
                onClick={handleStartDownload}
                disabled={
                    isDownloading ||
                    isRestrictedPage ||
                    isLoadingMediaInfo ||
                    (activeMode === "video" && availableHeights.length === 0)
                }
                className="w-full bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white py-3 rounded-xl font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none mb-3"
            >
                {isDownloading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Downloading in Background...</span>
                    </>
                ) : isLoadingMediaInfo ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading Video Info...</span>
                    </>
                ) : (
                    <span>
                        {activeMode === "audio"
                            ? `Download Audio (${selectedFormat.toUpperCase()})`
                            : `Download Video (${selectedQuality}p)`}
                    </span>
                )}
            </button>

            {/* Banners */}
            {errorMsg && (
                <div className="p-3 rounded-xl text-xs bg-red-500/10 border border-red-500/30 text-red-300 mb-3 animate-fadeIn leading-relaxed">
                    <div className="flex items-center justify-between font-bold text-red-400 mb-1">
                        <span>Download Error</span>
                        {errorCode && (
                            <span className="text-[10px] bg-slate-950/80 px-1.5 py-0.5 rounded-md border border-red-500/30 font-mono">
                                {errorCode}
                            </span>
                        )}
                    </div>
                    <div className="leading-relaxed text-[11px]">
                        {errorMsg}
                    </div>
                </div>
            )}

            {successMsg && (
                <div className="p-3 rounded-xl text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-center mb-3 animate-fadeIn leading-relaxed font-semibold text-[11px]">
                    {successMsg}
                </div>
            )}

            {/* Footer */}
            <footer className="mt-3.5 pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs text-slate-500">
                <div className="font-medium text-slate-400 text-[11px]">
                    Developed by LOS
                </div>
                <div className="flex items-center gap-3">
                    <a
                        href="https://chabondhu.com/aref"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white transition-colors p-0.5"
                        title="Buy me a Chai"
                    >
                        <Coffee className="w-3.5 h-3.5" />
                    </a>
                    <a
                        href="https://github.com/arefur-rahman"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white transition-colors p-0.5"
                        title="GitHub"
                    >
                        <svg
                            className="w-3.5 h-3.5 fill-current"
                            viewBox="0 0 24 24"
                        >
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                    </a>
                    <a
                        href="https://www.facebook.com/aref.LoS"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white transition-colors p-0.5"
                        title="Facebook"
                    >
                        <svg
                            className="w-3.5 h-3.5 fill-current"
                            viewBox="0 0 24 24"
                        >
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                    </a>
                    <a
                        href="https://www.linkedin.com/in/md-arefur-rahman-khan-74188232b/"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white transition-colors p-0.5"
                        title="LinkedIn"
                    >
                        <svg
                            className="w-3.5 h-3.5 fill-current"
                            viewBox="0 0 24 24"
                        >
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                        </svg>
                    </a>
                    <a
                        href="https://arefolio.vercel.app/"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white transition-colors p-0.5"
                        title="Portfolio"
                    >
                        <Globe className="w-3.5 h-3.5" />
                    </a>
                </div>
            </footer>
        </div>
    );
}
