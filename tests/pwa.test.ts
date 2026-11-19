import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import manifest from "@/app/manifest";

const ROOT = process.cwd();
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngDimensions(filePath: string) {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length >= 24, `${path.basename(filePath)} is too short`);
  assert.deepEqual(
    buf.subarray(0, 8),
    PNG_SIGNATURE,
    `${path.basename(filePath)} missing PNG signature`,
  );
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe("PWA manifest, icons & service worker", () => {
  it("exports a valid standalone Web App Manifest", () => {
    const m = manifest();
    assert.equal(m.id, "/");
    assert.equal(m.name, "Billjot Console");
    assert.equal(m.short_name, "Billjot");
    assert.equal(m.start_url, "/");
    assert.equal(m.scope, "/");
    assert.equal(m.display, "standalone");
    assert.equal(m.theme_color, "#059669");
    assert.equal(m.background_color, "#ffffff");

    const icons = m.icons ?? [];
    assert.ok(
      icons.some(
        (icon) =>
          icon.src === "/icons/icon-192.png" &&
          icon.sizes === "192x192" &&
          icon.type === "image/png" &&
          icon.purpose === "any",
      ),
    );
    assert.ok(
      icons.some(
        (icon) =>
          icon.src === "/icons/icon-512.png" &&
          icon.sizes === "512x512" &&
          icon.type === "image/png" &&
          icon.purpose === "any",
      ),
    );
    assert.ok(
      icons.some(
        (icon) =>
          icon.src === "/icons/icon-maskable-512.png" &&
          icon.sizes === "512x512" &&
          icon.type === "image/png" &&
          icon.purpose === "maskable",
      ),
    );
  });

  it("ships crisp vector & PNG icons at exact expected dimensions", () => {
    const svgPath = path.join(ROOT, "public", "icons", "icon.svg");
    assert.ok(fs.existsSync(svgPath), "public/icons/icon.svg should exist");
    const svg = fs.readFileSync(svgPath, "utf8");
    assert.ok(svg.includes("#059669"));

    const expectedPngs: Array<[string, number, number]> = [
      ["icon-192.png", 192, 192],
      ["icon-512.png", 512, 512],
      ["icon-maskable-512.png", 512, 512],
      ["apple-touch-icon.png", 180, 180],
    ];

    for (const [filename, expectedWidth, expectedHeight] of expectedPngs) {
      const fullPath = path.join(ROOT, "public", "icons", filename);
      assert.ok(fs.existsSync(fullPath), `${filename} should exist`);
      const dims = readPngDimensions(fullPath);
      assert.equal(dims.width, expectedWidth, `${filename} width`);
      assert.equal(dims.height, expectedHeight, `${filename} height`);
    }
  });

  it("provides a service worker that precaches /offline and bypasses /api/ and RSC payloads", () => {
    const swPath = path.join(ROOT, "public", "sw.js");
    assert.ok(fs.existsSync(swPath), "public/sw.js should exist");
    const sw = fs.readFileSync(swPath, "utf8");
    assert.ok(sw.includes("/offline"), "sw should reference /offline fallback");
    assert.ok(sw.includes("SKIP_WAITING"), "sw should handle SKIP_WAITING");
    assert.ok(sw.includes('"/api/"'), "sw should bypass /api/ endpoints");
    assert.ok(sw.includes('"RSC"'), "sw should bypass RSC flight requests");
  });
});
