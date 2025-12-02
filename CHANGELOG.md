# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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