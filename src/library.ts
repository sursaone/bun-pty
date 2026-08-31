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
