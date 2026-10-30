# Contributing to bun-pty

Thank you for considering contributing to bun-pty! This document outlines the process for contributing to the project.

## Code of Conduct

Please be respectful and considerate of others when contributing to this project. We aim to foster an inclusive and welcoming community.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a new branch for your changes
5. Make your changes
6. Run tests to ensure everything works
7. Submit a pull request

## Development Environment Setup

### Prerequisites

- Bun 1.0.0 or higher
- Rust and Cargo
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/bun-pty.git
cd bun-pty

# Install dependencies
bun install

# Build the project
bun run build
```

## Making Changes

1. Create a new branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes to the codebase.

3. Test your changes:
   ```bash
   bun test
   ```

4. Commit your changes with a meaningful commit message:
   ```bash
   git commit -m "feat: add new feature"
   ```

   We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages.

5. Push your changes to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a pull request on GitHub.

## Pull Request Guidelines

- Keep pull requests focused on a single issue/feature
- Include tests for new features or bug fixes
- Update documentation as necessary
- Follow the existing code style
- Make sure all tests pass before submitting

## Testing

We have different types of tests:

```bash
# Run unit tests
bun run test:unit

# Run integration tests
bun run test:integration

# Run all tests
bun run test:all

# Type check the sources and tests
bun run typecheck
```

## Project Structure

- `src/` - TypeScript source code
- `rust-pty/src/` - Rust FFI implementation
- `dist/` - Build output directory

## Building the Project

```bash
# Build Rust library
bun run build:rust

# Build TypeScript
bun run build:ts

# Build everything
bun run build
```

## Releasing

Releases are managed by the project maintainers. Version numbers follow [Semantic Versioning](https://semver.org/).

## License

By contributing to bun-pty, you agree that your contributions will be licensed under the project's MIT license. 