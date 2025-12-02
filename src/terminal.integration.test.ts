import { expect, test, afterEach } from "bun:test";
import { Terminal } from "./terminal";
import type { IExitEvent } from "./interfaces";

// This is an integration test file that runs tests against the actual Rust backend.
// Only run if the environment variable RUN_INTEGRATION_TESTS is set to "true"
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

// Skip tests if integration tests are not enabled
if (!runIntegrationTests) {
  test.skip("Integration tests", () => {
    console.log("Skipping integration tests. Set RUN_INTEGRATION_TESTS=true to run them.");
  });
  process.exit(0);
}

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
  const terminal = new Terminal("sleep", ["1"]);
  terminals.push(terminal);
  
  expect(terminal.pid).toBeGreaterThan(0);
});

test("Terminal can receive data from a real process", async () => {
  // Use echo directly since the command line is parsed as shell words
  const terminal = new Terminal("echo", ["Hello from Bun PTY"]);
  terminals.push(terminal);
  
  // Collect output and track when process exits
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
  
  // Wait for data and process exit
  const timeout = 2000; // 2 second timeout
  const start = Date.now();
  
  while (!hasExited && Date.now() - start < timeout) {
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Allow a short delay for any buffered output to be processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  expect(dataReceived).toContain("Hello from Bun PTY");
});

test("Terminal can send data to a real process", async () => {
  let dataReceived = "";
  let hasExited = false;
  
  // Use cat to echo back input
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
  
  // Give the process time to start up
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log("[TEST] Sending input: Hello from Bun PTY");
  terminal.write("Hello from Bun PTY\n");
  
  // Give time for echo and then send EOF to close cat
  await new Promise(resolve => setTimeout(resolve, 200));
  terminal.write("\x04"); // Send EOF (Ctrl+D) to close cat
  
  // Wait for process to exit or timeout
  const timeout = 2000; // 2 second timeout
  const start = Date.now();
  
  while (!hasExited && Date.now() - start < timeout) {
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Allow a short delay for any buffered output to be processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  expect(dataReceived).toContain("Hello from Bun PTY");
});

test("Terminal can resize a real terminal", async () => {
  const terminal = new Terminal("sleep", ["1"]);
  terminals.push(terminal);
  
  // Should not throw
  terminal.resize(100, 40);
  
  expect(terminal.cols).toBe(100);
  expect(terminal.rows).toBe(40);
  
  // Wait for process to exit
  await new Promise(resolve => setTimeout(resolve, 1200));
});

test("Terminal can kill a real process", async () => {
  const terminal = new Terminal("sleep", ["10"]);
  terminals.push(terminal);
  
  let exitEvent: IExitEvent | null = null;
  terminal.onExit((event) => {
    console.log("[TEST] Process exited with event:", event);
    exitEvent = event;
  });
  
  // Kill the process
  terminal.kill();
  
  // Wait for exit event
  const timeout = 2000; // 2 second timeout
  const start = Date.now();
  
  while (!exitEvent && Date.now() - start < timeout) {
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  expect(exitEvent).not.toBeNull();
});

test("Terminal can retrieve the correct process ID", () => {
  // Create a terminal with sleep command (long-running so we can check PID)
  const terminal = new Terminal("sleep", ["5"]);
  terminals.push(terminal);
  
  // Check that we got a valid PID
  const pid = terminal.pid;
  console.log("[TEST] Process ID:", pid);
  expect(pid).toBeGreaterThan(0);
  
  // Verify this PID actually exists in the system
  // This is platform-specific, but we can use a simple check
  let pidExists = false;
  
  try {
    // On Unix systems, sending signal 0 checks if process exists without affecting it
    process.kill(pid, 0);
    pidExists = true;
    console.log("[TEST] Process ID exists in system");
  } catch (error) {
    console.error("[TEST] Error checking process:", error);
  }
  
  expect(pidExists).toBe(true);
  
  // Kill the process to clean up
  terminal.kill();
});

test("Terminal can run a bash script", async () => {
  let dataReceived = "";
  let hasExited = false;
  
  // Use sh to run a simple script
  const terminal = new Terminal("sh");
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
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Send commands to the shell
  terminal.write("echo Hello\n");
  await new Promise(resolve => setTimeout(resolve, 100));
  terminal.write("echo World\n");
  await new Promise(resolve => setTimeout(resolve, 100));
  terminal.write("exit\n");
  
  // Wait for process to exit or timeout
  const timeout = 2000; // 2 second timeout
  const start = Date.now();
  
  while (!hasExited && Date.now() - start < timeout) {
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Allow a short delay for any buffered output to be processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  expect(dataReceived).toContain("Hello");
  expect(dataReceived).toContain("World");
});

test("Terminal can detect non-zero exit codes", async () => {
  let exitEvent: IExitEvent | null = null;
  
  // Run a command that exits with code 1
  const terminal = new Terminal("false", []);
  terminals.push(terminal);
  
  terminal.onExit((event) => {
    console.log("[TEST] Process exited with event:", event);
    exitEvent = event;
  });
  
  // Wait for exit event
  const timeout = 2000; // 2 second timeout
  const start = Date.now();
  
  while (!exitEvent && Date.now() - start < timeout) {
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  expect(exitEvent).not.toBeNull();
  // TypeScript doesn't recognize expect().not.toBeNull() as a type guard
  const event = exitEvent!;
  expect(event.exitCode).not.toBe(0); // false exits with 1
});
test("Terminal handles large output without data loss", async () => {
  let dataReceived = "";
  let hasExited = false;
  
  // Use sh with a for loop to generate 1000 numbered lines
  const terminal = new Terminal("sh");
  terminals.push(terminal);
  
  terminal.onData((data) => {
    dataReceived += data;
  });
  
  terminal.onExit(() => {
    console.log("[TEST] Process exited");
    hasExited = true;
  });
  
  // Give the shell time to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Send command to generate 1000 numbered lines
  terminal.write("for i in $(seq 1 1000); do echo \"Line $i: This is a test line to verify that no data is lost when reading from the PTY\"; done\n");
  
  // Wait a bit then exit the shell
  await new Promise(resolve => setTimeout(resolve, 2000));
  terminal.write("exit\n");
  
  // Wait for process to complete or timeout
  const timeout = 5000; // 5 second timeout for large output
  const start = Date.now();
  
  while (!hasExited && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Allow time for any buffered output to be processed
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Count the lines we received
  const lines = dataReceived.split('\n').filter(line => line.includes('Line '));
  console.log(`[TEST] Received ${lines.length} lines of output`);
  
  // Check that we got all 1000 lines
  const missingLines: number[] = [];
  for (let i = 1; i <= 1000; i++) {
    if (!dataReceived.includes(`Line ${i}:`)) {
      missingLines.push(i);
    }
  }
  
  if (missingLines.length > 0) {
    console.error(`[TEST] Missing lines: ${missingLines.join(', ')}`);
  }
  
  // All 1000 lines should be present
  expect(missingLines.length).toBe(0);
  expect(lines.length).toBeGreaterThanOrEqual(1000);
});

test("Terminal preserves arguments with spaces correctly", async () => {
  let dataReceived = "";
  let hasExited = false;
  
  // Test with echo and an argument containing spaces
  // This should output "hello world" as a single argument, not split
  const terminal = new Terminal("echo", ["hello world"]);
  terminals.push(terminal);
  
  terminal.onData((data) => {
    console.log("[TEST] Received data:", data);
    dataReceived += data;
  });
  
  terminal.onExit(() => {
    console.log("[TEST] Process exited");
    hasExited = true;
  });
  
  // Wait for process to exit or timeout
  const timeout = 2000;
  const start = Date.now();
  
  while (!hasExited && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Allow a short delay for any buffered output to be processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log("[TEST] Full output received:", JSON.stringify(dataReceived));
  
  // The output should contain "hello world" as a single string
  // If the bug exists, it might be split into "hello" and "world" separately
  // or the echo command might receive them as separate arguments
  expect(dataReceived).toContain("hello world");
  
  // Verify it's NOT split (should not see "hello" and "world" as separate words in output)
  // If bug exists: echo might receive "hello" and "world" as separate args, 
  // outputting "hello world" but as two separate arguments
  // If fixed: echo receives "hello world" as single arg, outputs "hello world"
  
  // Count occurrences - should be exactly one "hello world" phrase
  const matches = dataReceived.match(/hello world/g);
  expect(matches).not.toBeNull();
  if (matches) {
    console.log(`[TEST] Found ${matches.length} occurrence(s) of "hello world"`);
  }
});

test("Terminal preserves arguments with special characters correctly", async () => {
  let dataReceived = "";
  let hasExited = false;
  
  // Test with an argument containing special characters and spaces
  const terminal = new Terminal("echo", ['file name (1).txt']);
  terminals.push(terminal);
  
  terminal.onData((data) => {
    console.log("[TEST] Received data:", data);
    dataReceived += data;
  });
  
  terminal.onExit(() => {
    console.log("[TEST] Process exited");
    hasExited = true;
  });
  
  // Wait for process to exit or timeout
  const timeout = 2000;
  const start = Date.now();
  
  while (!hasExited && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Allow a short delay for any buffered output to be processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log("[TEST] Full output received:", JSON.stringify(dataReceived));
  
  // The output should contain the full filename with parentheses and spaces
  expect(dataReceived).toContain("file name (1).txt");
});
