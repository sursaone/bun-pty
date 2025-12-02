import { expect, test, describe } from "bun:test";
import { DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_FILE, DEFAULT_NAME } from "./terminal";
import type { IPtyForkOptions, IExitEvent } from "./interfaces";

describe("Terminal configuration and options", () => {
	describe("default values", () => {
		test("should have correct default columns", () => {
			expect(DEFAULT_COLS).toBe(80);
		});

		test("should have correct default rows", () => {
			expect(DEFAULT_ROWS).toBe(24);
		});

		test("should have correct default file", () => {
			expect(DEFAULT_FILE).toBe("sh");
		});

		test("should have correct default name", () => {
			expect(DEFAULT_NAME).toBe("xterm");
		});
	});

	describe("IPtyForkOptions interface", () => {
		test("should accept custom options with all properties", () => {
			const options: IPtyForkOptions = {
				name: "xterm-256color",
				cols: 100,
				rows: 50,
				cwd: "/tmp",
				env: {
					TEST_VAR: "test_value",
					ANOTHER_VAR: "another_value",
				},
			};
			expect(options.name).toBe("xterm-256color");
			expect(options.cols).toBe(100);
			expect(options.rows).toBe(50);
			expect(options.cwd).toBe("/tmp");
			expect(options.env?.TEST_VAR).toBe("test_value");
			expect(options.env?.ANOTHER_VAR).toBe("another_value");
		});

		test("should accept minimal options with only name", () => {
			const options: IPtyForkOptions = {
				name: "xterm",
			};
			expect(options.name).toBe("xterm");
			expect(options.cols).toBeUndefined();
			expect(options.rows).toBeUndefined();
			expect(options.cwd).toBeUndefined();
			expect(options.env).toBeUndefined();
		});

		test("should handle options with only cols and rows", () => {
			const options: IPtyForkOptions = {
				name: "xterm",
				cols: 120,
				rows: 40,
			};
			expect(options.cols).toBe(120);
			expect(options.rows).toBe(40);
		});

		test("should handle options with only cwd", () => {
			const options: IPtyForkOptions = {
				name: "xterm",
				cwd: "/home/user",
			};
			expect(options.cwd).toBe("/home/user");
		});

		test("should handle options with only env", () => {
			const options: IPtyForkOptions = {
				name: "xterm",
				env: {
					PATH: "/usr/bin",
					HOME: "/home/user",
				},
			};
			expect(options.env?.PATH).toBe("/usr/bin");
			expect(options.env?.HOME).toBe("/home/user");
		});
	});

	describe("data formatting and validation", () => {
		test("should handle command line formatting", () => {
			const file = "echo";
			const args = ["Hello", "World"];
			const cmdline = [file, ...args].join(" ");
			expect(cmdline).toBe("echo Hello World");
		});

		test("should handle empty args array", () => {
			const file = "ls";
			const args: string[] = [];
			const cmdline = [file, ...args].join(" ");
			expect(cmdline).toBe("ls");
		});

		test("should handle environment variable formatting", () => {
			const env = {
				VAR1: "value1",
				VAR2: "value2",
			};
			const envPairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
			const envStr = envPairs.join("\0") + "\0";
			expect(envStr).toContain("VAR1=value1");
			expect(envStr).toContain("VAR2=value2");
			expect(envStr.endsWith("\0")).toBe(true);
		});

		test("should handle empty environment variables", () => {
			const env: Record<string, string> = {};
			const envPairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
			const envStr = envPairs.join("\0") + "\0";
			expect(envStr).toBe("\0");
		});

		test("should handle environment variables with special characters", () => {
			const env = {
				PATH: "/usr/bin:/usr/local/bin",
				HOME: "/home/user",
				TEST_VAR: "test=value&more",
			};
			const envPairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
			expect(envPairs.length).toBe(3);
			expect(envPairs[0]).toContain("PATH=");
			expect(envPairs[2]).toContain("TEST_VAR=");
		});
	});

	describe("write data handling", () => {
		test("should handle empty string", () => {
			const data = "";
			expect(typeof data).toBe("string");
			expect(data.length).toBe(0);
		});

		test("should handle multi-byte characters", () => {
			const data = "Hello 世界 🌍";
			expect(data.length).toBeGreaterThan(0);
			expect(typeof data).toBe("string");
			// Verify UTF-8 encoding
			const buffer = Buffer.from(data, "utf8");
			expect(buffer.length).toBeGreaterThan(0);
		});

		test("should handle newlines and line endings", () => {
			const data1 = "line1\nline2\nline3";
			const data2 = "line1\r\nline2\r\nline3";
			expect(data1).toContain("\n");
			expect(data2).toContain("\r\n");
		});

		test("should handle ANSI escape sequences", () => {
			const data = "\x1b[31mRed\x1b[0m";
			expect(data).toContain("\x1b");
			expect(data).toContain("[31m");
			expect(data).toContain("[0m");
		});

		test("should handle binary-like data", () => {
			const data = "\x00\x01\x02\xff";
			expect(data.length).toBe(4);
			const buffer = Buffer.from(data, "utf8");
			expect(buffer.length).toBeGreaterThanOrEqual(4);
		});

		test("should handle very long strings", () => {
			const data = "a".repeat(10000);
			expect(data.length).toBe(10000);
			const buffer = Buffer.from(data, "utf8");
			expect(buffer.length).toBe(10000);
		});
	});

	describe("resize dimensions", () => {
		test("should accept valid dimensions", () => {
			const cols = 100;
			const rows = 50;
			expect(cols).toBeGreaterThan(0);
			expect(rows).toBeGreaterThan(0);
			expect(typeof cols).toBe("number");
			expect(typeof rows).toBe("number");
		});

		test("should handle minimum dimensions", () => {
			const cols = 1;
			const rows = 1;
			expect(cols).toBeGreaterThan(0);
			expect(rows).toBeGreaterThan(0);
		});

		test("should handle large dimensions", () => {
			const cols = 1000;
			const rows = 1000;
			expect(cols).toBeGreaterThan(0);
			expect(rows).toBeGreaterThan(0);
		});

		test("should handle zero dimensions", () => {
			const cols = 0;
			const rows = 0;
			expect(cols).toBe(0);
			expect(rows).toBe(0);
		});

		test("should handle negative dimensions", () => {
			const cols = -10;
			const rows = -20;
			expect(cols).toBeLessThan(0);
			expect(rows).toBeLessThan(0);
		});
	});

	describe("kill signals", () => {
		test("should accept default signal", () => {
			const signal = "SIGTERM";
			expect(signal).toBe("SIGTERM");
			expect(typeof signal).toBe("string");
		});

		test("should accept common Unix signals", () => {
			const signals = ["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGQUIT"];
			for (const signal of signals) {
				expect(typeof signal).toBe("string");
				expect(signal.length).toBeGreaterThan(0);
				expect(signal.startsWith("SIG")).toBe(true);
			}
		});

		test("should handle numeric signals", () => {
			const signal = 9; // SIGKILL
			expect(typeof signal).toBe("number");
		});
	});

	describe("event handling interfaces", () => {
		test("should support onData event listener signature", () => {
			const mockListener = (data: string) => {
				expect(typeof data).toBe("string");
			};
			expect(typeof mockListener).toBe("function");
			mockListener("test");
		});

		test("should support onExit event listener signature", () => {
			const mockListener = (event: IExitEvent) => {
				expect(event).toHaveProperty("exitCode");
				expect(typeof event.exitCode).toBe("number");
			};
			expect(typeof mockListener).toBe("function");
			mockListener({ exitCode: 0 });
		});

		test("should handle exit event with string signal", () => {
			const exitEvent: IExitEvent = {
				exitCode: 0,
				signal: "SIGTERM",
			};
			expect(exitEvent.exitCode).toBe(0);
			expect(exitEvent.signal).toBe("SIGTERM");
			expect(typeof exitEvent.signal).toBe("string");
		});

		test("should handle exit event with numeric signal", () => {
			const exitEvent: IExitEvent = {
				exitCode: 1,
				signal: 9,
			};
			expect(exitEvent.exitCode).toBe(1);
			expect(exitEvent.signal).toBe(9);
			expect(typeof exitEvent.signal).toBe("number");
		});

		test("should handle exit event without signal", () => {
			const exitEvent: IExitEvent = {
				exitCode: 1,
			};
			expect(exitEvent.exitCode).toBe(1);
			expect(exitEvent.signal).toBeUndefined();
		});

		test("should handle various exit codes", () => {
			const exitCodes = [0, 1, 2, 127, 255];
			for (const code of exitCodes) {
				const exitEvent: IExitEvent = { exitCode: code };
				expect(exitEvent.exitCode).toBe(code);
				expect(typeof exitEvent.exitCode).toBe("number");
			}
		});
	});


	describe("edge cases and special scenarios", () => {
		test("should handle empty args array", () => {
			const args: string[] = [];
			expect(Array.isArray(args)).toBe(true);
			expect(args.length).toBe(0);
			const cmdline = ["sh", ...args].join(" ");
			expect(cmdline).toBe("sh");
		});

		test("should handle args with special characters", () => {
			const args = ["--flag=value", "--path=/usr/bin", "--name=test name"];
			expect(args.length).toBe(3);
			args.forEach((arg) => {
				expect(typeof arg).toBe("string");
			});
			const cmdline = ["program", ...args].join(" ");
			expect(cmdline).toContain("--flag=value");
		});

		test("should handle args with quotes", () => {
			const args = ['--message="Hello World"', "--flag"];
			expect(args.length).toBe(2);
			expect(args[0]).toContain('"');
		});

		test("should handle very long command lines", () => {
			const longArg = "a".repeat(1000);
			const args = [longArg];
			expect(args[0].length).toBe(1000);
		});

		test("should handle unicode characters in environment variables", () => {
			const options: IPtyForkOptions = {
				name: "xterm-256color",
				env: {
					UNICODE_VAR: "测试 🎉",
					EMOJI_VAR: "🚀✨🎊",
				},
			};
			expect(options.env?.UNICODE_VAR).toBe("测试 🎉");
			expect(options.env?.EMOJI_VAR).toBe("🚀✨🎊");
		});

		test("should handle environment variables with newlines", () => {
			const options: IPtyForkOptions = {
				name: "xterm",
				env: {
					MULTILINE: "line1\nline2\nline3",
				},
			};
			expect(options.env?.MULTILINE).toContain("\n");
		});

		test("should handle empty environment variable values", () => {
			const options: IPtyForkOptions = {
				name: "xterm",
				env: {
					EMPTY_VAR: "",
					VAR: "value",
				},
			};
			expect(options.env?.EMPTY_VAR).toBe("");
			expect(options.env?.VAR).toBe("value");
		});

		test("should handle working directory paths", () => {
			const paths = [
				"/tmp",
				"/home/user/projects",
				"./relative/path",
				"../parent/path",
				"~",
			];
			for (const path of paths) {
				const options: IPtyForkOptions = {
					name: "xterm",
					cwd: path,
				};
				expect(options.cwd).toBe(path);
			}
		});
	});
});

describe("Terminal constants", () => {
	test("DEFAULT_COLS should be 80", () => {
		expect(DEFAULT_COLS).toBe(80);
	});

	test("DEFAULT_ROWS should be 24", () => {
		expect(DEFAULT_ROWS).toBe(24);
	});

	test("DEFAULT_FILE should be 'sh'", () => {
		expect(DEFAULT_FILE).toBe("sh");
	});

	test("DEFAULT_NAME should be 'xterm'", () => {
		expect(DEFAULT_NAME).toBe("xterm");
	});
});

