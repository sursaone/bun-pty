import { expect, test, describe } from "bun:test";
import { Buffer } from "node:buffer";
import { INITIAL_OUTPUT_LIMIT_BYTES, keepNewestUtf8 } from "./output";

describe("keepNewestUtf8", () => {
	test("returns text within the limit unchanged", () => {
		expect(keepNewestUtf8("hello ─ 😀", INITIAL_OUTPUT_LIMIT_BYTES)).toBe("hello ─ 😀");
	});

	test("counts the limit in UTF-8 bytes for multi-byte output", () => {
		// 200,000 × 3 bytes = 600,000 bytes, but only 200,000 UTF-16 code units
		const kept = keepNewestUtf8("─".repeat(200_000), INITIAL_OUTPUT_LIMIT_BYTES);
		expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(INITIAL_OUTPUT_LIMIT_BYTES);
		// The newest whole characters that fit: floor(524,288 / 3)
		expect(kept).toBe("─".repeat(174_762));
		expect(kept).not.toContain("�");
	});

	test("does not split an emoji at the trim boundary", () => {
		const kept = keepNewestUtf8(`😀${"a".repeat(524_287)}`, INITIAL_OUTPUT_LIMIT_BYTES);
		expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(INITIAL_OUTPUT_LIMIT_BYTES);
		expect(kept).toBe("a".repeat(524_287));
		expect(kept).not.toMatch(/[\uD800-\uDFFF]/);
		expect(kept).not.toContain("�");
	});

	test("keeps an emoji that fits whole at the boundary", () => {
		const kept = keepNewestUtf8(`x😀${"a".repeat(524_284)}`, INITIAL_OUTPUT_LIMIT_BYTES);
		expect(kept).toBe(`😀${"a".repeat(524_284)}`);
		expect(Buffer.byteLength(kept)).toBe(INITIAL_OUTPUT_LIMIT_BYTES);
	});
});
