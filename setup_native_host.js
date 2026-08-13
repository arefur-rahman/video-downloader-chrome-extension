import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST_NAME = "com.videodownloader.yt_dlp";

// Automatically calculate Extension ID from manifest.json key if present, fallback to default
function getExtensionId() {
    try {
        const manifestPath = path.join(__dirname, "public", "manifest.json");
        const rootManifestPath = path.join(__dirname, "manifest.json");
        const targetManifest = fs.existsSync(manifestPath)
            ? manifestPath
            : fs.existsSync(rootManifestPath)
              ? rootManifestPath
              : null;

        if (targetManifest) {
            const extManifest = JSON.parse(
                fs.readFileSync(targetManifest, "utf8"),
            );
            if (extManifest.key) {
                const pubKeyBuffer = Buffer.from(extManifest.key, "base64");
                const hash = crypto
                    .createHash("sha256")
                    .update(pubKeyBuffer)
                    .digest("hex");
                return hash
                    .slice(0, 32)
                    .split("")
                    .map((c) => String.fromCharCode(parseInt(c, 16) + 97))
                    .join("");
            }
        }
    } catch (e) {}
    return "mmomedlkkgpfdmfhdpigjamlbdmpcdon";
}

const EXTENSION_ID = getExtensionId();

const isWin = process.platform === "win32";
const HOST_PATH = isWin
    ? path.join(__dirname, "run-native-host.bat")
    : path.join(__dirname, "run-native-host.sh");

const manifest = {
    name: HOST_NAME,
    description: "Native Messaging Host for Universal Video Downloader",
    path: HOST_PATH,
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
};

let chromeHostDir;
if (process.platform === "darwin") {
    chromeHostDir = path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "NativeMessagingHosts",
    );
} else if (process.platform === "linux") {
    chromeHostDir = path.join(
        os.homedir(),
        ".config",
        "google-chrome",
        "NativeMessagingHosts",
    );
} else if (isWin) {
    chromeHostDir = path.join(__dirname, "manifests");
} else {
    chromeHostDir = __dirname;
}

if (!fs.existsSync(chromeHostDir)) {
    fs.mkdirSync(chromeHostDir, { recursive: true });
}

const targetPath = path.join(chromeHostDir, `${HOST_NAME}.json`);
fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2));

console.log(
    `[Native Host Setup] Registered host manifest at:\n  ${targetPath}`,
);

if (isWin) {
    try {
        const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
        execSync(`reg add "${regKey}" /ve /d "${targetPath}" /f`);
        console.log(
            `[Native Host Setup] Windows Registry key added:\n  ${regKey}`,
        );
    } catch (e) {
        console.error(
            "[Native Host Setup] Failed to register Windows Registry key:",
            e.message,
        );
    }
}
