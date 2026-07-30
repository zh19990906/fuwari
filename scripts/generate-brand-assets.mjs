import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
await mkdir(publicDirectory, { recursive: true });

const appleIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="42" fill="#4c9bf5"/>
  <path d="M50 39h25v38h30V39h25v102h-25v-40H75v40H50V39Z" fill="#fff"/>
</svg>`;

const sharingImage = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eff7ff"/>
      <stop offset="1" stop-color="#dcecff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#background)"/>
  <circle cx="1050" cy="90" r="230" fill="#4c9bf5" opacity="0.13"/>
  <circle cx="112" cy="596" r="260" fill="#4c9bf5" opacity="0.09"/>
  <rect x="96" y="116" width="142" height="142" rx="34" fill="#4c9bf5"/>
  <path d="M132 145h22v39h26v-39h22v85h-22v-26h-26v26h-22v-85Z" fill="#fff"/>
  <text x="96" y="360" font-family="Roboto, Arial, sans-serif" font-size="70" font-weight="700" fill="#142033">Henson&apos;s Blog</text>
  <text x="99" y="430" font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="34" font-weight="500" fill="#536273">无名小卒的博客记录</text>
  <text x="99" y="516" font-family="Roboto, Arial, sans-serif" font-size="24" fill="#718096">Python · AI / LLM · Computer Vision · Engineering</text>
</svg>`;

await Promise.all([
  sharp(Buffer.from(appleIcon)).png().toFile(`${publicDirectory}/apple-touch-icon.png`),
  sharp(Buffer.from(sharingImage)).png().toFile(`${publicDirectory}/og-default.png`),
]);
