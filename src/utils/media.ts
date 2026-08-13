import type { MediaInfoData } from "../types/extension";

export function normalizeMediaUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        if (host.includes("youtube.com") || host.includes("youtu.be")) {
            let videoId: string | null = null;
            if (host.includes("youtu.be")) {
                videoId = parsed.pathname.slice(1).split("/")[0] || null;
            } else if (parsed.pathname.startsWith("/shorts/")) {
                videoId = parsed.pathname.split("/")[2] || null;
            } else if (parsed.pathname.startsWith("/embed/")) {
                videoId = parsed.pathname.split("/")[2] || null;
            } else {
                videoId = parsed.searchParams.get("v");
            }
            if (videoId) return `youtube:${videoId}`;
        }

        parsed.hash = "";
        parsed.searchParams.delete("t");
        parsed.searchParams.delete("start");
        return parsed.toString();
    } catch {
        return url;
    }
}

export function mergeMediaInfo(
    ...sources: Array<MediaInfoData | null | undefined>
): MediaInfoData {
    const merged: MediaInfoData = {};
    for (const source of sources) {
        if (!source) continue;
        if (source.title) merged.title = source.title;
        if (source.thumbnail) merged.thumbnail = source.thumbnail;
        if (source.heights && source.heights.length > 0) {
            merged.heights = source.heights;
        }
    }
    return merged;
}

export const MEDIA_INFO_CACHE_KEY = "mediaInfoCache";
export const MEDIA_INFO_CACHE_TTL_MS = 10 * 60 * 1000;

export interface CachedMediaInfoEntry {
    data: MediaInfoData;
    timestamp: number;
}

export type MediaInfoCache = Record<string, CachedMediaInfoEntry>;
