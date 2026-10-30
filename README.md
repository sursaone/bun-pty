# bun-pty

[![NPM Version](https://img.shields.io/npm/v/bun-pty.svg)](https://www.npmjs.com/package/bun-pty)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun Compatible](https://img.shields.io/badge/Bun-%E2%89%A51.4.0-black)](https://bun.sh)

A cross-platform pseudo-terminal (PTY) implementation for Bun, powered by Rust's portable-pty library and Bun's FFI capabilities.

## 🚀 Features

- **Cross-platform** - Works on macOS, Linux, and Windows
- **Simple API** - Clean Promise-based API similar to node-pty
- **Type-safe** - Complete TypeScript definitions included
- **Efficient** - Rust backend with proper error handling and multithreading
- **Zero dependencies** - No external JavaScript dependencies required
- **Modern** - Built specifically for Bun using its FFI capabilities

## 📦 Installation

```bash
bun add bun-pty
```

## ⚙️ Requirements

- **Bun** 1.4.0 or higher (bun-pty uses the engine-native `bun:ffi` added in Bun 1.4)
- **Rust** is only needed if you're building from source (the npm package includes pre-built binaries)

## 📋 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS    | ✅     | Fully supported |
| Linux    | ✅     | Fully supported |
| Windows  | ✅     | Fully supported |

## 🆚 bun-pty or `Bun.Terminal`?

Bun 1.4 has a built-in PTY, [`Bun.Terminal`](https://bun.com/docs/runtime/child-process#terminal-pty-support) (`Bun.spawn({ terminal })`). If you are writing new code and only need Bun's own API, try it first: it needs no native library.

bun-pty is the better fit when you want:

- **The node-pty API** - `spawn()`, `onData`, `onExit`, `resize()` and `kill()` with node-pty's types, so code written for node-pty (or xterm.js integrations built on it) runs on Bun unchanged
- **node-pty's environment rules** - `env` is the child's whole environment, `TERM` comes from `name`, and `PWD` follows `cwd`
- **The same backend on every platform** - one Rust ([portable-pty](https://crates.io/crates/portable-pty)) implementation on macOS, Linux (glibc and musl) and Windows (x64 and ARM64)

## 🚦 Usage

### Basic Example

```typescript
import { spawn } from "bun-pty";

// Create a new terminal
const terminal = spawn("bash", [], {
  name: "xterm-256color",
  cols: 80,
  rows: 24
});

// Handle data from the terminal
terminal.onData((data) => {
  console.log("Received:", data);
});

// Handle terminal exit
terminal.onExit(({ exitCode, signal }) => {
  console.log(`Process exited with code ${exitCode} and signal ${signal}`);
});

// Write to the terminal
terminal.write("echo Hello from Bun PTY\n");

// Resize the terminal
terminal.resize(100, 40);

// Kill the process when done
setTimeout(() => {
  terminal.kill();
}, 5000);
```

### TypeScript Usage

The library includes complete TypeScript definitions. Here's how to use it with full type safety:

```typescript
import { spawn } from "bun-pty";
import type { IPty, IExitEvent, IPtyForkOptions } from "bun-pty";

// Create typed options
const options: IPtyForkOptions = {
  name: "xterm-256color",
  cols: 100,
  rows: 30,
  cwd: process.cwd()
};

// Create a terminal with proper typing
const terminal: IPty = spawn("bash", [], options);

// Typed event handlers
const dataHandler = terminal.onData((data: string) => {
  process.stdout.write(data);
});

const exitHandler = terminal.onExit((event: IExitEvent) => {
  console.log(`Process exited with code: ${event.exitCode}`);
});

// Clean up when done
dataHandler.dispose();
exitHandler.dispose();
```

### Interactive Shell Example

```typescript
import { spawn } from "bun-pty";
import { createInterface } from "node:readline";

// Create a PTY running bash
const pty = spawn("bash", [], {
  name: "xterm-256color",
  cwd: process.cwd()
});

// Forward PTY output to stdout
pty.onData((data) => {
  process.stdout.write(data);
});

// Send user input to the PTY
process.stdin.on("data", (data) => {
  pty.write(data.toString());
});

// Handle PTY exit
pty.onExit(() => {
  console.log("Terminal session ended");
  process.exit(0);
});

// Handle SIGINT (Ctrl+C)
process.on("SIGINT", () => {
  pty.kill();
});
```

## 📖 API Reference

### `spawn(file: string, args: string[], options: IPtyForkOptions): IPty`

Creates and spawns a new pseudoterminal.

- `file`: The executable to launch
- `args`: Arguments to pass to the executable
- `options`: Configuration options
  - `name`: Terminal type (e.g., "xterm-256color"), set as `TERM` in the child's environment on Unix (default: `TERM` from `env`, then "xterm")
  - `cols`: Number of columns (default: 80)
  - `rows`: Number of rows (default: 24)
  - `cwd`: Working directory (default: process.cwd())
  - `env`: The child's whole environment, as in node-pty (default: `process.env`). It replaces the parent's environment, so pass `{ ...process.env, FOO: "bar" }` to add variables. Entries whose value is `undefined` are skipped. On Windows, a map with no entries keeps the parent's environment, as in node-pty. On Unix, `PWD` is set from `cwd`, and when the child inherits `process.env`, variables from the parent's tmux or screen session (`TMUX`, `STY`, ...) are dropped

Returns an `IPty` instance.

### `IPty` Interface

```typescript
interface IPty {
  // Properties
  readonly pid: number;        // Process ID
  readonly cols: number;       // Current columns
  readonly rows: number;       // Current rows
  readonly process: string;    // Process name
  
  // Events
  onData: (listener: (data: string) => void) => IDisposable;
  onExit: (listener: (event: IExitEvent) => void) => IDisposable;
  
  // Methods
  write(data: string): void;   // Write data to terminal
  resize(cols: number, rows: number): void;  // Resize terminal
  kill(signal?: string): void;  // Kill the process
}
```

### Event Types

```typescript
interface IExitEvent {
  exitCode: number;
  signal?: number | string;
}

interface IDisposable {
  dispose(): void;
}
```

## 🧪 Testing

bun-pty uses [Bun's built-in test runner](https://bun.com/docs/test) for fast, Jest-compatible testing.

```bash
# Run all tests
bun test

# Run unit tests only
bun run test:unit

# Run integration tests (requires Rust library)
bun run test:integration

# View test coverage
bun run test:coverage

# Type check the sources and tests (bun check, Bun 1.4.3+)
bun run typecheck
```

## 🔧 Building from Source

If you want to build the package from source:

```bash
# Clone the repository
git clone https://github.com/sursaone/bun-pty.git
cd bun-pty

# Install dependencies
bun install

# Build Rust library and TypeScript
bun run build

# Run tests
bun test
```

## ❓ Troubleshooting

### Prebuilt Binaries

The npm package includes prebuilt binaries for macOS, Linux, and Windows. If you encounter issues with the prebuilt binaries, you can build from source:

```bash
# In your project directory
bun add bun-pty
cd node_modules/bun-pty
bun run build
```

### Common Issues

- **Error: Unable to load shared library**: Make sure you have the necessary system libraries installed.
- **Process spawn fails**: Check if you have the required permissions and paths.

## 📚 Documentation

- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🙏 Credits

- Built specifically for [Bun](https://bun.sh/)
- Uses [portable-pty](https://github.com/wez/wezterm/tree/main/pty) from WezTerm for cross-platform PTY support
- Inspired by [node-pty](https://github.com/microsoft/node-pty) for the API design
