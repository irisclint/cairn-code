/**
 * Renders every raster icon Cairn ships from the single SVG master.
 *
 * Produces:
 *   PNG  16, 32, 48, 64, 128, 256, 512, 1024   application and web icons
 *   ICO  multi-resolution                      Windows executable and installer
 *   ICNS multi-resolution                      macOS bundle
 *   PNG  512 maskable                          PWA and Android style adaptive icon
 *
 * The rasters are generated rather than committed so the master SVG stays the
 * only place the logo is defined. Run with: npm run assets:icons
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const masterSvg = join(root, 'resources', 'icons', 'logo', 'cairn-logo.svg');
const outDir = join(root, 'resources', 'icons', 'logo');
const buildDir = join(root, 'build');

const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function loadSharp() {
  try {
    const module = await import('sharp');
    return module.default ?? module;
  } catch (error) {
    process.stderr.write(
      'Icon generation needs the "sharp" package.\n' +
        '  Cause: sharp could not be imported: ' +
        String(error) +
        '\n' +
        '  Fix:   run "npm install" so the dev dependencies are present, then try again.\n'
    );
    process.exit(1);
  }
}

/**
 * Builds a Windows .ico container.
 *
 * Every entry is stored as a PNG, which the ICO format has allowed since
 * Windows Vista and which keeps the file far smaller than raw bitmaps.
 */
function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(16 * count);
  let offset = 6 + directory.length;

  images.forEach((image, index) => {
    const entry = index * 16;
    // 256 is encoded as 0 in the ICO directory.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 0);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

/**
 * Builds a macOS .icns container.
 *
 * Each size maps to the four character type the format expects; sizes without
 * a defined type are skipped rather than written under a wrong tag.
 */
function buildIcns(images) {
  const TYPES = {
    16: 'icp4',
    32: 'icp5',
    64: 'icp6',
    128: 'ic07',
    256: 'ic08',
    512: 'ic09',
    1024: 'ic10'
  };

  const chunks = [];
  for (const image of images) {
    const type = TYPES[image.size];
    if (!type) continue;
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(image.data.length + 8, 4);
    chunks.push(Buffer.concat([header, image.data]));
  }

  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([fileHeader, body]);
}

async function main() {
  const sharp = await loadSharp();
  const svg = await readFile(masterSvg);

  await mkdir(outDir, { recursive: true });
  await mkdir(buildDir, { recursive: true });

  const render = (size) => sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

  // Standard PNG set.
  for (const size of PNG_SIZES) {
    const data = await render(size);
    await writeFile(join(outDir, 'cairn-logo-' + size + '.png'), data);
    process.stdout.write('Wrote cairn-logo-' + size + '.png\n');
  }

  // Favicons.
  await writeFile(join(outDir, 'favicon-32.png'), await render(32));
  await writeFile(join(outDir, 'favicon-16.png'), await render(16));

  // Maskable PWA icon: the mark is inset to 60 percent so that a platform
  // applying a circular mask never clips it.
  const inner = await sharp(svg, { density: 384 }).resize(308, 308).png().toBuffer();
  const maskable = await sharp({
    create: { width: 512, height: 512, channels: 4, background: '#1A1B26' }
  })
    .composite([{ input: inner, top: 102, left: 102 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(outDir, 'cairn-logo-maskable-512.png'), maskable);
  process.stdout.write('Wrote cairn-logo-maskable-512.png\n');

  // Windows ICO.
  const icoImages = [];
  for (const size of ICO_SIZES) icoImages.push({ size, data: await render(size) });
  const ico = buildIco(icoImages);
  await writeFile(join(outDir, 'cairn-logo.ico'), ico);
  await writeFile(join(buildDir, 'cairn.ico'), ico);
  process.stdout.write('Wrote cairn-logo.ico and build/cairn.ico\n');

  // macOS ICNS.
  const icnsImages = [];
  for (const size of ICNS_SIZES) icnsImages.push({ size, data: await render(size) });
  const icns = buildIcns(icnsImages);
  await writeFile(join(outDir, 'cairn-logo.icns'), icns);
  await writeFile(join(buildDir, 'cairn.icns'), icns);
  process.stdout.write('Wrote cairn-logo.icns and build/cairn.icns\n');

  // Linux build icon.
  await writeFile(join(buildDir, 'cairn.png'), await render(512));
  process.stdout.write('Wrote build/cairn.png\n');

  process.stdout.write('\nAll icons generated from ' + masterSvg + '\n');
}

main().catch((error) => {
  process.stderr.write('Icon generation failed: ' + String(error) + '\n');
  process.exitCode = 1;
});
