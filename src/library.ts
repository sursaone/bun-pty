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

export function unsupportedBunError(version: string): string | undefined {
	// Compare the release part only, so a canary build such as 1.4.5-canary.1
	// counts as 1.4.5.
	const release = version.split("-")[0];
	if (Bun.semver.order(release, MIN_BUN_VERSION) >= 0) return undefined;
	return `bun-pty needs Bun ${MIN_BUN_VERSION} or newer, but this is Bun ${version}. Run \`bun upgrade\`.`;
}
