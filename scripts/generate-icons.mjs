import { Buffer } from "node:buffer";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const iconDir = resolve("src-tauri/icons");
const iconsetDir = resolve(".dev-data/multiserial.iconset");

function main() {
  mkdirSync(iconDir, { recursive: true });
  rmSync(iconsetDir, { recursive: true, force: true });
  mkdirSync(iconsetDir, { recursive: true });

  const pngs = new Map();

  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    pngs.set(size, encodePng(size, size, renderIcon(size)));
  }

  writeIcon("icon.png", pngs.get(512));
  writeIcon("32x32.png", pngs.get(32));
  writeIcon("128x128.png", pngs.get(128));
  writeIcon("128x128@2x.png", pngs.get(256));
  writeIcon(
    "icon.ico",
    encodeIco([
      { size: 16, data: pngs.get(16) },
      { size: 32, data: pngs.get(32) },
      { size: 48, data: pngs.get(48) },
      { size: 256, data: pngs.get(256) }
    ])
  );
  writeIcon("icon.icns", encodeIcns(pngs));

  writeIconset("icon_16x16.png", pngs.get(16));
  writeIconset("icon_16x16@2x.png", pngs.get(32));
  writeIconset("icon_32x32.png", pngs.get(32));
  writeIconset("icon_32x32@2x.png", pngs.get(64));
  writeIconset("icon_128x128.png", pngs.get(128));
  writeIconset("icon_128x128@2x.png", pngs.get(256));
  writeIconset("icon_256x256.png", pngs.get(256));
  writeIconset("icon_256x256@2x.png", pngs.get(512));
  writeIconset("icon_512x512.png", pngs.get(512));
  writeIconset("icon_512x512@2x.png", pngs.get(1024));
}

function writeIcon(name, buffer) {
  writeFileSync(resolve(iconDir, name), buffer);
}

function writeIconset(name, buffer) {
  const path = resolve(iconsetDir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      setPixel(pixels, size, x, y, 0, 0, 0, 0);
    }
  }

  const radius = size * 0.2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!insideRoundRect(x + 0.5, y + 0.5, 0, 0, size, size, radius)) {
        continue;
      }

      const gx = x / Math.max(1, size - 1);
      const gy = y / Math.max(1, size - 1);
      const r = Math.round(16 + gx * 12 + gy * 4);
      const g = Math.round(42 + gx * 94 + gy * 38);
      const b = Math.round(67 + gx * 68 + gy * 92);
      setPixel(pixels, size, x, y, r, g, b, 255);
    }
  }

  rect(
    pixels,
    size,
    size * 0.15,
    size * 0.18,
    size * 0.7,
    size * 0.64,
    [8, 20, 32, 230],
    size * 0.07
  );
  rect(
    pixels,
    size,
    size * 0.15,
    size * 0.18,
    size * 0.7,
    size * 0.13,
    [231, 245, 244, 235],
    size * 0.07
  );

  for (const offset of [0.22, 0.29, 0.36]) {
    circle(
      pixels,
      size,
      size * offset,
      size * 0.245,
      Math.max(1.2, size * 0.018),
      [15, 118, 110, 255]
    );
  }

  line(
    pixels,
    size,
    size * 0.25,
    size * 0.48,
    size * 0.34,
    size * 0.55,
    size * 0.045,
    [125, 211, 252, 255]
  );
  line(
    pixels,
    size,
    size * 0.25,
    size * 0.62,
    size * 0.34,
    size * 0.55,
    size * 0.045,
    [125, 211, 252, 255]
  );
  line(
    pixels,
    size,
    size * 0.42,
    size * 0.65,
    size * 0.63,
    size * 0.65,
    size * 0.04,
    [249, 250, 251, 245]
  );

  for (const y of [0.43, 0.54, 0.65]) {
    circle(pixels, size, size * 0.18, size * y, Math.max(1.1, size * 0.014), [45, 212, 191, 255]);
    circle(pixels, size, size * 0.82, size * y, Math.max(1.1, size * 0.014), [45, 212, 191, 255]);
  }

  line(
    pixels,
    size,
    size * 0.18,
    size * 0.43,
    size * 0.82,
    size * 0.65,
    size * 0.018,
    [45, 212, 191, 190]
  );
  line(
    pixels,
    size,
    size * 0.18,
    size * 0.65,
    size * 0.82,
    size * 0.43,
    size * 0.018,
    [14, 165, 233, 190]
  );

  return pixels;
}

function rect(pixels, size, x, y, width, height, color, radius = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + width);
  const y1 = Math.ceil(y + height);

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      if (px < 0 || py < 0 || px >= size || py >= size) {
        continue;
      }
      if (radius > 0 && !insideRoundRect(px + 0.5, py + 0.5, x, y, width, height, radius)) {
        continue;
      }
      blendPixel(pixels, size, px, py, color);
    }
  }
}

function circle(pixels, size, cx, cy, radius, color) {
  const x0 = Math.floor(cx - radius);
  const y0 = Math.floor(cy - radius);
  const x1 = Math.ceil(cx + radius);
  const y1 = Math.ceil(cy + radius);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
}

function line(pixels, size, x0, y0, x1, y1, width, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  const radius = width / 2;
  const minX = Math.floor(Math.min(x0, x1) - radius);
  const maxX = Math.ceil(Math.max(x0, x1) + radius);
  const minY = Math.floor(Math.min(y0, y1) - radius);
  const maxY = Math.ceil(Math.max(y0, y1) + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(
        0,
        Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / lengthSquared)
      );
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const distanceSquared = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
      if (distanceSquared <= radius * radius) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
}

function insideRoundRect(px, py, x, y, width, height, radius) {
  const nx = Math.max(x + radius, Math.min(px, x + width - radius));
  const ny = Math.max(y + radius, Math.min(py, y + height - radius));
  return (px - nx) ** 2 + (py - ny) ** 2 <= radius * radius;
}

function setPixel(pixels, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const index = (y * size + x) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = a;
}

function blendPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const index = (y * size + x) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  pixels[index] = Math.round(color[0] * alpha + pixels[index] * inverse);
  pixels[index + 1] = Math.round(color[1] * alpha + pixels[index + 1] * inverse);
  pixels[index + 2] = Math.round(color[2] * alpha + pixels[index + 2] * inverse);
  pixels[index + 3] = Math.round(color[3] + pixels[index + 3] * inverse);
}

function encodePng(width, height, rgba) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([
    u32(data.length),
    typeBuffer,
    data,
    u32(crc32(Buffer.concat([typeBuffer, data])))
  ]);
}

function encodeIco(images) {
  let offset = 6 + images.length * 16;
  const header = Buffer.alloc(offset);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = image.size === 256 ? 0 : image.size;
    header[entry + 1] = image.size === 256 ? 0 : image.size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

function encodeIcns(pngs) {
  const chunks = [
    ["icp4", pngs.get(16)],
    ["icp5", pngs.get(32)],
    ["icp6", pngs.get(64)],
    ["ic07", pngs.get(128)],
    ["ic08", pngs.get(256)],
    ["ic09", pngs.get(512)],
    ["ic10", pngs.get(1024)]
  ].map(([type, data]) => {
    const typeBuffer = Buffer.from(type, "ascii");
    return Buffer.concat([typeBuffer, u32(data.length + 8), data]);
  });
  const payload = Buffer.concat(chunks);

  return Buffer.concat([Buffer.from("icns", "ascii"), u32(payload.length + 8), payload]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let index = 0; index < 8; index += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

main();
