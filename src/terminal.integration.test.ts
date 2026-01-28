import { describe, expect, test, afterEach } from "bun:test";
import { Terminal } from "./terminal";
import type { IExitEvent } from "./interfaces";

// This is an integration test file that runs tests against the actual Rust backend.
// Only run if the environment variable RUN_INTEGRATION_TESTS is set to "true"
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

// Platform detection for cross-platform tests
const isWindows = process.platform === "win32";

// Cross-platform command helpers
const shell = isWindows ? "cmd.exe" : "sh";
const shellExecFlag = isWindows ? "/c" : "-c";
const sleepCommand = (seconds: number) =>
  isWindows
    ? { cmd: "timeout", args: ["/t", String(seconds), "/nobreak", ">nul"] }
    : { cmd: "sleep", args: [String(seconds)] };
const echoCommand = (text: string) =>
  isWindows
    ? { cmd: "cmd.exe", args: ["/c", `echo ${text}`] }
    : { cmd: "echo", args: [text] };
const exitWithCodeCommand = (code: number) =>
  isWindows
    ? { cmd: "cmd.exe", args: ["/c", `exit ${code}`] }
    : { cmd: "sh", args: ["-c", `exit ${code}`] };

describe.skipIf(!runIntegrationTests)("Integration Tests", () => {
  // Keep track of terminals created so they can be cleaned up
  const terminals: Terminal[] = [];

  afterEach(() => {
    // Clean up any terminals created during tests
    for (const term of terminals) {
      try {
        term.kill();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    terminals.length = 0;
  });

  test("Terminal can spawn a real process", () => {
    const { cmd, args } = sleepCommand(1);
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    expect(terminal.pid).toBeGreaterThan(0);
  });

  test("Terminal can receive data from a real process", async () => {
    const { cmd, args } = echoCommand("Hello from Bun PTY");
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    let dataReceived = "";
    let hasExited = false;

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    const timeout = isWindows ? 5000 : 2000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(dataReceived).toContain("Hello from Bun PTY");
  });

  test.skipIf(isWindows)("Terminal can send data to a real process (Unix)", async () => {
    let dataReceived = "";
    let hasExited = false;

    // Use cat to echo back input (Unix only)
    const terminal = new Terminal("cat");
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("[TEST] Sending input: Hello from Bun PTY");
    terminal.write("Hello from Bun PTY\n");

    await new Promise((resolve) => setTimeout(resolve, 200));
    terminal.write("\x04"); // Send EOF (Ctrl+D) to close cat

    const timeout = 2000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(dataReceived).toContain("Hello from Bun PTY");
  });

  test("Terminal can run interactive shell session", async () => {
    let dataReceived = "";
    let hasExited = false;

    const terminal = new Terminal(shell);
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    // Give the shell time to start
    await new Promise((resolve) => setTimeout(resolve, isWindows ? 500 : 100));

    // Send commands
    if (isWindows) {
      terminal.write("echo Interactive Test\r\n");
      await new Promise((resolve) => setTimeout(resolve, 500));
      terminal.write("exit\r\n");
    } else {
      terminal.write("echo Hello\n");
      await new Promise((resolve) => setTimeout(resolve, 100));
      terminal.write("echo World\n");
      await new Promise((resolve) => setTimeout(resolve, 100));
      terminal.write("exit\n");
    }

    const timeout = isWindows ? 5000 : 2000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    if (isWindows) {
      expect(dataReceived).toContain("Interactive Test");
    } else {
      expect(dataReceived).toContain("Hello");
      expect(dataReceived).toContain("World");
    }
  });

  test("Terminal can resize a real terminal", async () => {
    const { cmd, args } = sleepCommand(1);
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    // Should not throw
    terminal.resize(100, 40);

    expect(terminal.cols).toBe(100);
    expect(terminal.rows).toBe(40);

    // Wait for process to exit
    await new Promise((resolve) => setTimeout(resolve, 1200));
  });

  test("Terminal can kill a real process", async () => {
    const { cmd, args } = sleepCommand(10);
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    let exitEvent: IExitEvent | null = null;
    terminal.onExit((event) => {
      console.log("[TEST] Process exited with event:", event);
      exitEvent = event;
    });

    // Give it a moment to start
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Kill the process
    terminal.kill();

    const timeout = isWindows ? 5000 : 2000;
    const start = Date.now();

    while (!exitEvent && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(exitEvent).not.toBeNull();
  });

  test("Terminal can retrieve the correct process ID", () => {
    const { cmd, args } = sleepCommand(5);
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    const pid = terminal.pid;
    console.log("[TEST] Process ID:", pid);
    expect(pid).toBeGreaterThan(0);

    // Verify this PID actually exists in the system
    let pidExists = false;

    try {
      // Sending signal 0 checks if process exists without affecting it
      process.kill(pid, 0);
      pidExists = true;
      console.log("[TEST] Process ID exists in system");
    } catch (error) {
      console.error("[TEST] Error checking process:", error);
    }

    expect(pidExists).toBe(true);

    terminal.kill();
  });

  test("Terminal can detect non-zero exit codes", async () => {
    let exitEvent: IExitEvent | null = null;

    // Run a command that exits with code 1
    const { cmd, args } = isWindows
      ? { cmd: "cmd.exe", args: ["/c", "exit 1"] }
      : { cmd: "false", args: [] as string[] };

    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    terminal.onExit((event) => {
      console.log("[TEST] Process exited with event:", event);
      exitEvent = event;
    });

    const timeout = isWindows ? 5000 : 2000;
    const start = Date.now();

    while (!exitEvent && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(exitEvent).not.toBeNull();
    const event = exitEvent!;
    expect(event.exitCode).not.toBe(0);
  });

  test.skipIf(isWindows)("Terminal handles large output without data loss (Unix)", async () => {
    let dataReceived = "";
    let hasExited = false;

    const terminal = new Terminal("sh");
    terminals.push(terminal);

    terminal.onData((data) => {
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send command to generate 1000 numbered lines
    terminal.write(
      'for i in $(seq 1 1000); do echo "Line $i: This is a test line to verify that no data is lost when reading from the PTY"; done\n'
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));
    terminal.write("exit\n");

    const timeout = 5000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    const lines = dataReceived.split("\n").filter((line) => line.includes("Line "));
    console.log(`[TEST] Received ${lines.length} lines of output`);

    const missingLines: number[] = [];
    for (let i = 1; i <= 1000; i++) {
      if (!dataReceived.includes(`Line ${i}:`)) {
        missingLines.push(i);
      }
    }

    if (missingLines.length > 0) {
      console.error(`[TEST] Missing lines: ${missingLines.join(", ")}`);
    }

    expect(missingLines.length).toBe(0);
    expect(lines.length).toBeGreaterThanOrEqual(1000);
  });

  test("Terminal preserves arguments with spaces correctly", async () => {
    let dataReceived = "";
    let hasExited = false;

    const { cmd, args } = echoCommand("hello world");
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    const timeout = isWindows ? 5000 : 2000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("[TEST] Full output received:", JSON.stringify(dataReceived));

    expect(dataReceived).toContain("hello world");

    const matches = dataReceived.match(/hello world/g);
    expect(matches).not.toBeNull();
    if (matches) {
      console.log(`[TEST] Found ${matches.length} occurrence(s) of "hello world"`);
    }
  });

  test.skipIf(isWindows)("Terminal preserves arguments with special characters correctly (Unix)", async () => {
    let dataReceived = "";
    let hasExited = false;

    const terminal = new Terminal("echo", ["file name (1).txt"]);
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    const timeout = 2000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("[TEST] Full output received:", JSON.stringify(dataReceived));

    expect(dataReceived).toContain("file name (1).txt");
  });

  test.skipIf(isWindows)("Terminal handles Windows paths with spaces (Windows)", async () => {
    // This test name is misleading but kept for compatibility - it tests paths with spaces
    let dataReceived = "";
    let hasExited = false;

    const terminal = new Terminal("echo", ["C:\\Program Files\\Test App"]);
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    const timeout = 2000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(dataReceived).toContain("Program Files");
  });

  // Windows-specific: Test PowerShell
  test.skipIf(!isWindows)("Terminal receives output from PowerShell", async () => {
    let dataReceived = "";
    let hasExited = false;

    const terminal = new Terminal("powershell.exe", [
      "-Command",
      "Write-Output 'Hello from PowerShell'",
    ]);
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    // PowerShell startup can be slow
    const timeout = 10000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(dataReceived).toContain("Hello from PowerShell");
  });

  // Windows-specific: Test environment variables
  test.skipIf(!isWindows)("Terminal passes environment variables on Windows", async () => {
    let dataReceived = "";
    let hasExited = false;

    const terminal = new Terminal("cmd.exe", ["/c", "echo %TEST_VAR%"], {
      name: "xterm",
      env: {
        TEST_VAR: "HelloFromEnv",
      },
    });
    terminals.push(terminal);

    terminal.onData((data) => {
      console.log("[TEST] Received data:", data);
      dataReceived += data;
    });

    terminal.onExit(() => {
      console.log("[TEST] Process exited");
      hasExited = true;
    });

    const timeout = 5000;
    const start = Date.now();

    while (!hasExited && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(dataReceived).toContain("HelloFromEnv");
  });

  test("Terminal onData listener receives data when set immediately after construction", async () => {
    const start = Date.now();
    const maxRuntime = 4000;
    let runnings = 1;
    while (Date.now() - start < maxRuntime) {
      console.log(`[TEST] Iteration ${runnings++}`);
      const { success, stdout, stderr } = Bun.spawnSync({
        cmd: ["bun", "test", "terminal.integration.test.ts", "--test-name-pattern", "Terminal sync tests"],
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SYNC_TESTS: "1" },
      });
      expect(success, `stderr: ${stderr}`).toBe(true);
    }
  });

  test.skipIf(!process.env.SYNC_TESTS)("Terminal sync tests", async () => {
    let dataReceived = "";
    let hasExited = false;

    const { cmd, args } = echoCommand("sync test");
    console.log("[TEST] Starting terminal with command:", cmd, args);
    const terminal = new Terminal(cmd, args);
    terminals.push(terminal);

    const exitPromise = new Promise<void>((resolve) => {
      terminal.onExit(() => {
        console.log("[TEST] Process exited");
        hasExited = true;
        resolve();
      });
    });
    const dataPromise = new Promise<void>((resolve) => {
      terminal.onData((data) => {
        console.log("[TEST] Received data:", data);
        dataReceived += data;
        if (dataReceived.includes("sync test"))
          resolve();
      });
      const timeout = isWindows ? 5000 : 2000;
      setTimeout(() => { resolve(); }, timeout); // Timeout to avoid hanging test
    });

    await Promise.race([exitPromise, dataPromise]);

    expect(dataReceived).toContain("sync test");
  });
});
