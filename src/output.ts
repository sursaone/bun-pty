// output.ts  —  output kept for the first onData listener, kept out of
// terminal.ts so it can be tested without loading the native library

import { Buffer } from "node:buffer";

/** At most this many UTF-8 bytes of output are kept for the first onData listener */
export const INITIAL_OUTPUT_LIMIT_BYTES = 512 * 1024;

/**
 * The newest complete characters of `text` that fit in `limitBytes` of UTF-8.
 * The cut never lands inside a character, so no surrogate pair or multi-byte
 * sequence is split.
 */
export function keepNewestUtf8(text: string, limitBytes: number): string {
	const bytes = Buffer.from(text, "utf8");
	if (bytes.length <= limitBytes) return text;
	let start = bytes.length - limitBytes;
	// Skip continuation bytes (10xxxxxx) to start on a whole character
	while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
	return bytes.subarray(start).toString("utf8");
}
