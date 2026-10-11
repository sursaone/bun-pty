import { expect, test, describe } from "bun:test";
import { DEFAULT_NAME, childEnv, formatEnv } from "./env";

const parent = {
	PATH: "/usr/bin:/bin",
	HOME: "/home/me",
	TERM: "screen-256color",
	PWD: "/somewhere/else",
	TMUX: "/tmp/tmux-1000/default,1234,0",
	TMUX_PANE: "%1",
	STY: "1234.pts-0.host",
	WINDOW: "0",
	WINDOWID: "4194317",
	TERMCAP: "SC|screen",
	COLUMNS: "120",
	LINES: "40",
	UNSET: undefined,
};

describe("childEnv on Unix", () => {
	test("a supplied map replaces the parent's environment", () => {
		const env = childEnv({ name: "xterm-256color", env: { FOO: "bar" } }, "/work", "linux", parent);
		expect(env).toEqual({ FOO: "bar", PWD: "/work", TERM: "xterm-256color" });
	});

	test("without a map the child gets the parent's environment", () => {
		const env = childEnv({ name: "xterm-256color" }, "/work", "darwin", parent);
		expect(env).toEqual({
			PATH: "/usr/bin:/bin",
			HOME: "/home/me",
			TERM: "xterm-256color",
			PWD: "/work",
		});
	});

	test("drops the parent's tmux and screen variables when the map is the parent's environment", () => {
		const env = childEnv({ env: parent }, "/work", "linux", parent);
		expect(Object.keys(env).sort()).toEqual(["HOME", "PATH", "PWD", "TERM"]);
	});

	test("keeps tmux and screen variables a supplied map sets", () => {
		const env = childEnv({ env: { TMUX: "mine", COLUMNS: "80" } }, "/work", "linux", parent);
		expect(env.TMUX).toBe("mine");
		expect(env.COLUMNS).toBe("80");
	});

	test("TERM comes from name, then from the environment, then the default", () => {
		expect(childEnv({ name: "vt100", env: { TERM: "dumb" } }, "/", "linux", parent).TERM).toBe("vt100");
		expect(childEnv({ env: { TERM: "dumb" } }, "/", "linux", parent).TERM).toBe("dumb");
		expect(childEnv({}, "/", "linux", parent).TERM).toBe("screen-256color");
		expect(childEnv({ env: {} }, "/", "linux", parent).TERM).toBe(DEFAULT_NAME);
	});

	test("PWD comes from cwd", () => {
		expect(childEnv({ env: { PWD: "/old" } }, "/work", "linux", parent).PWD).toBe("/work");
	});

	test("skips undefined values", () => {
		const env = childEnv({ env: { KEEP: "1", SKIP: undefined } }, "/", "linux", parent);
		expect(Object.keys(env).sort()).toEqual(["KEEP", "PWD", "TERM"]);
	});

	test("does not change the supplied map", () => {
		const supplied = { FOO: "bar" };
		childEnv({ name: "xterm", env: supplied }, "/work", "linux", parent);
		expect(supplied).toEqual({ FOO: "bar" });
	});
});

describe("childEnv on Windows", () => {
	test("passes the map as given, without TERM or PWD", () => {
		const env = childEnv({ name: "xterm-256color", env: { FOO: "bar" } }, "C:\\work", "win32", parent);
		expect(env).toEqual({ FOO: "bar" });
	});

	test("keeps an empty map empty, so the native side keeps the parent's environment", () => {
		expect(childEnv({ env: {} }, "C:\\work", "win32", parent)).toEqual({});
	});

	test("without a map the child gets the parent's environment unchanged", () => {
		const { UNSET, ...defined } = parent;
		expect(childEnv({}, "C:\\work", "win32", parent)).toEqual(defined);
	});
});

describe("formatEnv", () => {
	test("NUL-terminates each KEY=VALUE pair", () => {
		expect(formatEnv({ A: "1", B: "x=y" })).toBe("A=1\0B=x=y\0");
	});

	test("formats an empty environment as an empty string", () => {
		expect(formatEnv({})).toBe("");
	});
});
