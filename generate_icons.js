const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height) {
    const buffer = Buffer.alloc(width * height * 4);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2 - 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius) {
                // Vibrant Cobalt Gradient (Blue/Purple to Indigo)
                const t = y / height;
                buffer[idx] = Math.round(79 + (147 - 79) * t);       // R
                buffer[idx + 1] = Math.round(70 + (51 - 70) * t);    // G
                buffer[idx + 2] = Math.round(229 + (234 - 229) * t); // B
                buffer[idx + 3] = 255;                               // Alpha

                const relX = Math.abs(x - centerX);
                const stemWidth = Math.max(1, Math.floor(width * 0.12));
                const topY = height * 0.25;
                const midY = height * 0.55;
                const bottomY = height * 0.75;

                // Download stem
                if (relX <= stemWidth && y >= topY && y <= midY) {
                    buffer[idx] = 255; buffer[idx + 1] = 255; buffer[idx + 2] = 255;
                }
                // Arrowhead
                if (y >= midY && y <= bottomY - height * 0.08) {
                    const progress = (y - midY) / (bottomY - height * 0.08 - midY);
                    const currentWidth = (width * 0.3) * (1 - progress);
                    if (relX <= currentWidth) {
                        buffer[idx] = 255; buffer[idx + 1] = 255; buffer[idx + 2] = 255;
                    }
                }
                // Bottom bar
                if (y >= bottomY && y <= bottomY + Math.max(1, height * 0.08) && relX <= width * 0.3) {
                    buffer[idx] = 255; buffer[idx + 1] = 255; buffer[idx + 2] = 255;
                }
            } else {
                buffer[idx] = 0; buffer[idx + 1] = 0; buffer[idx + 2] = 0; buffer[idx + 3] = 0;
            }
        }
    }

    const rawData = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        rawData[y * (width * 4 + 1)] = 0;
        buffer.copy(rawData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }

    const compressed = zlib.deflateSync(rawData);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const ihdrChunk = createChunk('IHDR', ihdr);
    const idatChunk = createChunk('IDAT', compressed);
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);

    const checkBuf = Buffer.concat([typeBuf, data]);
    const crc = crc32(checkBuf);
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[n] = c;
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
    const png = createPNG(size, size);
    fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
    console.log(`Generated icons/icon-${size}.png`);
});
