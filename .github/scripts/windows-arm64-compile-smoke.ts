import { spawn } from "../../src/index";

const marker = "BUN_PTY_COMPILED_ARM64_OK";
const terminal = spawn("cmd.exe", ["/d", "/c", `echo ${marker}`], {
	name: "xterm",
	cols: 80,
	rows: 24,
	cwd: process.cwd(),
	env: process.env,
});

let output = "";

terminal.onData((data) => {
	output += data;
});

terminal.onExit(({ exitCode }) => {
	if (exitCode === 0 && output.includes(marker)) process.exit(0);
	console.error(`Compiled PTY smoke test failed with exit code ${exitCode}: ${output}`);
	process.exit(1);
});

setTimeout(() => {
	console.error(`Compiled PTY smoke test timed out: ${output}`);
	process.exit(1);
}, 5_000);
