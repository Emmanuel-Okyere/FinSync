// Builds the browser and app icons from the FinSync mark (specs from the design canvas, "Logo in use").
// Favicon: rings only ("favicon drops the arrow"), 86% of a rounded tile. App icon: full mark, 74% of the tile.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const HERO = "#0f5d4a";
const ON_HERO = "#ffffff";
const ACCENT = "#f2b33d";

const rings = `
  <circle cx="84" cy="96" r="50" fill="none" stroke="${ON_HERO}" stroke-width="22"/>
  <circle cx="152" cy="96" r="50" fill="none" stroke="${ACCENT}" stroke-width="22"/>
  <path d="M129.32 117.13 A50 50 0 0 1 101.10 142.98" fill="none" stroke="${HERO}" stroke-width="32"/>
  <path d="M129.32 117.13 A50 50 0 0 1 101.10 142.98" fill="none" stroke="${ON_HERO}" stroke-width="22"/>
  <path d="M106.68 74.87 A50 50 0 0 1 134.90 49.02" fill="none" stroke="${HERO}" stroke-width="32"/>
  <path d="M106.68 74.87 A50 50 0 0 1 134.90 49.02" fill="none" stroke="${ACCENT}" stroke-width="22"/>`;
const arrow = `
  <polyline points="24,152 82,98 110,122 192,40" fill="none" stroke="${HERO}" stroke-width="27" stroke-linejoin="miter"/>
  <polygon points="222,10 172,24 208,60" fill="${HERO}" stroke="${HERO}" stroke-width="8" stroke-linejoin="round"/>
  <polyline points="24,152 82,98 110,122 192,40" fill="none" stroke="${ACCENT}" stroke-width="15" stroke-linejoin="miter"/>
  <polygon points="222,10 172,24 208,60" fill="${ACCENT}"/>`;

/** A square tile with the mark centred. radius = corner radius as a share of size (0 for full-bleed). */
function tile({ size, markShare, withArrow, radius }) {
  const w = size * markShare;
  const h = (w * 170) / 240;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${HERO}"/>
  <svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 240 170">${rings}${withArrow ? arrow : ""}</svg>
</svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// Browser tab: scalable SVG + classic favicon.ico (16/32/48).
const faviconSvg = tile({ size: 32, markShare: 0.86, withArrow: false, radius: 7 / 32 });
writeFileSync("src/app/icon.svg", faviconSvg);
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map((s) => png(tile({ size: s, markShare: 0.86, withArrow: false, radius: 7 / 32 }))));
// ICO container with embedded PNGs.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = icoPngs.map((buf, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(icoSizes[i] % 256, 0);
  e.writeUInt8(icoSizes[i] % 256, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += buf.length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...icoPngs]));

// iPhone home screen: full-bleed square (iOS rounds the corners itself), full mark.
writeFileSync("src/app/apple-icon.png", await png(tile({ size: 180, markShare: 0.74, withArrow: true, radius: 0 })));

// Android / installed web app: rounded tile, full mark; maskable version keeps the mark in the safe zone.
writeFileSync("public/icons/icon-192.png", await png(tile({ size: 192, markShare: 0.74, withArrow: true, radius: 36 / 160 })));
writeFileSync("public/icons/icon-512.png", await png(tile({ size: 512, markShare: 0.74, withArrow: true, radius: 36 / 160 })));
writeFileSync("public/icons/maskable-512.png", await png(tile({ size: 512, markShare: 0.6, withArrow: true, radius: 0 })));

console.log("Icons written: src/app/icon.svg, favicon.ico, apple-icon.png, public/icons/*");
