// Cobalt Universal Video Downloader - Content Script
// Detects video playback, metadata, and platform across websites.
import type { VideoInfo } from "../types/extension";

interface WindowWithDetector extends Window {
    __cobaltVideoDetectorLoaded?: boolean;
}

(function () {
    const win = window as unknown as WindowWithDetector;
    // Avoid double initialization
    if (win.__cobaltVideoDetectorLoaded) return;
    win.__cobaltVideoDetectorLoaded = true;

    function detectPlatform(hostname: string): string {
        const host = hostname.toLowerCase();
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
        if (host.includes("dailymotion.com")) return "Dailymotion";
        if (host.includes("pinterest.com")) return "Pinterest";
        if (host.includes("twitch.tv")) return "Twitch";
        if (host.includes("soundcloud.com")) return "SoundCloud";
        return "Web Video";
    }

    function cleanTitle(rawTitle?: string): string {
        if (!rawTitle) return "Detected Media";
        return rawTitle.replace(/^\(\d+\)\s*/, "").trim();
    }

    function getYouTubeVideoId(url = window.location.href): string | null {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();
            if (host.includes("youtu.be")) {
                return parsed.pathname.slice(1).split("/")[0] || null;
            }
            if (
                parsed.pathname.startsWith("/shorts/") ||
                parsed.pathname.startsWith("/embed/")
            ) {
                return parsed.pathname.split("/")[2] || null;
            }
            return parsed.searchParams.get("v");
        } catch {
            return null;
        }
    }

    function extractJsonObjectAfterMarker(
        text: string,
        marker: string,
    ): Record<string, unknown> | null {
        const markerIndex = text.indexOf(marker);
        if (markerIndex === -1) return null;

        const braceStart = text.indexOf("{", markerIndex + marker.length);
        if (braceStart === -1) return null;

        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = braceStart; i < text.length; i++) {
            const char = text[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === "\\") {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === "{") depth++;
            if (char === "}") {
                depth--;
                if (depth === 0) {
                    try {
                        return JSON.parse(
                            text.slice(braceStart, i + 1),
                        ) as Record<string, unknown>;
                    } catch {
                        return null;
                    }
                }
            }
        }

        return null;
    }

    function collectFormatHeights(formats: unknown): number[] {
        if (!Array.isArray(formats)) return [];

        const heights = formats
            .map((format) => {
                if (!format || typeof format !== "object") return null;
                const height = (format as { height?: number }).height;
                return typeof height === "number" && height > 0 ? height : null;
            })
            .filter((height): height is number => height !== null);

        return [...new Set(heights)].sort((a, b) => b - a);
    }

    function extractYouTubePageMediaInfo(): {
        title?: string;
        thumbnail?: string | null;
        heights?: number[];
    } | null {
        try {
            const currentVideoId = getYouTubeVideoId();
            const scripts = Array.from(document.querySelectorAll("script")).reverse();
            for (const script of scripts) {
                const text = script.textContent || "";
                if (!text.includes("ytInitialPlayerResponse")) continue;

                const playerResponse = extractJsonObjectAfterMarker(
                    text,
                    "ytInitialPlayerResponse",
                );
                if (!playerResponse) continue;

                const streamingData = playerResponse.streamingData as
                    | {
                          adaptiveFormats?: unknown;
                          formats?: unknown;
                      }
                    | undefined;
                const videoDetails = playerResponse.videoDetails as
                    | {
                          videoId?: string;
                          title?: string;
                          thumbnail?: { url?: string }[];
                      }
                    | undefined;

                if (
                    currentVideoId &&
                    videoDetails?.videoId &&
                    videoDetails.videoId !== currentVideoId
                ) {
                    continue;
                }

                const adaptiveHeights = collectFormatHeights(
                    streamingData?.adaptiveFormats,
                );
                const progressiveHeights = collectFormatHeights(
                    streamingData?.formats,
                );
                const heights = [
                    ...new Set([...adaptiveHeights, ...progressiveHeights]),
                ].sort((a, b) => b - a);

                const title =
                    typeof videoDetails?.title === "string"
                        ? cleanTitle(videoDetails.title)
                        : undefined;
                const thumbnail =
                    videoDetails?.thumbnail?.[
                        videoDetails.thumbnail.length - 1
                    ]?.url || null;

                if (heights.length > 0 || title || thumbnail) {
                    return {
                        title,
                        thumbnail,
                        heights: heights.length > 0 ? heights : undefined,
                    };
                }
            }
        } catch {
            // Ignore YouTube page parse errors
        }

        return null;
    }

    function extractOpenGraphMediaInfo(): {
        title?: string;
        thumbnail?: string | null;
    } | null {
        try {
            const ogTitle = (
                document.querySelector(
                    'meta[property="og:title"]',
                ) as HTMLMetaElement | null
            )?.content;
            const ogImage = (
                document.querySelector(
                    'meta[property="og:image"]',
                ) as HTMLMetaElement | null
            )?.content;

            if (!ogTitle && !ogImage) return null;

            return {
                title: ogTitle ? cleanTitle(ogTitle) : undefined,
                thumbnail: ogImage || null,
            };
        } catch {
            return null;
        }
    }

    function getThumbnail(): string | null {
        try {
            const ogImage =
                (
                    document.querySelector(
                        'meta[property="og:image"]',
                    ) as HTMLMetaElement
                )?.content ||
                (
                    document.querySelector(
                        'meta[name="twitter:image"]',
                    ) as HTMLMetaElement
                )?.content;
            if (ogImage) return ogImage;

            // YouTube fallback thumbnail from URL
            const ytMatch = window.location.href.match(
                /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            );
            if (ytMatch && ytMatch[1]) {
                return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
            }
        } catch {
            // Ignore thumbnail resolution error
        }
        return null;
    }

    function extractFacebookMedia(activeVideo: HTMLVideoElement | null) {
        let directUrl: string | null = null;
        let hdUrl: string | null = null;
        let sdUrl: string | null = null;
        let fbPermalink: string | null = null;

        function isVideoUrl(url?: string | null): boolean {
            if (!url || typeof url !== "string" || !url.startsWith("http"))
                return false;
            const lower = url.toLowerCase();
            if (
                lower.includes(".jpg") ||
                lower.includes(".jpeg") ||
                lower.includes(".png") ||
                lower.includes(".webp") ||
                lower.includes(".gif") ||
                lower.includes("dst-jpg") ||
                lower.includes("dst-png")
            ) {
                return false;
            }
            return (
                lower.includes("video") ||
                lower.includes(".mp4") ||
                lower.includes("mime=video") ||
                lower.includes("/bytestart/") ||
                lower.includes("playable_url") ||
                lower.includes("/v/t42.")
            );
        }

        try {
            // 1. Direct stream from video element or source tags
            if (activeVideo) {
                if (isVideoUrl(activeVideo.src)) {
                    directUrl = activeVideo.src;
                } else {
                    const sources = activeVideo.querySelectorAll("source");
                    for (const s of Array.from(sources)) {
                        if (isVideoUrl(s.src)) {
                            directUrl = s.src;
                            break;
                        }
                    }
                }

                // Find closest article / dialog permalink link
                const container =
                    activeVideo.closest(
                        '[role="article"], [role="dialog"], div[data-pagelet*="Feed"], div[data-pagelet*="Reel"]',
                    ) || document.body;
                const link = container.querySelector(
                    'a[href*="/reel/"], a[href*="/reels/"], a[href*="/watch/"], a[href*="/videos/"], a[href*="fb.watch"]',
                ) as HTMLAnchorElement | null;
                if (link && link.href) {
                    fbPermalink = link.href;
                }
            }

            // 2. Inspect Performance Timeline for active video CDN requests
            if (
                !directUrl &&
                window.performance &&
                typeof window.performance.getEntriesByType === "function"
            ) {
                const resources = window.performance.getEntriesByType(
                    "resource",
                ) as PerformanceResourceTiming[];
                for (let i = resources.length - 1; i >= 0; i--) {
                    const r = resources[i];
                    const rUrl = r.name || "";
                    if (rUrl.includes("fbcdn.net") && isVideoUrl(rUrl)) {
                        directUrl = rUrl
                            .replace(/([?&])(bytestart|byteend)=\d+&?/g, "$1")
                            .replace(/[?&]$/, "");
                        break;
                    }
                }
            }

            // 3. Scan script elements for JSON video attributes
            if (!directUrl) {
                const scripts = Array.from(document.querySelectorAll("script"));
                for (const script of scripts) {
                    const text = script.textContent || "";
                    if (
                        !text.includes("playable_url") &&
                        !text.includes("hd_src") &&
                        !text.includes("browser_native") &&
                        !text.includes("video_id")
                    )
                        continue;

                    const hdM =
                        text.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/) ||
                        text.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) ||
                        text.match(/"hd_src"\s*:\s*"([^"]+)"/);
                    if (hdM && hdM[1]) hdUrl = hdM[1].replace(/\\/g, "");

                    const sdM =
                        text.match(/"playable_url"\s*:\s*"([^"]+)"/) ||
                        text.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/) ||
                        text.match(/"sd_src"\s*:\s*"([^"]+)"/);
                    if (sdM && sdM[1]) sdUrl = sdM[1].replace(/\\/g, "");

                    if (hdUrl || sdUrl) {
                        const candidate = hdUrl || sdUrl;
                        if (isVideoUrl(candidate)) {
                            directUrl = candidate;
                            break;
                        }
                    }
                }
            }

            // 4. Fallback to document innerHTML regex
            if (!directUrl) {
                const html = document.documentElement.innerHTML;
                const hdMatch =
                    html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/) ||
                    html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) ||
                    html.match(/"hd_src"\s*:\s*"([^"]+)"/);
                if (hdMatch && hdMatch[1]) hdUrl = hdMatch[1].replace(/\\/g, "");

                const sdMatch =
                    html.match(/"playable_url"\s*:\s*"([^"]+)"/) ||
                    html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/) ||
                    html.match(/"sd_src"\s*:\s*"([^"]+)"/);
                if (sdMatch && sdMatch[1]) sdUrl = sdMatch[1].replace(/\\/g, "");

                if (hdUrl || sdUrl) {
                    const candidate = hdUrl || sdUrl;
                    if (isVideoUrl(candidate)) {
                        directUrl = candidate;
                    }
                }
            }

            // 5. Meta tags fallback
            if (!directUrl) {
                const ogVideo =
                    (
                        document.querySelector(
                            'meta[property="og:video"]',
                        ) as HTMLMetaElement
                    )?.content ||
                    (
                        document.querySelector(
                            'meta[property="og:video:url"]',
                        ) as HTMLMetaElement
                    )?.content ||
                    (
                        document.querySelector(
                            'meta[property="og:video:secure_url"]',
                        ) as HTMLMetaElement
                    )?.content;
                if (ogVideo && isVideoUrl(ogVideo)) {
                    directUrl = ogVideo;
                }
            }
        } catch {
            // Ignore Facebook media parsing exception
        }

        return {
            directUrl: directUrl || null,
            hdUrl: hdUrl || null,
            sdUrl: sdUrl || null,
            permalink: fbPermalink || null,
        };
    }

    function getVideoInfo(): VideoInfo {
        try {
            const videos = Array.from(
                document.querySelectorAll("video"),
            ) as HTMLVideoElement[];
            let activeVideo = videos.find(
                (v) => !v.paused && !v.ended && v.readyState > 2,
            );
            if (!activeVideo && videos.length > 0) {
                activeVideo = videos[0];
            }

            const playing = !!(
                activeVideo &&
                !activeVideo.paused &&
                !activeVideo.ended &&
                activeVideo.currentTime > 0
            );
            const hasVideoTag = videos.length > 0;

            const platform = detectPlatform(window.location.hostname);
            let title = cleanTitle(document.title);
            let url = window.location.href;
            let thumbnail = getThumbnail();
            let directUrl: string | null = null;
            let heights: number[] | undefined;

            if (platform === "YouTube") {
                const ytInfo = extractYouTubePageMediaInfo();
                if (ytInfo) {
                    if (ytInfo.title) title = ytInfo.title;
                    if (ytInfo.thumbnail) thumbnail = ytInfo.thumbnail;
                    if (ytInfo.heights?.length) heights = ytInfo.heights;
                }
            } else {
                const ogInfo = extractOpenGraphMediaInfo();
                if (ogInfo) {
                    if (ogInfo.title) title = ogInfo.title;
                    if (ogInfo.thumbnail) thumbnail = ogInfo.thumbnail;
                }
            }

            if (platform === "Facebook") {
                const fbMedia = extractFacebookMedia(activeVideo || null);
                if (
                    fbMedia.permalink &&
                    !url.includes("/reel/") &&
                    !url.includes("/videos/")
                ) {
                    url = fbMedia.permalink;
                }
                if (fbMedia.directUrl) {
                    directUrl = fbMedia.directUrl;
                }
            }

            return {
                hasVideo: hasVideoTag || platform !== "Web Video",
                isPlaying: playing,
                title: title,
                url: url,
                directUrl: directUrl,
                platform: platform,
                thumbnail: thumbnail,
                heights: heights,
                timestamp: Date.now(),
            };
        } catch (err: unknown) {
            const errorObj = err as Error;
            return {
                hasVideo: false,
                isPlaying: false,
                title: cleanTitle(document.title),
                url: window.location.href,
                platform: detectPlatform(window.location.hostname),
                thumbnail: null,
                error: errorObj.message,
            };
        }
    }

    function notifyBackground() {
        try {
            const info = getVideoInfo();
            chrome.runtime
                .sendMessage({
                    action: "MEDIA_STATE_UPDATED",
                    data: info,
                })
                .catch(() => {
                    // Ignore disconnect errors when extension reloads
                });
        } catch {
            // Ignore notification exception
        }
    }

    function attachVideoListeners() {
        try {
            const videos = document.querySelectorAll("video");
            videos.forEach((v) => {
                const el = v as Element & { __cobaltListenersAttached?: boolean };
                if (!el.__cobaltListenersAttached) {
                    el.__cobaltListenersAttached = true;
                    v.addEventListener("play", notifyBackground, {
                        passive: true,
                    });
                    v.addEventListener("pause", notifyBackground, {
                        passive: true,
                    });
                    v.addEventListener("ended", notifyBackground, {
                        passive: true,
                    });
                    v.addEventListener("playing", notifyBackground, {
                        passive: true,
                    });
                }
            });
        } catch {
            // Ignore frame errors
        }
    }

    const observer = new MutationObserver(() => {
        attachVideoListeners();
    });

    try {
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    } catch {
        // Ignore observer attach errors
    }

    attachVideoListeners();
    setTimeout(notifyBackground, 1000);

    let lastKnownUrl = window.location.href;
    let lastKnownTitle = document.title;

    function checkPageMediaChange() {
        const currentUrl = window.location.href;
        const currentTitle = document.title;
        if (
            currentUrl !== lastKnownUrl ||
            currentTitle !== lastKnownTitle
        ) {
            lastKnownUrl = currentUrl;
            lastKnownTitle = currentTitle;
            notifyBackground();
        }
    }

    setInterval(checkPageMediaChange, 1500);

    window.addEventListener("popstate", () => {
        lastKnownUrl = window.location.href;
        lastKnownTitle = document.title;
        notifyBackground();
    });

    document.addEventListener("yt-navigate-finish", () => {
        lastKnownUrl = window.location.href;
        lastKnownTitle = document.title;
        setTimeout(notifyBackground, 300);
    });

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request.action === "GET_VIDEO_INFO") {
            const info = getVideoInfo();
            sendResponse({ success: true, data: info });
            return true;
        }
    });
})();
