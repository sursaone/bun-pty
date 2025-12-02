// terminal.ts  —  JS/TS front-end (final fixed version)

import { dlopen, FFIType, ptr } from "bun:ffi";
import { Buffer } from "node:buffer";
import { EventEmitter } from "./interfaces";
import type { IPty, IPtyForkOptions, IExitEvent } from "./interfaces";
import { join } from "node:path";
import { existsSync } from "node:fs";

export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
export const DEFAULT_FILE = "sh";
export const DEFAULT_NAME = "xterm";

// terminal.ts  – loader fragment only

function resolveLibPath(): string {
	const env = process.env.BUN_PTY_LIB;
	if (env && existsSync(env)) return env;

	const platform = process.platform;
	const arch = process.arch;

	// Try both architecture-specific and generic filenames
	const filenames =
		platform === "darwin"
			? arch === "arm64"
				? ["librust_pty_arm64.dylib", "librust_pty.dylib"]
				: ["librust_pty.dylib"]
			: platform === "win32"
			? ["rust_pty.dll"]
			: arch === "arm64"
			? ["librust_pty_arm64.so", "librust_pty.so"]
			: ["librust_pty.so"];

	// Start from the current module's location
	const base = Bun.fileURLToPath(import.meta.url);
	
	// Handle both development (src/terminal.ts) and production (dist/terminal.js) cases
	const here = base.includes('/src/') 
		? base.replace(/\/src\/.*$/, "") // In development: strip /src/terminal.ts
		: base.replace(/\/dist\/.*$/, ""); // In production: strip /dist/terminal.js

	const basePaths = [
		join(here, "rust-pty", "target", "release"),       // Direct path from project root
		join(here, "..", "bun-pty", "rust-pty", "target", "release"), // monorepo setups
		join(process.cwd(), "node_modules", "bun-pty", "rust-pty", "target", "release"),
	];

	const fallbackPaths = [];
	for (const basePath of basePaths) {
		for (const filename of filenames) {
			fallbackPaths.push(join(basePath, filename));
		}
	}

	for (const path of fallbackPaths) {
		if (existsSync(path)) return path;
	}

	throw new Error(
		`librust_pty shared library not found.\nChecked:\n  - BUN_PTY_LIB=${env ?? "<unset>"}\n  - ${fallbackPaths.join("\n  - ")}\n\nSet BUN_PTY_LIB or ensure one of these paths contains the file.`
	);
}

const libPath = resolveLibPath();

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
let lib: any;

// try to load the lib, if it fails log the error
try {
	lib = dlopen(libPath, {
		bun_pty_spawn: {
			args: [FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.i32, FFIType.i32],
			returns: FFIType.i32,
		},
		bun_pty_write: {
			args: [FFIType.i32, FFIType.pointer, FFIType.i32],
			returns: FFIType.i32,
		},
		bun_pty_read: {
			args: [FFIType.i32, FFIType.pointer, FFIType.i32],
			returns: FFIType.i32,
		},
		bun_pty_resize: {
			args: [FFIType.i32, FFIType.i32, FFIType.i32],
			returns: FFIType.i32,
		},
		bun_pty_kill: { args: [FFIType.i32], returns: FFIType.i32 },
		bun_pty_get_pid: { args: [FFIType.i32], returns: FFIType.i32 },
		bun_pty_close: { args: [FFIType.i32], returns: FFIType.void },
	});
} catch (error) {
	console.error("Failed to load lib", error);
}

export class Terminal implements IPty {
	private handle = -1;
	private _pid = -1;
	private _cols = DEFAULT_COLS;
	private _rows = DEFAULT_ROWS;
	private readonly _name = DEFAULT_NAME;

	private _readLoop = false;
	private _closing = false;

	private readonly _onData = new EventEmitter<string>();
	private readonly _onExit = new EventEmitter<IExitEvent>();

	constructor(
		file = DEFAULT_FILE,
		args: string[] = [],
		opts: IPtyForkOptions = { name: DEFAULT_NAME },
	) {
		this._cols = opts.cols ?? DEFAULT_COLS;
		this._rows = opts.rows ?? DEFAULT_ROWS;
		const cwd = opts.cwd ?? process.cwd();
		const cmdline = [file, ...args].join(" ");

		// Format environment variables as null-terminated string
		let envStr = "";
		if (opts.env) {
			const envPairs = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
			envStr = envPairs.join("\0") + "\0";
		}

		this.handle = lib.symbols.bun_pty_spawn(
			Buffer.from(`${cmdline}\0`, "utf8"),
			Buffer.from(`${cwd}\0`, "utf8"),
			Buffer.from(`${envStr}\0`, "utf8"),
			this._cols,
			this._rows,
		);
		if (this.handle < 0) throw new Error("PTY spawn failed");

		this._pid = lib.symbols.bun_pty_get_pid(this.handle);
		this._startReadLoop();
	}

	/* ------------- accessors ------------- */

	get pid() {
		return this._pid;
	}
	get cols() {
		return this._cols;
	}
	get rows() {
		return this._rows;
	}
	get process() {
		return "shell";
	}

	get onData() {
		return this._onData.event;
	}
	get onExit() {
		return this._onExit.event;
	}

	/* ------------- IO methods ------------- */

	write(data: string) {
		if (this._closing) return;
		const buf = Buffer.from(data, "utf8");
		lib.symbols.bun_pty_write(this.handle, ptr(buf), buf.length);
	}

	resize(cols: number, rows: number) {
		if (this._closing) return;
		this._cols = cols;
		this._rows = rows;
		lib.symbols.bun_pty_resize(this.handle, cols, rows);
	}

	kill(signal = "SIGTERM") {
		if (this._closing) return;
		this._closing = true;
		lib.symbols.bun_pty_kill(this.handle);
		lib.symbols.bun_pty_close(this.handle);
		this._onExit.fire({ exitCode: 0, signal });
	}

	/* ------------- read-loop ------------- */

	private async _startReadLoop() {
		if (this._readLoop) return;
		this._readLoop = true;

		const buf = Buffer.allocUnsafe(4096);

		while (this._readLoop && !this._closing) {
			const n = lib.symbols.bun_pty_read(this.handle, ptr(buf), buf.length);
			if (n > 0) {
				this._onData.fire(buf.subarray(0, n).toString("utf8"));
			} else if (n === -2) {
				// CHILD_EXITED
				this._onExit.fire({ exitCode: 0 });
				break;
			} else if (n < 0) {
				// error
				break;
			} else {
				// 0 bytes: wait
				await new Promise((r) => setTimeout(r, 8));
			}
		}
	}
}
