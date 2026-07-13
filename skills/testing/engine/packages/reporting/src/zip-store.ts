/**
 * zip-store.ts — zero-dependency, STORE-only (method 0) ZIP writer + size chunker.
 *
 * Why STORE (no compression): the only things we bundle are `.webm` capture videos, which
 * are already VP8/VP9-compressed. Re-deflating them burns CPU for ~0% size gain, so we copy
 * bytes verbatim (compression method 0). A STORE zip is trivially correct and streamable.
 *
 * Why chunk: run artifacts may be shipped to a report/chat channel with a per-file size cap
 * (e.g. ~50 MiB). `chunkBySize` greedily packs entries into parts that each stay under a byte
 * budget so every produced .zip fits in one upload; files that can't fit even alone are surfaced
 * as `oversize`.
 *
 * Deterministic on purpose: fixed DOS date/time, flags=0, version-needed=20, no zip64, no data
 * descriptors — so the same inputs yield byte-identical archives (stable hashes in CI).
 * Spec refs: PKWARE APPNOTE 4.3.7 (local header), 4.3.12 (central dir), 4.3.16 (EOCD).
 */
import * as fs from "node:fs";
import * as zlib from "node:zlib";

export interface ZipEntry {
  nameInZip: string; // forward-slash separated path stored inside the archive
  sourcePath: string;
}

export interface ChunkPlan {
  parts: ZipEntry[][];
  oversize: ZipEntry[]; // single files too big to fit in one budgeted part
}

const CHUNK = 1024 * 1024; // 1 MiB streaming buffer
const EOCD_SIZE = 22; // end-of-central-directory record is always 22 bytes
const DOS_TIME = 0x0021; // fixed time  -> bytes 0x21 0x00 (deterministic)
const DOS_DATE = 0x0021; // fixed date  -> bytes 0x21 0x00 (deterministic)

// ---- CRC32 (Node's zlib.crc32 when present; standard table fallback otherwise) ----
let CRC_TABLE: Uint32Array | null = null;
function crc32Fallback(buf: Buffer, seed = 0): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) crc = (CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}
const zc = (zlib as unknown as { crc32?: (b: Buffer, v?: number) => number }).crc32;
const crc32 = typeof zc === "function" ? (b: Buffer, seed = 0) => zc(b, seed) >>> 0 : crc32Fallback;

// ---- file passes (bounded memory: one 1 MiB buffer at a time) ----
function crcAndSize(sourcePath: string): { crc: number; size: number } {
  const fd = fs.openSync(sourcePath, "r");
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    let crc = 0;
    let size = 0;
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      crc = crc32(n === CHUNK ? buf : buf.subarray(0, n), crc);
      size += n;
    }
    return { crc: crc >>> 0, size };
  } finally {
    fs.closeSync(fd);
  }
}
function copyInto(outFd: number, sourcePath: string): number {
  const fd = fs.openSync(sourcePath, "r");
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    let total = 0;
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      fs.writeSync(outFd, buf, 0, n);
      total += n;
    }
    return total;
  } finally {
    fs.closeSync(fd);
  }
}

/** Write a STORE-only .zip at outPath containing the given files. Returns the zip's byte size. */
export function writeStoreZip(outPath: string, entries: ZipEntry[]): number {
  const outFd = fs.openSync(outPath, "w");
  const central: Buffer[] = [];
  let offset = 0;
  try {
    for (const entry of entries) {
      const nameBuf = Buffer.from(entry.nameInZip.replace(/\\/g, "/"), "utf8");
      const { crc, size } = crcAndSize(entry.sourcePath); // 1st pass: CRC must precede data (flags=0)
      const localHeaderOffset = offset;

      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); // local file header signature
      lh.writeUInt16LE(20, 4); // version needed
      lh.writeUInt16LE(0, 6); // flags
      lh.writeUInt16LE(0, 8); // method = STORE
      lh.writeUInt16LE(DOS_TIME, 10);
      lh.writeUInt16LE(DOS_DATE, 12);
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(size, 18); // compressed size (== uncompressed for STORE)
      lh.writeUInt32LE(size, 22); // uncompressed size
      lh.writeUInt16LE(nameBuf.length, 26);
      lh.writeUInt16LE(0, 28); // extra length
      fs.writeSync(outFd, lh);
      fs.writeSync(outFd, nameBuf);
      offset += 30 + nameBuf.length;
      offset += copyInto(outFd, entry.sourcePath); // 2nd pass: stream raw bytes

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0); // central directory header signature
      cd.writeUInt16LE(20, 4); // version made by
      cd.writeUInt16LE(20, 6); // version needed
      cd.writeUInt16LE(0, 8); // flags
      cd.writeUInt16LE(0, 10); // method = STORE
      cd.writeUInt16LE(DOS_TIME, 12);
      cd.writeUInt16LE(DOS_DATE, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(size, 20);
      cd.writeUInt32LE(size, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt16LE(0, 30); // extra length
      cd.writeUInt16LE(0, 32); // comment length
      cd.writeUInt16LE(0, 34); // disk number start
      cd.writeUInt16LE(0, 36); // internal attributes
      cd.writeUInt32LE(0, 38); // external attributes
      cd.writeUInt32LE(localHeaderOffset, 42);
      central.push(Buffer.concat([cd, nameBuf]));
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const rec of central) {
      fs.writeSync(outFd, rec);
      cdSize += rec.length;
    }
    offset += cdSize;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4); // this disk
    eocd.writeUInt16LE(0, 6); // disk with central dir start
    eocd.writeUInt16LE(entries.length, 8); // entries on this disk
    eocd.writeUInt16LE(entries.length, 10); // total entries
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20); // comment length
    fs.writeSync(outFd, eocd);
    offset += 22;

    return offset;
  } finally {
    fs.closeSync(outFd);
  }
}

/** Greedily pack entries (in the given order) into parts each ≤ budgetBytes. Files whose own
 *  size + overhead exceeds budgetBytes go to `oversize` (caller flags them). */
export function chunkBySize(entries: Array<ZipEntry & { size: number }>, budgetBytes: number): ChunkPlan {
  const parts: ZipEntry[][] = [];
  const oversize: ZipEntry[] = [];
  let current: ZipEntry[] = [];
  let currentSize = EOCD_SIZE; // every part carries a 22-byte EOCD

  for (const entry of entries) {
    const nameBytes = Buffer.byteLength(entry.nameInZip.replace(/\\/g, "/"));
    const perEntryOverhead = 30 + nameBytes + 46 + nameBytes; // local + central headers
    const entryCost = entry.size + perEntryOverhead;
    const slim: ZipEntry = { nameInZip: entry.nameInZip, sourcePath: entry.sourcePath };

    if (entryCost > budgetBytes) {
      oversize.push(slim); // cannot fit even as the sole member of a part
      continue;
    }
    if (current.length > 0 && currentSize + entryCost > budgetBytes) {
      parts.push(current);
      current = [];
      currentSize = EOCD_SIZE;
    }
    current.push(slim);
    currentSize += entryCost;
  }
  if (current.length > 0) parts.push(current);
  return { parts, oversize };
}

// Smoke test (do NOT run at import time). One could, in a scratch script:
//   if (import.meta.url === `file://${process.argv[1]}`) {
//     const size = writeStoreZip("out.zip", [{ nameInZip: "a.txt", sourcePath: "a.txt" }]);
//     // then verify with an external unzip: `unzip -t out.zip` should report "No errors detected".
//   }
