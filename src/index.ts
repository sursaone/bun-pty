/**
 * The main export module for bun-pty.
 * Provides a cross-platform PTY interface for Bun runtime.
 */

import { Terminal } from './terminal';
import type { IPty, IPtyForkOptions, IExitEvent, IDisposable } from './interfaces';

/**
 * Creates and spawns a new PTY with the given command and arguments.
 * 
 * @param file - Path to the executable to run.
 * @param args - Arguments for the executable.
 * @param options - Options for the PTY.
 * @returns A new PTY instance.
 */
export function spawn(file: string, args: string[], options: IPtyForkOptions): IPty {
    return new Terminal(file, args, options);
}

// Export interfaces and implementations
export type { IPty, IPtyForkOptions, IExitEvent, IDisposable };
export { Terminal } from './terminal'; 