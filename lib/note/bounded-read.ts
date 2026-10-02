import { closeSync, constants, openSync, readSync } from "node:fs";
import { MAX_NOTE_BYTES } from "./file";

/**
 * The bytes of a file, or null when it is a symlink or holds more than `max`. It
 * reads through one descriptor and stops one byte past the cap, so a file that grows after a
 * size check (or is swapped for a symlink) can never make the reader pull in more than that.
 */
export function readBoundedBytes(path: string, max: number): Buffer | null {
  if (!Number.isSafeInteger(max) || max < 0)
    throw new RangeError("max must be a non-negative integer");
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") return null; // became a symlink
    throw error;
  }
  try {
    const buffer = Buffer.alloc(max + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    return length > max ? null : buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

/** A note file's bytes, or null when it is a symlink or over MAX_NOTE_BYTES. */
export const readNoteBytes = (path: string) => readBoundedBytes(path, MAX_NOTE_BYTES);
