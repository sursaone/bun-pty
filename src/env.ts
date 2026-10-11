// env.ts  —  the child's environment, kept out of terminal.ts so it can be
// tested without loading the native library

import type { IPtyForkOptions } from "./interfaces";

export const DEFAULT_NAME = "xterm";

/**
 * Variables that tie a shell to the terminal this process runs in. As in
 * node-pty, they are dropped when the child inherits process.env, so a shell
 * in the new PTY does not think it runs inside the parent's tmux or screen
 * session, or take the parent terminal's size.
 */
const PARENT_TERMINAL_VARS = ["TMUX", "TMUX_PANE", "STY", "WINDOW", "WINDOWID", "TERMCAP", "COLUMNS", "LINES"];

/**
 * The child's environment, as node-pty builds it. A supplied map replaces
 * the parent's environment; without one the child gets `parentEnv`. On Unix,
 * TERM comes from `name` and PWD from `cwd`.
 *
 * @param opts - The spawn options
 * @param cwd - The child's working directory
 * @param platform - The platform to build for
 * @param parentEnv - This process's environment
 * @returns The child's environment
 */
export function childEnv(
	opts: Pick<IPtyForkOptions, "env" | "name">,
	cwd: string,
	platform: typeof process.platform = process.platform,
	parentEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
	const source = opts.env ?? parentEnv;
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) env[key] = value;
	}
	if (platform === "win32") return env;

	if (source === parentEnv) {
		for (const key of PARENT_TERMINAL_VARS) delete env[key];
	}
	env.PWD = cwd;
	env.TERM = opts.name || env.TERM || DEFAULT_NAME;
	return env;
}

/**
 * Format an environment for the native side: NUL-terminated KEY=VALUE pairs,
 * or an empty string for an empty environment.
 *
 * @param env - The environment to format
 * @returns The formatted environment
 */
export function formatEnv(env: Record<string, string>): string {
	const pairs = Object.entries(env).map(([key, value]) => `${key}=${value}`);
	return pairs.length > 0 ? `${pairs.join("\0")}\0` : "";
}
