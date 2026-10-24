#!/usr/bin/env node
/**
 * Extract an Electron `app.asar` archive into a plain directory.
 *
 * The harness ships its JavaScript inside `resources/app.asar`; the desktop
 * shell only reads `resources/app` when the archive is absent, so installing
 * a shell patch means unpacking the archive first. This script reads the
 * archive format directly (16-byte pickle header, then a size-prefixed JSON
 * directory) and needs no dependencies.
 *
 * Usage: node extract-asar.mjs <archive path> <output directory> [--force]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/** Bytes preceding the header JSON: 4 + 4 + 4 + 4 pickle words. */
const PICKLE_PREFIX = 16;

function fail(message) {
  console.error(`extract-asar: ${message}`);
  process.exit(1);
}

function readHeader(archivePath) {
  const fd = openSync(archivePath, "r");
  try {
    const prefix = Buffer.alloc(PICKLE_PREFIX);
    if (readSync(fd, prefix, 0, PICKLE_PREFIX, 0) !== PICKLE_PREFIX) fail("archive is too short to hold a header");
    const headerSize = prefix.readUInt32LE(12);
    if (headerSize <= 0 || headerSize > 256 * 1024 * 1024) fail(`implausible header size ${headerSize}`);
    const header = Buffer.alloc(headerSize);
    if (readSync(fd, header, 0, headerSize, PICKLE_PREFIX) !== headerSize) fail("archive header is truncated");
    return JSON.parse(header.toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

/**
 * Walk the archive directory tree, writing every entry below `output`.
 * @param archivePath - source archive.
 * @param unpackedRoot - sibling `<archive>.unpacked` directory holding large binaries.
 * @param node - current directory node.
 * @param relative - source-relative path of this node ("" for the root).
 * @param output - destination root.
 * @param offsetBase - file-data origin inside the archive.
 * @param stats - accumulator for the summary.
 */
function walk(archivePath, unpackedRoot, node, relative, output, offsetBase, stats) {
  const fd = openSync(archivePath, "r");
  try {
    visit(node, relative);
  } finally {
    closeSync(fd);
  }

  function visit(current, path) {
    for (const [name, entry] of Object.entries(current.files ?? {})) {
      // Reject path traversal before touching the filesystem.
      if (name === "" || name === "." || name === ".." || /[\\/]/.test(name)) fail(`unsafe entry name ${JSON.stringify(name)}`);
      const child = path === "" ? name : `${path}/${name}`;
      const target = join(output, ...child.split("/"));
      if (!target.startsWith(output + sep)) fail(`entry escapes the output directory: ${child}`);

      if (entry.files !== undefined) {
        mkdirSync(target, { recursive: true });
        visit(entry, child);
        continue;
      }

      mkdirSync(dirname(target), { recursive: true });

      if (typeof entry.link === "string") {
        // Symlinks are rare in packaged Electron apps; note them and skip.
        stats.links.push(child);
        continue;
      }

      if (entry.unpacked === true) {
        const source = join(unpackedRoot, ...child.split("/"));
        if (!existsSync(source)) fail(`unpacked entry is missing from ${unpackedRoot}: ${child}`);
        writeFileSync(target, readFileSync(source));
        stats.files += 1;
        stats.bytes += statSync(source).size;
        continue;
      }

      const size = Number(entry.size ?? 0);
      const buffer = Buffer.alloc(size);
      if (size > 0) {
        const position = offsetBase + Number(entry.offset ?? 0);
        if (readSync(fd, buffer, 0, size, position) !== size) fail(`short read for ${child}`);
      }
      writeFileSync(target, buffer);
      stats.files += 1;
      stats.bytes += size;
    }
  }
}

/**
 * Locate the directory holding `unpacked: true` entries. Electron names it
 * `<archive>.unpacked`, so a renamed archive such as `app.asar.dragbak` no
 * longer matches its sibling `app.asar.unpacked`; try the obvious shapes and
 * then any `*.asar.unpacked` beside the archive.
 * @param archivePath - absolute archive path.
 * @returns the unpacked root, or undefined when the archive has none.
 */
function findUnpackedRoot(archivePath) {
  const directory = dirname(archivePath);
  const candidates = [
    `${archivePath}.unpacked`,
    join(directory, "app.asar.unpacked"),
    ...(readdirSync(directory).filter((name) => name.endsWith(".asar.unpacked")).map((name) => join(directory, name)))
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function main() {
  const args = process.argv.slice(2).filter((value) => value !== "--force");
  const force = process.argv.includes("--force");
  if (args.length < 2) fail("usage: node extract-asar.mjs <archive path> <output directory> [--force]");

  const archivePath = resolve(args[0]);
  const output = resolve(args[1]);
  if (!existsSync(archivePath)) fail(`archive not found: ${archivePath}`);
  if (existsSync(output) && !force) fail(`output already exists (pass --force to overwrite): ${output}`);

  const header = readHeader(archivePath);
  const headerSize = readHeaderSize(archivePath);
  const offsetBase = PICKLE_PREFIX + headerSize;
  const unpackedRoot = findUnpackedRoot(archivePath);
  if (unpackedRoot === undefined) fail(`no unpacked directory found beside ${archivePath}`);

  mkdirSync(output, { recursive: true });
  const stats = { files: 0, bytes: 0, links: [] };
  walk(archivePath, unpackedRoot, header, "", output, offsetBase, stats);

  console.log(`extract-asar: wrote ${stats.files} files (${(stats.bytes / 1024 / 1024).toFixed(1)} MiB) to ${output}`);
  if (stats.links.length > 0) console.log(`extract-asar: skipped ${stats.links.length} symlink entries (not needed to run)`);
}

/** The header JSON length, needed again to compute the file-data origin. */
function readHeaderSize(archivePath) {
  const fd = openSync(archivePath, "r");
  try {
    const prefix = Buffer.alloc(PICKLE_PREFIX);
    readSync(fd, prefix, 0, PICKLE_PREFIX, 0);
    return prefix.readUInt32LE(12);
  } finally {
    closeSync(fd);
  }
}

main();
