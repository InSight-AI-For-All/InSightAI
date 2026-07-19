import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const source = path.resolve(
  root,
  process.argv[2] || ".company/assets/ChatGPT Image Jul 19, 2026, 12_08_27 AM.png",
);
const publicRoot = path.join(root, "public");
const brandRoot = path.join(publicRoot, "brand");
const iconRoot = path.join(publicRoot, "icons");
const socialRoot = path.join(brandRoot, "social");
const marketingRoot = path.join(brandRoot, "marketing");

const colors = {
  navy: "#03153C",
  navyDeep: "#010A24",
  teal: "#0CA6A7",
  tealBright: "#11B8B5",
  white: "#FFFFFF",
  mist: "#E8F2F3",
};

const crops = {
  mark: { left: 330, top: 250, width: 596, height: 490 },
  wordmark: { left: 175, top: 710, width: 906, height: 255 },
  lockup: { left: 160, top: 240, width: 934, height: 740 },
};

await access(source);
await Promise.all([
  mkdir(brandRoot, { recursive: true }),
  mkdir(iconRoot, { recursive: true }),
  mkdir(socialRoot, { recursive: true }),
  mkdir(marketingRoot, { recursive: true }),
]);

async function removeConnectedBackground(extract) {
  const { data, info } = await sharp(source)
    .extract(extract)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function canVisit(pixel) {
    if (pixel < 0 || pixel >= width * height || visited[pixel]) return false;
    const offset = pixel * channels;
    return data[offset] >= 210 && data[offset + 1] >= 210 && data[offset + 2] >= 210;
  }

  function enqueue(pixel) {
    if (!canVisit(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    if (!visited[pixel]) continue;
    const offset = pixel * channels;
    const darkest = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    data[offset + 3] = Math.max(0, Math.min(255, Math.round(((245 - darkest) / 35) * 255)));
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

async function contain(input, width, height, background = { r: 0, g: 0, b: 0, alpha: 0 }, padding = 0) {
  const inner = await sharp(input)
    .resize(width - padding * 2, height - padding * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  let pipeline = sharp(inner)
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background,
    });
  if (background.alpha === 1) pipeline = pipeline.flatten({ background });
  return pipeline.png().toBuffer();
}

async function recolorNavyToWhite(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] > 0 && data[offset] < 55 && data[offset + 1] < 75 && data[offset + 2] < 125) {
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function svgText(width, height, lines) {
  const content = lines.map(({ text, x, y, size, weight = 700, fill = colors.white, anchor = "start" }) =>
    `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${text}</text>`,
  ).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`);
}

async function writePng(relativePath, buffer) {
  const target = path.join(publicRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return target;
}

function createIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

const markArtwork = await removeConnectedBackground(crops.mark);
const wordmarkArtwork = await removeConnectedBackground(crops.wordmark);
const lockupArtwork = await removeConnectedBackground(crops.lockup);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const navy = { r: 3, g: 21, b: 60, alpha: 1 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };

const mark = await contain(markArtwork, 1024, 1024, transparent, 86);
const wordmark = await contain(wordmarkArtwork, 1400, 360, transparent, 34);
const wordmarkOnDarkArtwork = await recolorNavyToWhite(wordmarkArtwork);
const wordmarkOnDark = await contain(wordmarkOnDarkArtwork, 1400, 360, transparent, 34);
const lockup = await contain(lockupArtwork, 1200, 960, transparent, 58);
const horizontal = await sharp({ create: { width: 1600, height: 420, channels: 4, background: transparent } })
  .composite([
    { input: await contain(markArtwork, 350, 350, transparent, 20), left: 20, top: 35 },
    { input: await contain(wordmarkArtwork, 1170, 300, transparent, 10), left: 390, top: 60 },
  ])
  .png()
  .toBuffer();
const horizontalOnDark = await sharp({ create: { width: 1600, height: 420, channels: 4, background: transparent } })
  .composite([
    { input: await contain(markArtwork, 350, 350, transparent, 20), left: 20, top: 35 },
    { input: await contain(wordmarkOnDarkArtwork, 1170, 300, transparent, 10), left: 390, top: 60 },
  ])
  .png()
  .toBuffer();

await Promise.all([
  writePng("brand/insight-ai-mark.png", mark),
  writePng("brand/insight-ai-wordmark.png", wordmark),
  writePng("brand/insight-ai-wordmark-on-dark.png", wordmarkOnDark),
  writePng("brand/insight-ai-lockup.png", lockup),
  writePng("brand/insight-ai-horizontal.png", horizontal),
  writePng("brand/insight-ai-horizontal-on-dark.png", horizontalOnDark),
  writePng("brand/insight-ai-mark-on-navy.png", await contain(markArtwork, 1024, 1024, navy, 86)),
  writePng("brand/insight-ai-mark-on-white.png", await contain(markArtwork, 1024, 1024, white, 86)),
  writePng("brand/email-header.png", await contain(horizontal, 600, 158, white, 12)),
]);

const iconSizes = [16, 32, 48, 180, 192, 512];
const iconBuffers = new Map();
for (const size of iconSizes) {
  const buffer = await contain(markArtwork, size, size, navy, Math.max(1, Math.round(size * 0.08)));
  iconBuffers.set(size, buffer);
  await writePng(`icons/favicon-${size}x${size}.png`, buffer);
}
await Promise.all([
  writeFile(path.join(publicRoot, "favicon.ico"), createIco([16, 32, 48].map((size) => ({ size, data: iconBuffers.get(size) })))),
  writePng("favicon.png", iconBuffers.get(32)),
  writePng("favicon-16x16.png", iconBuffers.get(16)),
  writePng("favicon-32x32.png", iconBuffers.get(32)),
  writePng("favicon-180x180.png", iconBuffers.get(180)),
  writePng("favicon-192x192.png", iconBuffers.get(192)),
  writePng("favicon-512x512.png", iconBuffers.get(512)),
  writePng("apple-touch-icon.png", iconBuffers.get(180)),
  writePng("icons/icon-192.png", iconBuffers.get(192)),
  writePng("icons/icon-512.png", iconBuffers.get(512)),
]);

const ogBase = sharp({ create: { width: 1200, height: 630, channels: 4, background: navy } });
const ogImage = await ogBase.composite([
  { input: await contain(horizontalOnDark, 720, 190, transparent, 4), left: 78, top: 70 },
  { input: svgText(1044, 260, [
    { text: "Truth checks for the speed", x: 0, y: 82, size: 62 },
    { text: "of social media.", x: 0, y: 154, size: 62 },
    { text: "Evidence-assisted analysis · insightaiforall.com", x: 0, y: 224, size: 27, weight: 500, fill: colors.mist },
  ]), left: 82, top: 285 },
  { input: Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="617" width="1200" height="13" fill="${colors.teal}"/></svg>`), left: 0, top: 0 },
]).png().toBuffer();

const profile = await contain(markArtwork, 1080, 1080, navy, 112);
const banner = await sharp({ create: { width: 1500, height: 500, channels: 4, background: navy } }).composite([
  { input: await contain(horizontalOnDark, 760, 200, transparent, 8), left: 80, top: 60 },
  { input: svgText(1300, 150, [
    { text: "KNOW WHAT'S REAL BEFORE IT GOES VIRAL.", x: 0, y: 65, size: 38, weight: 700 },
    { text: "Evidence-assisted truth checks for links, screenshots, and claims.", x: 0, y: 120, size: 25, weight: 500, fill: colors.mist },
  ]), left: 90, top: 285 },
  { input: Buffer.from(`<svg width="1500" height="500" xmlns="http://www.w3.org/2000/svg"><rect x="1478" y="0" width="22" height="500" fill="${colors.teal}"/></svg>`), left: 0, top: 0 },
]).png().toBuffer();

const launchGraphic = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: white } }).composite([
  { input: await contain(lockupArtwork, 780, 650, transparent, 20), left: 150, top: 95 },
  { input: svgText(880, 190, [
    { text: "KNOW BEFORE YOU SHARE.", x: 440, y: 68, size: 38, anchor: "middle", fill: colors.navy },
    { text: "insightaiforall.com", x: 440, y: 132, size: 28, weight: 500, anchor: "middle", fill: colors.teal },
  ]), left: 100, top: 810 },
]).png().toBuffer();

const investorCover = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: navy } }).composite([
  { input: await contain(horizontalOnDark, 980, 260, transparent, 10), left: 120, top: 120 },
  { input: svgText(1600, 360, [
    { text: "Evidence-assisted truth checks", x: 0, y: 100, size: 76 },
    { text: "for the speed of social media.", x: 0, y: 192, size: 76 },
    { text: "Company overview · Confidential", x: 0, y: 310, size: 30, weight: 500, fill: colors.mist },
  ]), left: 135, top: 500 },
  { input: Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><circle cx="1770" cy="155" r="260" fill="${colors.teal}" fill-opacity=".16"/><rect x="0" y="1058" width="1920" height="22" fill="${colors.teal}"/></svg>`), left: 0, top: 0 },
]).png().toBuffer();

const splash = await sharp({ create: { width: 1290, height: 2796, channels: 4, background: navy } }).composite([
  { input: await contain(lockupArtwork, 850, 680, transparent, 28), left: 220, top: 860 },
  { input: svgText(1090, 220, [
    { text: "KNOW BEFORE YOU SHARE", x: 545, y: 80, size: 38, anchor: "middle", fill: colors.mist },
  ]), left: 100, top: 1580 },
]).png().toBuffer();

await Promise.all([
  writePng("brand/social/og-default.png", ogImage),
  writePng("brand/social/twitter-default.png", ogImage),
  writePng("brand/marketing/social-profile-1080.png", profile),
  writePng("brand/marketing/social-banner-1500x500.png", banner),
  writePng("brand/marketing/launch-graphic-1080.png", launchGraphic),
  writePng("brand/marketing/investor-cover-1920x1080.png", investorCover),
  writePng("brand/marketing/apple-splash-1290x2796.png", splash),
]);

console.log(`Generated official InSight AI brand assets from ${path.relative(root, source)}.`);