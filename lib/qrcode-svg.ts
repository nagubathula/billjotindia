// Pure TypeScript ISO/IEC 18004 QR Code Matrix Generator (Byte Mode, ECC Level L)
// Zero external dependencies; works offline in Server & Client Components.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

// Version 1..10 specs at ECC Level L: [totalDataCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataPerBlockG1, numBlocksGroup2, dataPerBlockG2]
const VERSION_SPECS_L: Array<[number, number, number, number, number, number]> = [
  [0, 0, 0, 0, 0, 0],
  [19, 7, 1, 19, 0, 0], // v1
  [34, 10, 1, 34, 0, 0], // v2
  [55, 15, 1, 55, 0, 0], // v3
  [80, 20, 1, 80, 0, 0], // v4
  [108, 26, 1, 108, 0, 0], // v5
  [136, 18, 2, 68, 0, 0], // v6
  [156, 20, 2, 78, 0, 0], // v7
  [194, 24, 2, 97, 0, 0], // v8
  [232, 30, 2, 116, 0, 0], // v9
  [274, 18, 2, 68, 2, 69], // v10
];

const ALIGNMENT_CENTERS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const totalDataCw = VERSION_SPECS_L[v][0];
    const lenBits = v <= 9 ? 8 : 16;
    const availBits = totalDataCw * 8 - 4 - lenBits;
    if (byteLen * 8 <= availBits) return v;
  }
  return 10;
}

function encodeCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const [totalDataCw, ecCw, g1Blocks, g1Data, g2Blocks, g2Data] =
    VERSION_SPECS_L[version];
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  // Byte mode indicator = 0100
  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  const capacityBits = totalDataCw * 8;
  const term = Math.min(4, capacityBits - bits.length);
  pushBits(0, term);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCw = new Uint8Array(totalDataCw);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    dataCw[i] = byte;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < totalDataCw; i++, p ^= 1) {
    dataCw[i] = padBytes[p];
  }

  // Split into blocks & compute RS ECC
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i++) {
    const blk = dataCw.slice(offset, offset + g1Data);
    offset += g1Data;
    dataBlocks.push(blk);
    ecBlocks.push(rsComputeRemainder(blk, ecCw));
  }
  for (let i = 0; i < g2Blocks; i++) {
    const blk = dataCw.slice(offset, offset + g2Data);
    offset += g2Data;
    dataBlocks.push(blk);
    ecBlocks.push(rsComputeRemainder(blk, ecCw));
  }

  // Interleave data + ECC blocks
  const out: number[] = [];
  const maxDataLen = Math.max(g1Data, g2Data);
  for (let col = 0; col < maxDataLen; col++) {
    for (const blk of dataBlocks) {
      if (col < blk.length) out.push(blk[col]);
    }
  }
  for (let col = 0; col < ecCw; col++) {
    for (const blk of ecBlocks) out.push(blk[col]);
  }
  return new Uint8Array(out);
}

function computeFormatBits(eccIndicator: number, mask: number): number {
  const data = (eccIndicator << 3) | mask;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem >>> (i + 10)) & 1) rem ^= 0x537 << i;
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 5; i >= 0; i--) {
    if ((rem >>> (i + 12)) & 1) rem ^= 0x1f25 << i;
  }
  return (version << 12) | rem;
}

export function generateQrMatrix(text: string): boolean[][] {
  const encoded = new TextEncoder().encode(text);
  const safeBytes = encoded.length > 270 ? encoded.slice(0, 270) : encoded;
  const version = pickVersion(safeBytes.length);
  const size = version * 4 + 17;

  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const isFunc: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunc[r][c] = true;
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const r = top + dy;
        const c = left + dx;
        const inOuter = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const onBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        setFunc(r, c, inOuter && (onBorder || inCore));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = ALIGNMENT_CENTERS[version];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cy = centers[i];
      const cx = centers[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(
            cy + dy,
            cx + dx,
            Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
          );
        }
      }
    }
  }

  // Dark module + reserve format areas
  setFunc(size - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunc[8][size - 1 - i]) setFunc(8, size - 1 - i, false);
    if (!isFunc[size - 1 - i][8]) setFunc(size - 1 - i, 8, false);
  }

  if (version >= 7) {
    const vBits = computeVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(b, a, bit);
      setFunc(a, b, bit);
    }
  }

  // Zigzag data placement
  const codewords = encodeCodewords(safeBytes, version);
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunc[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark =
              ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          modules[r][c] = dark;
        }
      }
    }
    upward = !upward;
  }

  // Apply mask 0 ((r + c) % 2 === 0) and write format info (ECC L = 01)
  const mask = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunc[r][c] && (r + c) % 2 === 0) {
        modules[r][c] = !modules[r][c];
      }
    }
  }

  const fmt = computeFormatBits(0b01, mask);
  for (let i = 0; i <= 5; i++) modules[8][i] = ((fmt >>> (14 - i)) & 1) === 1;
  modules[8][7] = ((fmt >>> 8) & 1) === 1;
  modules[8][8] = ((fmt >>> 7) & 1) === 1;
  modules[7][8] = ((fmt >>> 6) & 1) === 1;
  for (let i = 9; i < 15; i++) {
    modules[14 - i][8] = ((fmt >>> (14 - i)) & 1) === 1;
  }
  for (let i = 0; i < 8; i++) {
    modules[8][size - 1 - i] = ((fmt >>> i) & 1) === 1;
  }
  for (let i = 8; i < 15; i++) {
    modules[size - 15 + i][8] = ((fmt >>> i) & 1) === 1;
  }

  return modules;
}

export function generateQrSvgPath(text: string): {
  viewBoxSize: number;
  pathD: string;
} {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const margin = 2;
  const viewBoxSize = n + margin * 2;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        parts.push(`M${c + margin} ${r + margin}h1v1h-1z`);
      }
    }
  }
  return { viewBoxSize, pathD: parts.join("") };
}
