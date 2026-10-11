import { Buffer } from "node:buffer";

/**
 * Interface for disposable resources.
 */
export interface IDisposable {
  /**
   * Disposes the resource, performing any necessary cleanup.
   */
  dispose(): void;
}

/**
 * Event implementation for the terminal.
 */
export class EventEmitter<T> {
  private listeners: ((data: T) => void)[] = [];

  public event = (listener: (e: T) => void): IDisposable => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(listener);
        if (i !== -1) {
          this.listeners.splice(i, 1);
        }
      }
    };
  };

  public fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}

/**
 * Options for spawning a new PTY process.
 */
export interface IPtyForkOptions {
  /**
   * The terminal type, set as TERM in the child's environment on Unix.
   * Defaults to TERM from the environment, then "xterm".
   */
  name?: string;

  /**
   * The number of columns in the PTY.
   */
  cols?: number;

  /**
   * The number of rows in the PTY.
   */
  rows?: number;

  /**
   * The current working directory of the process.
   * Defaults to the current working directory of the parent process.
   */
  cwd?: string;

  /**
   * The child's whole environment, as in node-pty: it replaces the parent's
   * environment instead of adding to it, so pass
   * `{ ...process.env, FOO: "bar" }` to add variables. Entries whose value
   * is undefined are skipped. Defaults to `process.env`.
   */
  env?: Record<string, string | undefined>;
}

/**
 * Exit data for PTY process.
 */
export interface IExitEvent {
  /**
   * The process exit code.
   */
  exitCode: number;

  /**
   * The signal that caused the process to exit, if any.
   */
  signal?: number | string;
}

/**
 * Interface for interacting with a pseudo-terminal (PTY) instance.
 */
export interface IPty {
  /**
   * The PID of the process running in the PTY.
   */
  readonly pid: number;

  /**
   * The column size in characters.
   */
  readonly cols: number;

  /**
   * The row size in characters.
   */
  readonly rows: number;

  /**
   * The title of the active process.
   */
  readonly process: string;

  /**
   * Set a callback for when data is received from the PTY.
   */
  readonly onData: (listener: (data: string) => void) => IDisposable;

  /**
   * Event emitted when the PTY process exits.
   */
  readonly onExit: (listener: (event: IExitEvent) => void) => IDisposable;

  /**
   * Write data to the PTY.
   *
   * @param data - The data to write.
   */
  write(data: string): void;

  /**
   * Resize the PTY.
   *
   * @param columns - Number of columns (character width).
   * @param rows - Number of rows (character height).
   */
  resize(columns: number, rows: number): void;

  /**
   * Kill the process running in the PTY.
   *
   * @param signal - The signal to send to the process.
   * Defaults to "SIGTERM".
   */
  kill(signal?: string): void;
} 