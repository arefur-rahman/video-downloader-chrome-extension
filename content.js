// Cobalt Universal Video Downloader - Content Script
// Detects video playback, metadata, and platform across websites.

(function () {
    // Avoid double initialization
    if (window.__cobaltVideoDetectorLoaded) return;
    window.__cobaltVideoDetectorLoaded = true;

    let isVideoPlaying = false;
    let detectedVideoElement = null;

    function detectPlatform(hostname) {
        const host = hostname.toLowerCase();
        if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
        if (host.includes("tiktok.com")) return "TikTok";
        if (host.includes("facebook.com") || host.includes("fb.watch")) return "Facebook";
        if (host.includes("instagram.com")) return "Instagram";
        if (host.includes("twitter.com") || host.includes("x.com")) return "Twitter/X";
        if (host.includes("vimeo.com")) return "Vimeo";
        if (host.includes("reddit.com")) return "Reddit";
        if (host.includes("dailymotion.com")) return "Dailymotion";
        if (host.includes("pinterest.com")) return "Pinterest";
        if (host.includes("twitch.tv")) return "Twitch";
        if (host.includes("soundcloud.com")) return "SoundCloud";
        return "Web Video";
    }

    function cleanTitle(rawTitle) {
        if (!rawTitle) return "Detected Media";
        // Remove badge notification counters like "(3) Video Title"
        return rawTitle.replace(/^\(\d+\)\s*/, "").trim();
    }

    function getThumbnail() {
        try {
            const ogImage = document.querySelector('meta[property="og:image"]')?.content ||
                            document.querySelector('meta[name="twitter:image"]')?.content;
            if (ogImage) return ogImage;

            // YouTube fallback thumbnail from URL
            const ytMatch = window.location.href.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (ytMatch && ytMatch[1]) {
                return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
            }
        } catch (err) {
            console.debug("[Cobalt Ext] Error resolving thumbnail:", err);
        }
        return null;
    }

    function extractFacebookMedia(activeVideo) {
        let directUrl = null;
        let hdUrl = null;
        let sdUrl = null;
        let fbPermalink = null;

        function isVideoUrl(url) {
            if (!url || typeof url !== "string" || !url.startsWith("http")) return false;
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
                    for (const s of sources) {
                        if (isVideoUrl(s.src)) {
                            directUrl = s.src;
                            break;
                        }
                    }
                }

                // Find closest article / dialog permalink link
                const container = activeVideo.closest('[role="article"], [role="dialog"], div[data-pagelet*="Feed"], div[data-pagelet*="Reel"]') || document.body;
                const link = container.querySelector('a[href*="/reel/"], a[href*="/reels/"], a[href*="/watch/"], a[href*="/videos/"], a[href*="fb.watch"]');
                if (link && link.href) {
                    fbPermalink = link.href;
                }
            }

            // 2. Inspect Performance Timeline for active video CDN requests made by Chrome
            if (!directUrl && window.performance && typeof window.performance.getEntriesByType === "function") {
                const resources = window.performance.getEntriesByType("resource");
                for (let i = resources.length - 1; i >= 0; i--) {
                    const r = resources[i];
                    const rUrl = r.name || "";
                    if (rUrl.includes("fbcdn.net") && isVideoUrl(rUrl)) {
                        // Strip byte range parameters to get full video file URL
                        directUrl = rUrl.replace(/([?&])(bytestart|byteend)=\d+&?/g, "$1").replace(/[?&]$/, "");
                        break;
                    }
                }
            }

            // 3. Scan script elements for JSON video attributes
            if (!directUrl) {
                const scripts = Array.from(document.querySelectorAll("script"));
                for (const script of scripts) {
                    const text = script.textContent || "";
                    if (!text.includes("playable_url") && !text.includes("hd_src") && !text.includes("browser_native") && !text.includes("video_id")) continue;

                    const hdM = text.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/) ||
                                text.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) ||
                                text.match(/"hd_src"\s*:\s*"([^"]+)"/);
                    if (hdM && hdM[1]) hdUrl = hdM[1].replace(/\\/g, "");

                    const sdM = text.match(/"playable_url"\s*:\s*"([^"]+)"/) ||
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
                const hdMatch = html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/) ||
                                html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) ||
                                html.match(/"hd_src"\s*:\s*"([^"]+)"/);
                if (hdMatch && hdMatch[1]) hdUrl = hdMatch[1].replace(/\\/g, "");

                const sdMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/) ||
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
                const ogVideo = document.querySelector('meta[property="og:video"]')?.content ||
                                document.querySelector('meta[property="og:video:url"]')?.content ||
                                document.querySelector('meta[property="og:video:secure_url"]')?.content;
                if (ogVideo && isVideoUrl(ogVideo)) {
                    directUrl = ogVideo;
                }
            }
        } catch (e) {
            console.debug("[Facebook Extractor Error]", e);
        }

        return {
            directUrl: directUrl || null,
            hdUrl: hdUrl || null,
            sdUrl: sdUrl || null,
            permalink: fbPermalink || null
        };
    }

    function getVideoInfo() {
        try {
            const videos = Array.from(document.querySelectorAll("video"));
            let activeVideo = videos.find(v => !v.paused && !v.ended && v.readyState > 2);
            if (!activeVideo && videos.length > 0) {
                activeVideo = videos[0];
            }

            detectedVideoElement = activeVideo || null;
            const playing = !!(activeVideo && !activeVideo.paused && !activeVideo.ended && activeVideo.currentTime > 0);
            const hasVideoTag = videos.length > 0;

            const platform = detectPlatform(window.location.hostname);
            let title = cleanTitle(document.title);
            let url = window.location.href;
            let thumbnail = getThumbnail();
            let directUrl = null;

            if (platform === "Facebook") {
                const fbMedia = extractFacebookMedia(activeVideo);
                if (fbMedia.permalink && (!url.includes("/reel/") && !url.includes("/videos/"))) {
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
                timestamp: Date.now()
            };
        } catch (err) {
            console.error("[Cobalt Ext] Error gathering video info:", err);
            return {
                hasVideo: false,
                isPlaying: false,
                title: cleanTitle(document.title),
                url: window.location.href,
                platform: detectPlatform(window.location.hostname),
                thumbnail: null,
                error: err.message
            };
        }
    }

    function notifyBackground() {
        try {
            const info = getVideoInfo();
            const stateChanged = (info.isPlaying !== isVideoPlaying);
            isVideoPlaying = info.isPlaying;

            chrome.runtime.sendMessage({
                action: "MEDIA_STATE_UPDATED",
                data: info
            }).catch(() => {
                // Ignore disconnect errors when extension context reloads
            });
        } catch (err) {
            console.debug("[Cobalt Ext] Could not notify background:", err);
        }
    }

    // Attach listeners to video elements
    function attachVideoListeners() {
        try {
            const videos = document.querySelectorAll("video");
            videos.forEach(v => {
                if (!v.__cobaltListenersAttached) {
                    v.__cobaltListenersAttached = true;
                    v.addEventListener("play", notifyBackground, { passive: true });
                    v.addEventListener("pause", notifyBackground, { passive: true });
                    v.addEventListener("ended", notifyBackground, { passive: true });
                    v.addEventListener("playing", notifyBackground, { passive: true });
                }
            });
        } catch (e) {
            // Ignore cross-origin frame restriction errors
        }
    }

    // Monitor DOM mutations for dynamically inserted video elements
    const observer = new MutationObserver(() => {
        attachVideoListeners();
    });

    try {
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    } catch (e) {}

    // Initial check
    attachVideoListeners();
    setTimeout(notifyBackground, 1000);

    // Listen for requests from Popup or Background Script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "GET_VIDEO_INFO") {
            const info = getVideoInfo();
            sendResponse({ success: true, data: info });
            return true;
        }
    });
})();
