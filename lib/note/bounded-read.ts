import { closeSync, constants, openSync, readSync } from "node:fs";
import { MAX_NOTE_BYTES } from "./file";

/**
 * The bytes of a note file, or null when it is a symlink or holds more than MAX_NOTE_BYTES. It
 * reads through one descriptor and stops one byte past the cap, so a file that grows after a
 * size check (or is swapped for a symlink) can never make the reader pull in more than that.
 */
export function readNoteBytes(path: string): Buffer | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") return null; // became a symlink
    throw error;
  }
  try {
    const buffer = Buffer.alloc(MAX_NOTE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    return length > MAX_NOTE_BYTES ? null : buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}
