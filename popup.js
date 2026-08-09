// Universal Video Downloader - Popup Script

document.addEventListener("DOMContentLoaded", async () => {
    // UI Elements
    const videoTitleEl = document.getElementById("videoTitle");
    const platformBadgeEl = document.getElementById("platformBadge");
    const videoStatusBadgeEl = document.getElementById("videoStatusBadge");
    const videoThumbEl = document.getElementById("videoThumb");
    const thumbFallbackEl = document.getElementById("thumbFallback");
    const resolutionGridEl = document.getElementById("resolutionGrid");

    const statusDotEl = document.getElementById("statusDot");
    const statusTextEl = document.getElementById("statusText");

    const downloadBtn = document.getElementById("downloadBtn");
    const btnSpinner = document.getElementById("btnSpinner");
    const btnText = document.getElementById("btnText");

    const progressBox = document.getElementById("progressBox");
    const progressPercent = document.getElementById("progressPercent");
    const progressBarFill = document.getElementById("progressBarFill");
    const progressDetailText = document.getElementById("progressDetailText");
    const cancelBtn = document.getElementById("cancelBtn");

    const errorBanner = document.getElementById("errorBanner");
    const errorTextEl = document.getElementById("errorText");
    const errorCodeBadgeEl = document.getElementById("errorCodeBadge");
    const successBanner = document.getElementById("successBanner");

    // State Variables
    let activeTabUrl = "";
    let activeTabTitle = "";
    let activeDirectUrl = null;
    let activeMode = "video"; // 'video' or 'audio'
    let selectedQuality = "1080";
    let selectedFormat = "mp3";

    // Tab Navigation Wiring
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            tabPanels.forEach((p) => p.classList.remove("active"));

            btn.classList.add("active");
            const targetPanel = document.getElementById(btn.dataset.tab);
            if (targetPanel) targetPanel.classList.add("active");

            if (btn.dataset.tab === "audioTab") {
                activeMode = "audio";
                btnText.textContent =
                    "Download Audio (" + selectedFormat.toUpperCase() + ")";
            } else {
                activeMode = "video";
                btnText.textContent =
                    "Download Video (" + selectedQuality + "p)";
            }
            hideBanners();
        });
    });

    // Wire initial resolution chips
    bindResolutionChips();

    // Audio Format Chips Wiring
    const formatChips = document.querySelectorAll("[data-format]");
    formatChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            formatChips.forEach((c) => c.classList.remove("selected"));
            chip.classList.add("selected");
            selectedFormat = chip.dataset.format;
            if (activeMode === "audio") {
                btnText.textContent =
                    "Download Audio (" + selectedFormat.toUpperCase() + ")";
            }
        });
    });

    // Cancel Button Handler
    if (cancelBtn) {
        cancelBtn.addEventListener("click", async () => {
            try {
                cancelBtn.disabled = true;
                progressDetailText.textContent = "Cancelling download...";
                const res = await chrome.runtime.sendMessage({ action: "CANCEL_DOWNLOAD" });
                cancelBtn.disabled = false;
                setLoadingState(false);
                hideProgressBox();
                if (res && res.cancelled) {
                    showError("Download cancelled by user.", "CANCELLED");
                }
            } catch (e) {
                cancelBtn.disabled = false;
                setLoadingState(false);
                hideProgressBox();
            }
        });
    }

    // Restore active download session if downloading in background
    await syncDownloadSessionState();
    await checkServerStatus();
    await initActiveTab();

    // Listen for real-time background download updates
    if (chrome.storage?.session?.onChanged) {
        chrome.storage.session.onChanged.addListener((changes) => {
            if (changes.activeDownload) {
                const downloadState = changes.activeDownload.newValue;
                handleDownloadSessionUpdate(downloadState);
            }
        });
    }

    // Download Button Click Handler
    downloadBtn.addEventListener("click", async () => {
        if (downloadBtn.disabled) return;
        hideBanners();

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

        const payload = {
            url: activeTabUrl,
            title: activeTabTitle || null,
            directUrl: activeDirectUrl || null,
            downloadMode:
                activeMode === "audio"
                    ? "audio"
                    : document.getElementById("videoModeSelect")?.value ||
                      "auto",
            videoQuality: selectedQuality,
            audioFormat: selectedFormat,
            audioBitrate:
                document.getElementById("audioBitrateSelect")?.value || "128",
            filenameStyle: "basic",
        };

        setLoadingState(true, "Downloading in Background...");
        updateProgressBar(0, "Initializing download...");

        try {
            const response = await chrome.runtime.sendMessage({
                action: "DOWNLOAD_MEDIA",
                payload: payload,
            });

            setLoadingState(false);
            hideProgressBox();

            if (response && response.success) {
                showSuccess(response.data?.filename ? `🚀 Download completed: ${response.data.filename}` : "🚀 Download completed!");
            } else if (response && response.code === "CANCELLED") {
                showError("Download cancelled by user.", "CANCELLED");
            } else {
                const errMsg =
                    response?.error ||
                    "Download failed. Please check the video URL or local server status.";
                const errCode = response?.code || "DOWNLOAD_FAILED";
                showError(errMsg, errCode);
            }
        } catch (err) {
            setLoadingState(false);
            hideProgressBox();
            if (err.message && err.message.includes("cancelled")) {
                showError("Download cancelled by user.", "CANCELLED");
            } else {
                showError(
                    err.message ||
                        "Communication with extension service failed.",
                    "RUNTIME_ERROR",
                );
            }
        }
    });

    // --- Helper Functions ---
    function bindResolutionChips() {
        const qualityChips = document.querySelectorAll("[data-quality]");
        qualityChips.forEach((chip) => {
            chip.addEventListener("click", () => {
                qualityChips.forEach((c) => c.classList.remove("selected"));
                chip.classList.add("selected");
                selectedQuality = chip.dataset.quality;
                if (activeMode === "video") {
                    btnText.textContent =
                        "Download Video (" + selectedQuality + "p)";
                }
            });
        });
    }

    function renderDynamicResolutions(heights) {
        if (!resolutionGridEl || !Array.isArray(heights) || heights.length === 0) return;

        const sortedHeights = heights.filter(h => typeof h === "number" && h > 0).sort((a, b) => b - a);
        if (sortedHeights.length === 0) return;

        resolutionGridEl.innerHTML = "";

        sortedHeights.forEach((h, index) => {
            const btn = document.createElement("button");
            btn.className = `chip-btn ${index === 0 ? "selected" : ""}`;
            btn.dataset.quality = String(h);

            let labelHtml = `${h}p`;
            if (h >= 2160) {
                labelHtml = `4K <span class="chip-badge">2160p</span>`;
            } else if (h === 1080) {
                labelHtml = `1080p <span class="chip-badge">HD</span>`;
            }

            btn.innerHTML = labelHtml;
            resolutionGridEl.appendChild(btn);
        });

        selectedQuality = String(sortedHeights[0]);
        if (activeMode === "video") {
            btnText.textContent = "Download Video (" + selectedQuality + "p)";
        }

        bindResolutionChips();
    }

    async function syncDownloadSessionState() {
        try {
            const response = await chrome.runtime.sendMessage({ action: "GET_DOWNLOAD_STATUS" });
            if (response && response.success && response.data) {
                handleDownloadSessionUpdate(response.data);
            }
        } catch (e) {
            // Ignore
        }
    }

    function handleDownloadSessionUpdate(downloadState) {
        if (!downloadState) return;

        if (downloadState.status === "processing") {
            setLoadingState(true, "Downloading in Background...");
            updateProgressBar(downloadState.percent || 0, downloadState.progressText || "Downloading...");
        } else if (downloadState.status === "completed") {
            setLoadingState(false);
            hideProgressBox();
            if (Date.now() - (downloadState.timestamp || 0) < 15000) {
                showSuccess(`🚀 Download completed: ${downloadState.filename || "file"}`);
            }
        } else if (downloadState.status === "cancelled") {
            setLoadingState(false);
            hideProgressBox();
            if (Date.now() - (downloadState.timestamp || 0) < 15000) {
                showError("Download cancelled by user.", "CANCELLED");
            }
        } else if (downloadState.status === "error") {
            setLoadingState(false);
            hideProgressBox();
            if (Date.now() - (downloadState.timestamp || 0) < 15000) {
                showError(downloadState.error || "Download failed", downloadState.code || "ERR");
            }
        }
    }

    function updateProgressBar(percent, detailText) {
        if (!progressBox) return;
        const clampedPct = Math.min(100, Math.max(0, parseInt(percent) || 0));
        progressBarFill.style.width = `${clampedPct}%`;
        progressPercent.textContent = `${clampedPct}%`;
        progressDetailText.textContent = detailText || `Downloading ${clampedPct}%...`;
        progressBox.style.display = "block";
    }

    function hideProgressBox() {
        if (progressBox) progressBox.style.display = "none";
    }

    async function initActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (!tab || !tab.url) {
                renderNoTabState();
                return;
            }

            activeTabUrl = tab.url;
            activeTabTitle = tab.title || "Detected Video";

            if (
                activeTabUrl.startsWith("chrome://") ||
                activeTabUrl.startsWith("chrome-extension://") ||
                activeTabUrl.startsWith("about:")
            ) {
                renderRestrictedPageState();
                return;
            }

            chrome.tabs.sendMessage(
                tab.id,
                { action: "GET_VIDEO_INFO" },
                (response) => {
                    if (
                        chrome.runtime.lastError ||
                        !response ||
                        !response.success
                    ) {
                        renderTabMetadata(activeTabTitle, activeTabUrl, null);
                    } else {
                        const data = response.data;
                        if (data.url) activeTabUrl = data.url;
                        if (data.directUrl) activeDirectUrl = data.directUrl;
                        renderTabMetadata(
                            data.title || activeTabTitle,
                            data.url || activeTabUrl,
                            data.thumbnail,
                            data.platform,
                        );
                    }
                },
            );

            chrome.runtime.sendMessage(
                { action: "FETCH_MEDIA_INFO", url: activeTabUrl },
                (res) => {
                    if (res && res.success && res.data) {
                        if (res.data.heights && res.data.heights.length > 0) {
                            renderDynamicResolutions(res.data.heights);
                        }
                        if (res.data.title && (!activeTabTitle || activeTabTitle === "Detected Video")) {
                            videoTitleEl.textContent = res.data.title;
                        }
                        if (res.data.thumbnail) {
                            videoThumbEl.src = res.data.thumbnail;
                            videoThumbEl.style.display = "block";
                            thumbFallbackEl.style.display = "none";
                        }
                    }
                }
            );

        } catch (err) {
            console.error("Error initializing tab:", err);
            renderNoTabState();
        }
    }

    function renderTabMetadata(title, url, thumbnail, platform) {
        videoTitleEl.textContent = title || "Detected Media";
        const detectedPlatform = platform || detectPlatformFromUrl(url);
        platformBadgeEl.textContent = detectedPlatform;

        if (thumbnail) {
            videoThumbEl.src = thumbnail;
            videoThumbEl.style.display = "block";
            thumbFallbackEl.style.display = "none";
        } else {
            videoThumbEl.style.display = "none";
            thumbFallbackEl.style.display = "flex";
        }

        videoStatusBadgeEl.innerHTML = `<span class="pulse-dot"></span> Active`;
        downloadBtn.disabled = false;
    }

    function renderRestrictedPageState() {
        videoTitleEl.textContent = "Browser Internal Page";
        platformBadgeEl.textContent = "Unsupported";
        videoStatusBadgeEl.innerHTML = `Not Available`;
        downloadBtn.disabled = true;
        showError(
            "Open a video page on YouTube, TikTok, Facebook, Instagram, Twitter, etc. to start downloading.",
            "PAGE_UNSUPPORTED",
        );
    }

    function renderNoTabState() {
        videoTitleEl.textContent = "No active tab detected";
        platformBadgeEl.textContent = "N/A";
        downloadBtn.disabled = true;
    }

    function detectPlatformFromUrl(urlStr) {
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
        } catch (e) {
            return "Web Video";
        }
    }

    async function checkServerStatus() {
        try {
            const res = await chrome.runtime.sendMessage({
                action: "PING_SERVER",
            });
            if (res && res.online) {
                statusDotEl.classList.remove("offline");
                statusTextEl.textContent = "Engine Ready";
            } else {
                statusDotEl.classList.add("offline");
                statusTextEl.textContent = "Engine Offline";
            }
        } catch (e) {
            statusDotEl.classList.add("offline");
            statusTextEl.textContent = "Engine Offline";
        }
    }

    function setLoadingState(isLoading, customText) {
        downloadBtn.disabled = isLoading;
        if (isLoading) {
            btnSpinner.style.display = "inline-block";
            btnText.textContent = customText || "Processing Media...";
        } else {
            btnSpinner.style.display = "none";
            btnText.textContent =
                activeMode === "audio"
                    ? "Download Audio (" + selectedFormat.toUpperCase() + ")"
                    : "Download Video (" + selectedQuality + "p)";
        }
    }

    function showError(message, code) {
        errorTextEl.textContent = message;
        errorCodeBadgeEl.textContent = code ? `CODE: ${code}` : "";
        errorBanner.style.display = "block";
        successBanner.style.display = "none";
    }

    function showSuccess(message) {
        if (message) successBanner.textContent = message;
        successBanner.style.display = "block";
        errorBanner.style.display = "none";
        setTimeout(() => {
            successBanner.style.display = "none";
        }, 5000);
    }

    function hideBanners() {
        errorBanner.style.display = "none";
        successBanner.style.display = "none";
    }
});
