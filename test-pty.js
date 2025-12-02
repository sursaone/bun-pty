import { dlopen, FFIType, suffix, ptr } from "bun:ffi";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Find the library path
const libraryPath = join(import.meta.dir, "rust-pty", "target", "release", `librust_pty.${suffix}`);
if (!existsSync(libraryPath)) {
  console.error(`Error: Library not found at ${libraryPath}`);
  console.error("Please build the library first with 'cd rust-pty && cargo build --release'");
  process.exit(1);
}

console.log(`Opening shared library: ${libraryPath}`);

// Define the FFI interface
const lib = dlopen(libraryPath, {
  bun_pty_spawn: {
    args: [FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.i32, FFIType.i32],
    returns: FFIType.i32
  },
  bun_pty_read: {
    args: [FFIType.i32, FFIType.ptr, FFIType.i32],
    returns: FFIType.i32
  },
  bun_pty_write: {
    args: [FFIType.i32, FFIType.pointer, FFIType.i32],
    returns: FFIType.i32
  },
  bun_pty_resize: {
    args: [FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.i32
  },
  bun_pty_kill: {
    args: [FFIType.i32],
    returns: FFIType.i32
  },
  bun_pty_close: {
    args: [FFIType.i32],
    returns: FFIType.i32
  },
  bun_pty_get_pid: {
    args: [FFIType.i32],
    returns: FFIType.i32
  }
});

const { symbols } = lib;

async function runTest() {
  console.log("Creating PTY with bash...");
  
  // Create null-terminated C strings
  const cmd = Buffer.from("bash\0", "utf8");
  const cwd = Buffer.from(`${process.cwd()}\0`, "utf8");
  const env = Buffer.from("TEST_VAR=test_value\0\0", "utf8");

  const ptyHandle = symbols.bun_pty_spawn(cmd, cwd, env, 80, 24);
  
  if (ptyHandle < 0) {
    console.error("Failed to create PTY!");
    return;
  }
  
  console.log(`PTY created with handle: ${ptyHandle}`);
  
  // Get the process ID
  const pid = symbols.bun_pty_get_pid(ptyHandle);
  console.log(`Process ID: ${pid}`);
  
  // Function to read from the PTY
  function readPty() {
    const buffer = new Uint8Array(1024);
    const bytesRead = symbols.bun_pty_read(ptyHandle, buffer, buffer.length);
    
    if (bytesRead === -2) {
      console.log("Child process has exited.");
      return null;
    }
    
    if (bytesRead < 0) {
      console.error("Error reading from PTY");
      return null;
    }
    
    if (bytesRead === 0) {
      return "";
    }
    
    return new TextDecoder().decode(buffer.subarray(0, bytesRead));
  }
  
  // Wait for initial bash prompt
  console.log("Waiting for prompt...");
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Read initial output
  let output = readPty();
  if (output) console.log("Initial output:", output);
  
  // Send a command
  console.log("Sending 'echo Hello from Bun PTY' command...");
  const command = Buffer.from("echo Hello from Bun PTY\n", "utf8");
  symbols.bun_pty_write(ptyHandle, ptr(command), command.length);
  
  // Wait for command to execute
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Read command output
  output = readPty();
  if (output) console.log("Command output:", output);
  
  // Resize terminal
  console.log("Resizing terminal to 100x30...");
  symbols.bun_pty_resize(ptyHandle, 100, 30);
  
  // Send exit command
  console.log("Sending 'exit' command...");
  const exitCommand = Buffer.from("exit\n", "utf8");
  symbols.bun_pty_write(ptyHandle, ptr(exitCommand), exitCommand.length);
  
  // Wait for process to exit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Final read
  output = readPty();
  console.log("Final read result:", output);
  
  // Close PTY
  console.log("Closing PTY...");
  symbols.bun_pty_close(ptyHandle);
  console.log("Test completed!");
}

// Run the test
runTest().catch(err => {
  console.error("Test failed with error:", err);
}); 