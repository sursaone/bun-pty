/**
 * Example showing how to use bun-pty with TypeScript
 */
import { spawn } from 'bun-pty';
import type { IPty, IExitEvent } from 'bun-pty';

// Type-safe options
interface TerminalOptions {
  shell: string;
  args?: string[];
  cwd?: string;
  termName?: string;
  env?: Record<string, string>;
}

/**
 * Creates a terminal with the given options
 */
function createTypedTerminal(options: TerminalOptions): IPty {
  const {
    shell,
    args = [],
    cwd = process.cwd(),
    termName = 'xterm-256color',
    env
  } = options;
  
  return spawn(shell, args, {
    name: termName,
    cwd,
    cols: 100,
    rows: 30,
    env
  });
}

// Usage example with full type safety
async function main() {
  // Create a terminal running bash with custom environment variables
  const terminal = createTypedTerminal({
    shell: 'bash',
    termName: 'xterm-256color',
    cwd: process.cwd(), // Custom working directory
    env: {
      CUSTOM_VAR: 'custom_value',
      EXAMPLE_ENV: 'bun-pty-example'
    }
  });
  
  console.log(`Terminal created with PID: ${terminal.pid}`);
  console.log(`Terminal size: ${terminal.cols}x${terminal.rows}`);
  console.log(`Process name: ${terminal.process}`);
  
  // Add event listeners
  const dataHandler = terminal.onData((data: string) => {
    process.stdout.write(data);
  });
  
  const exitHandler = terminal.onExit((event: IExitEvent) => {
    console.log(`\nTerminal exited with code: ${event.exitCode}`);
    if (event.signal) {
      console.log(`Exit signal: ${event.signal}`);
    }
    process.exit(0);
  });
  
  // Write some commands
  terminal.write('echo "Hello from TypeScript with bun-pty"\n');
  terminal.write('echo "Custom env var: $CUSTOM_VAR"\n');
  
  // Resize the terminal
  terminal.resize(120, 40);
  console.log(`Terminal resized to: ${terminal.cols}x${terminal.rows}`);
  
  // Exit after 5 seconds using kill() method
  setTimeout(() => {
    console.log('\nKilling terminal with SIGTERM...');
    // Demonstrate kill() method with signal
    terminal.kill('SIGTERM');
    
    // Clean up event handlers
    dataHandler.dispose();
    exitHandler.dispose();
  }, 5000);
}

// Run the example
if (import.meta.main) {
  main().catch(console.error);
} 