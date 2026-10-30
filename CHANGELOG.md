# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-10-30

### Changed
- **Breaking:** bun-pty now requires Bun 1.4.0 or newer (#52)
  - It uses the engine-native `bun:ffi` that arrived in Bun 1.4, which Bun reports as up to 3x faster per call
  - On an older Bun, importing still works and `spawn()` throws "bun-pty needs Bun 1.4.0 or newer"; run `bun upgrade`
- Reads and writes pass the buffer and its byte length as one view (`"buffer"` + `"buffer_length"`), so the two cannot disagree; the command line and `cwd` go to the native library as plain strings (#52)
  - The `bun_pty_read` and `bun_pty_write` length argument is now `usize`; a custom library set with `BUN_PTY_LIB` must be built from this version
- Library load failures now include the operating system's `dlerror()` message (Bun 1.4)

### Fixed
- `write("")` no longer throws `bun:ffi cannot convert argument to 'ptr'` on Bun 1.4 (#52)

### Internal
- Update `@types/bun` 1.4.4, `@types/node` 26.6.6 and TypeScript 7.0.2, and move `bun.lock` to version 2 (#52)
- Update the Rust crates; `portable-pty` stays at 0.8.1 because of wezterm/wezterm#6783 (#52)
- Update GitHub Actions to their current major versions, drop persisted checkout credentials in the publish workflow, test on Alpine 3.24 and on Bun 1.4.0, and add a `bun check` type check (`bun run typecheck`) (#52)

## [0.5.2] - 2026-10-26

### Fixed
- When the native library fails to load, `spawn()` now throws an error naming the library path and the real cause, instead of `undefined is not an object (evaluating 'lib.symbols')` (#51)
  - Importing bun-pty no longer throws when no library file is found either; the error is reported from `spawn()`, and the load failure is still logged at import

## [0.5.1] - 2026-10-12

### Fixed
- Leave the `src/*.test.ts` files out of the npm package (#50)
  - `"files"` in `package.json` lists all of `src`, and npm does not apply `.npmignore` patterns to the paths it lists, so earlier tarballs included the tests

## [0.5.0] - 2026-10-12

### Changed
- **Breaking:** `env` is now the child's whole environment, as in node-pty, instead of being merged over the parent's (#48)
  - To keep inherited variables, spread `process.env`: `env: { ...process.env, FOO: "bar" }`
  - Without `env`, the child gets the current `process.env`, so changes made at runtime reach it (before, it got the environment the process started with)
  - When the map has no `PATH`, a bare program name such as `sh` is still found with the parent's `PATH`, which does not reach the child; on Unix, `argv[0]` is then the resolved path
  - On Windows, a map with no entries keeps the parent's environment, as in node-pty
- On Unix, the child's environment is now built as node-pty builds it (#49)
  - `TERM` is set from the `name` option, then from `TERM` in the environment, then "xterm"; `name` was ignored before
  - `PWD` is set from `cwd`
  - When the child inherits `process.env`, the parent's tmux and screen variables (`TMUX`, `TMUX_PANE`, `STY`, `WINDOW`, `WINDOWID`, `TERMCAP`) and its `COLUMNS` and `LINES` are dropped
- `IPtyForkOptions.name` is optional, and `env` accepts `undefined` values, which are skipped, so `env: process.env` type-checks (#49)

### Fixed
- Variables left out of `env`, such as tokens, no longer reach the child (#48)
  - Fixes #47

## [0.4.11] - 2026-09-30

### Added
- Native Windows ARM64 support (#46)
  - Ship a pre-built `rust_pty_arm64.dll` (built on GitHub's `windows-11-arm` runner for `aarch64-pc-windows-msvc`) alongside the existing x64 `rust_pty.dll`, whose filename is unchanged
  - Link the MSVC runtime statically (`-C target-feature=+crt-static`) to avoid a Visual C++ Redistributable dependency
  - Select the ARM64 DLL at runtime and in the `bun build --compile` embed path, falling back to `rust_pty.dll`
  - Move native library filename resolution into `src/library.ts` with unit tests
  - Add a `windows-11-arm` job to the test matrix that runs the unit and integration tests against the exact ARM64 artifact

## [0.4.10] - 2026-06-15

### Added
- musl libc support for Alpine Linux and other musl-based distros (#40)
  - Ship pre-built musl variants (`librust_pty_musl.so` / `librust_pty_arm64_musl.so`) alongside existing glibc builds via `cargo-zigbuild` with `-C target-feature=-crt-static`
  - Detect musl at runtime via `/proc/self/maps` and load the appropriate `.so`
  - Add `build-musl-lib` + `test-musl` CI jobs that cross-compile on Ubuntu and run the resulting artifact in `alpine:3.23`
  - Fixes #39

## [0.4.9] - 2026-06-07

### Fixed
- Don't treat transient PTY read/write errors (EINTR/EWOULDBLOCK) as EOF (#42)
  - Reader thread now retries transient read errors instead of treating them as EOF. Previously a single `EINTR` (e.g. from a delivered `SIGCHLD` in a signal-heavy host) or `EWOULDBLOCK` ended the reader, which flipped the PTY into an "exited" state — after which `bun_pty_write` silently dropped all input while the child was still alive (a "deaf" PTY)
  - Writer thread now retries transient write errors and drops only the current chunk on a fatal error, instead of permanently terminating and dropping all subsequent input
  - Fixes #41

## [0.4.8] - 2026-01-15

### Fixed
- Use TextDecoder streaming mode to handle UTF-8 across chunk boundaries (#33)
  - Enables TextDecoder's streaming mode to properly handle multi-byte UTF-8 characters split across read boundaries
  - Fixes garbled output when UTF-8 sequences are split between chunks

## [0.4.7] - 2026-01-10

### Changed
- Use glibc 2.17 via cargo-zigbuild for Linux builds (#30)
  - Updated build process to use cargo-zigbuild targeting glibc 2.17
  - Improves compatibility with older Linux distributions
  - Ensures binaries work on systems with glibc 2.17 and newer

## [0.4.6] - 2026-01-05

### Fixed
- Restore .d.ts type declarations for TypeScript compatibility (#28)
  - Added TypeScript declaration file generation to build process
  - Ensures proper type definitions are available for TypeScript users
  - Includes dist directory in published package for type declarations

## [0.4.5] - 2026-01-01

### Fixed
- Fixed build script to skip building when libraries already exist
  - Build script now checks for existing libraries before attempting to build
  - Prevents build failures in CI/CD when pre-built libraries are already present
  - Allows publish workflow to work without requiring Rust installation in publish job
  - Improves build performance by skipping unnecessary rebuilds

## [0.4.4] - 2025-12-31

### Fixed
- Enable bun compile support by shipping TypeScript source (#25)
  - Ship TypeScript source instead of bundled JS for static analysis
  - Add statically analyzable require() for native library embedding
  - Fix Windows library name (no 'lib' prefix)
  - Fix spaces in Windows exe path handling
  - Add Windows-specific tests
  - Add compile test script to verify bun build --compile works
  - Fixes: https://github.com/sursaone/bun-pty/issues/19

## [0.4.3] - 2025-12-30

### Fixed
- Use ubuntu-22.04 for GLIBC 2.35 compatibility (#23)
  - Updated CI/CD pipeline to use ubuntu-22.04 to ensure GLIBC 2.35 compatibility
  - Ensures built binaries work on systems with GLIBC 2.35 and newer

## [0.4.2] - 2025-12-01

### Fixed
- Fixed argument parsing to properly preserve arguments with spaces and special characters (#15)
  - Arguments containing spaces, quotes, or special characters are now correctly quoted
  - Prevents arguments from being incorrectly split into multiple tokens
  - Uses POSIX-style single quotes compatible with shell_words::split
  - Thanks to @snomiao for the initial implementation

## [0.4.1] - 2025-12-02

### Changed
- Updated examples and documentation
- Improved example code with better TypeScript usage patterns

## [0.4.0] - 2025-12-01

### Added
- Support for passing environment variables via options (#9)

### Fixed
- Fixed data loss in PTY read operations (#8)
- Fixed capture of actual exit code from child process (#10)
- Fixed build process and configuration

### Changed
- Removed rust build artifacts and updated .gitignore (#7)

## [0.3.2] - 2025-06-20

### Changed
- Updated package.json version
- Updated example to work with installed bun-pty package

### Fixed
- Removed erroneous console log (#4)

## [0.3.1] - 2025-05-15

### Fixed
- Fixed path resolution on Docker environments

## [0.3.0] - 2025-05-15

### Fixed
- Fixed release pipeline configuration

## [0.2.1] - 2025-05-15

### Fixed
- Fixed encoding issues with binary data from Docker and other applications
- Updated Rust code to properly handle non-UTF8 terminal control sequences
- Improved error handling in PTY read/write operations

## [0.2.0] - 2025-05-14

### Added
- Improved TypeScript support with complete type definitions
- Added TypeScript usage examples
- Enhanced documentation with TypeScript usage instructions

### Changed
- Optimized package size by excluding unnecessary files
- Improved build process for more reliable type generation

## [0.1.0] - 2025-05-13

### Added
- Initial release
- Cross-platform PTY support for macOS, Linux, and Windows
- Basic API for terminal process management
- Core PTY functionality: spawn, read, write, resize, and kill
- Process ID retrieval support
- TypeScript type definitions
- Integration tests 