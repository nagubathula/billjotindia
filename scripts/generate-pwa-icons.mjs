import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "public", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type None
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function inRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const rxLeft = left + radius;
  const rxRight = right - radius;
  const ryTop = top + radius;
  const ryBottom = bottom - radius;

  if (x >= rxLeft && x <= rxRight) return true;
  if (y >= ryTop && y <= ryBottom) return true;

  const cx = x < rxLeft ? rxLeft : rxRight;
  const cy = y < ryTop ? ryTop : ryBottom;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function inPill(x, y, left, top, right, bottom) {
  const radius = (bottom - top) / 2;
  return inRoundedRect(x, y, left, top, right, bottom, radius);
}

function sampleColor(nx, ny, { rounded, emblemScale }) {
  // Background squircle or full bleed
  if (rounded && !inRoundedRect(nx, ny, 0, 0, 1, 1, 0.21875)) {
    return [0, 0, 0, 0];
  }

  // Diagonal emerald gradient: #10b981 -> #059669 -> #047857
  const t = Math.min(1, Math.max(0, (nx + ny) * 0.5));
  let bgR;
  let bgG;
  let bgB;
  if (t < 0.55) {
    const k = t / 0.55;
    bgR = 16 + (5 - 16) * k;
    bgG = 185 + (150 - 185) * k;
    bgB = 129 + (105 - 129) * k;
  } else {
    const k = (t - 0.55) / 0.45;
    bgR = 5 + (4 - 5) * k;
    bgG = 150 + (120 - 150) * k;
    bgB = 105 + (87 - 105) * k;
  }

  // Transform coordinates into scaled centered emblem space [0..1]
  const ex = (nx - 0.5) / emblemScale + 0.5;
  const ey = (ny - 0.5) / emblemScale + 0.5;

  // Receipt outline matches icon.svg (scaled to 512px reference):
  // x in [124/512=0.2422, 388/512=0.7578] -> rounded top corners
  // y in [102/512=0.1992, 404/512=0.7891], bottom zig-zag teeth between 0.7383 and 0.7891
  const rLeft = 124 / 512;
  const rRight = 388 / 512;
  const rTop = 102 / 512;
  const rBottom = 404 / 512;
  const rNotch = 378 / 512;
  const rRadius = 26 / 512;

  let insideReceipt = false;
  if (ex >= rLeft && ex <= rRight && ey >= rTop && ey <= rBottom) {
    if (ey <= rNotch) {
      // Upper body with rounded top corners
      if (ey < rTop + rRadius && (ex < rLeft + rRadius || ex > rRight - rRadius)) {
        const cx = ex < rLeft + rRadius ? rLeft + rRadius : rRight - rRadius;
        const cy = rTop + rRadius;
        const dx = ex - cx;
        const dy = ey - cy;
        insideReceipt = dx * dx + dy * dy <= rRadius * rRadius;
      } else {
        insideReceipt = true;
      }
    } else {
      // Bottom 4 scalloped zig-zag teeth
      const teethCount = 4;
      const u = ((ex - rLeft) / (rRight - rLeft)) * teethCount;
      const frac = u - Math.floor(u);
      const toothEdge = 1 - Math.abs(2 * frac - 1); // 0 at tooth tip (outer/middle), 1 at notch
      const maxY = rBottom - toothEdge * (rBottom - rNotch);
      insideReceipt = ey <= maxY;
    }
  }

  if (!insideReceipt) {
    return [bgR, bgG, bgB, 255];
  }

  // Inside white receipt (#ffffff) with emerald accent lines
  // Row 1 bar: x [174..286], y [168..192]
  if (inPill(ex, ey, 174 / 512, 168 / 512, 286 / 512, 192 / 512)) {
    return [5, 150, 105, 255];
  }
  // Row 1 dot: cx 324, cy 180, r 14
  {
    const dx = ex - 324 / 512;
    const dy = ey - 180 / 512;
    const dr = 14 / 512;
    if (dx * dx + dy * dy <= dr * dr) {
      return [16, 185, 129, 255];
    }
  }
  // Row 2 bar: x [174..338], y [228..252]
  if (inPill(ex, ey, 174 / 512, 228 / 512, 338 / 512, 252 / 512)) {
    return [18, 158, 114, 255];
  }
  // Row 3 bar: x [174..302], y [288..312]
  if (inPill(ex, ey, 174 / 512, 288 / 512, 302 / 512, 312 / 512)) {
    return [68, 178, 141, 255];
  }

  return [255, 255, 255, 255];
}

function renderIcon(size, options) {
  const rgba = Buffer.alloc(size * size * 4);
  const subSamples = 4;
  const weight = 1 / (subSamples * subSamples);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let sy = 0; sy < subSamples; sy += 1) {
        const ny = (y + (sy + 0.5) / subSamples) / size;
        for (let sx = 0; sx < subSamples; sx += 1) {
          const nx = (x + (sx + 0.5) / subSamples) / size;
          const [r, g, b, a] = sampleColor(nx, ny, options);
          const alphaNorm = a / 255;
          rAcc += r * alphaNorm * weight;
          gAcc += g * alphaNorm * weight;
          bAcc += b * alphaNorm * weight;
          aAcc += a * weight;
        }
      }

      const idx = (y * size + x) * 4;
      const outA = Math.round(aAcc);
      if (outA > 0) {
        const invAlpha = 255 / aAcc;
        rgba[idx] = Math.min(255, Math.max(0, Math.round(rAcc * invAlpha)));
        rgba[idx + 1] = Math.min(255, Math.max(0, Math.round(gAcc * invAlpha)));
        rgba[idx + 2] = Math.min(255, Math.max(0, Math.round(bAcc * invAlpha)));
        rgba[idx + 3] = Math.min(255, Math.max(0, outA));
      } else {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  return encodeRgbaPng(size, size, rgba);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const specs = [
  { file: "icon-192.png", size: 192, rounded: true, emblemScale: 1.0 },
  { file: "icon-512.png", size: 512, rounded: true, emblemScale: 1.0 },
  { file: "icon-maskable-512.png", size: 512, rounded: false, emblemScale: 0.78 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, emblemScale: 0.94 },
];

for (const spec of specs) {
  const png = renderIcon(spec.size, {
    rounded: spec.rounded,
    emblemScale: spec.emblemScale,
  });
  const target = path.join(OUTPUT_DIR, spec.file);
  fs.writeFileSync(target, png);
  console.log(`Generated ${spec.file} (${spec.size}x${spec.size}, ${png.length} bytes)`);
}
