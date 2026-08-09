const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const crypto = require('crypto');

const HOST_NAME = 'com.videodownloader.yt_dlp';

// Automatically calculate Extension ID from manifest.json key if present, fallback to default
function getExtensionId() {
    try {
        const manifestPath = path.join(__dirname, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const extManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (extManifest.key) {
                const pubKeyBuffer = Buffer.from(extManifest.key, 'base64');
                const hash = crypto.createHash('sha256').update(pubKeyBuffer).digest('hex');
                return hash.slice(0, 32).split('').map(c => String.fromCharCode(parseInt(c, 16) + 97)).join('');
            }
        }
    } catch (e) {}
    return 'mmomedlkkgpfdmfhdpigjamlbdmpcdon';
}

const EXTENSION_ID = getExtensionId();

const isWin = process.platform === 'win32';
const HOST_PATH = isWin
    ? path.join(__dirname, 'run-native-host.bat')
    : path.join(__dirname, 'run-native-host.sh');

const manifest = {
    name: HOST_NAME,
    description: "Native Messaging Host for Universal Video Downloader",
    path: HOST_PATH,
    type: "stdio",
    allowed_origins: [
        `chrome-extension://${EXTENSION_ID}/`
    ]
};

let chromeHostDir;
if (process.platform === 'darwin') {
    chromeHostDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
} else if (process.platform === 'linux') {
    chromeHostDir = path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts');
} else if (isWin) {
    chromeHostDir = path.join(__dirname, 'manifests');
} else {
    chromeHostDir = __dirname;
}

if (!fs.existsSync(chromeHostDir)) {
    fs.mkdirSync(chromeHostDir, { recursive: true });
}

const targetPath = path.join(chromeHostDir, `${HOST_NAME}.json`);
fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2));

console.log(`[Native Host Setup] Registered host manifest at:\n  ${targetPath}`);

if (isWin) {
    try {
        const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
        execSync(`reg add "${regKey}" /ve /d "${targetPath}" /f`);
        console.log(`[Native Host Setup] Windows Registry key added:\n  ${regKey}`);
    } catch (e) {
        console.error('[Native Host Setup] Failed to register Windows Registry key:', e.message);
    }
}
