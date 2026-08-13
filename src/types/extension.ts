export interface VideoInfo {
    hasVideo: boolean;
    isPlaying: boolean;
    title: string;
    url: string;
    directUrl?: string | null;
    platform: string;
    thumbnail?: string | null;
    heights?: number[];
    timestamp?: number;
    error?: string;
}

export interface DownloadRequestPayload {
    url: string;
    title?: string | null;
    directUrl?: string | null;
    downloadMode?: "auto" | "audio" | "mute";
    videoQuality?: string;
    audioFormat?: string;
    audioBitrate?: string;
    filenameStyle?: string;
}

export interface ActiveDownloadState {
    status: "processing" | "completed" | "cancelled" | "error";
    percent?: number;
    progressText?: string;
    filename?: string;
    filepath?: string;
    error?: string;
    code?: string;
    timestamp?: number;
    payload?: DownloadRequestPayload;
    startTime?: number;
}

export interface MediaInfoData {
    title?: string | null;
    thumbnail?: string | null;
    heights?: number[];
}

export interface MediaInfoResponse {
    success: boolean;
    data?: MediaInfoData;
    error?: string;
}

export interface DownloadResponse {
    success: boolean;
    data?: {
        status: string;
        filename?: string;
        filepath?: string;
    };
    cancelled?: boolean;
    error?: string;
    code?: string;
}

export interface ServerPingResponse {
    success: boolean;
    online: boolean;
    engine: string;
}
