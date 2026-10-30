export function libraryFilenames(platform: typeof process.platform, arch: string, musl: boolean) {
	if (platform === "darwin") {
		return arch === "arm64"
			? ["librust_pty_arm64.dylib", "librust_pty.dylib"]
			: ["librust_pty.dylib"];
	}
	if (platform === "win32") {
		return arch === "arm64"
			? ["rust_pty_arm64.dll", "rust_pty.dll"]
			: ["rust_pty.dll"];
	}
	if (musl) {
		return arch === "arm64"
			? ["librust_pty_arm64_musl.so", "librust_pty_musl.so", "librust_pty_arm64.so", "librust_pty.so"]
			: ["librust_pty_musl.so", "librust_pty.so"];
	}
	return arch === "arm64"
		? ["librust_pty_arm64.so", "librust_pty.so"]
		: ["librust_pty.so"];
}

// The FFI signatures use the "buffer_length" type and pass JS strings as
// cstring args, both new in Bun 1.4.0.
export const MIN_BUN_VERSION = "1.4.0";

// Checks for the FFI feature itself rather than comparing versions: an early
// 1.4.0 canary lacks "buffer_length", and Bun 1.0.0-1.0.10 have no Bun.semver.
export function unsupportedBunError(version: string, ffiTypes: object): string | undefined {
	if ("buffer_length" in ffiTypes) return undefined;
	return `bun-pty needs Bun ${MIN_BUN_VERSION} or newer, but this is Bun ${version}. Run \`bun upgrade\`.`;
}
