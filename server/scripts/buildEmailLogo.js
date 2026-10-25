/* eslint-disable no-console -- a build script's output */
// Makes the logo that notification emails carry: the company logo from the website (public/images/logo.png), shrunk to 240 px wide so the
// email stays small. Email clients cannot be trusted with SVG or large images, so the PNG is attached inline (a CID attachment) instead of
// being linked from a web address. The logo is not redrawn or changed in any other way.
//
//   node scripts/buildEmailLogo.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE = path.join(__dirname, '..', '..', 'public', 'images', 'logo.png');
const TARGET = path.join(__dirname, '..', 'assets', 'email-logo.png');
const WIDTH = 240;

(async () => {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  const info = await sharp(SOURCE).resize({ width: WIDTH }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(TARGET);
  console.log(`Wrote ${path.relative(path.join(__dirname, '..', '..'), TARGET)}: ${info.width} x ${info.height} px, ${info.size} bytes`);
})().catch((err) => { console.error('Could not build the email logo:', err.message); process.exit(1); });
