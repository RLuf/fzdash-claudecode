/**
 * Terminal Service
 * PTY-based terminal emulator for web shell access
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import os from 'os';

export interface TerminalSession {
  id: string;
  pty: pty.IPty;
  cols: number;
  rows: number;
  cwd: string;
  shell: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
  timestamp: Date;
}

export interface TerminalOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
}

const DEFAULT_SHELL = os.platform() === 'win32' 
  ? 'powershell.exe' 
  : process.env.SHELL || '/bin/bash';

export class TerminalService extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private maxBufferSize = 10000; // Max lines to buffer

  constructor() {
    super();
  }

  create(options: TerminalOptions = {}): TerminalSession {
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const cols = options.cols || 120;
    const rows = options.rows || 40;
    const cwd = options.cwd || process.cwd();
    const shell = options.shell || DEFAULT_SHELL;

    const env = {
      ...process.env,
      ...options.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    } as Record<string, string>;

    const shellArgs = os.platform() === 'win32' 
      ? [] 
      : ['--login'];

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env
    });

    const session: TerminalSession = {
      id: sessionId,
      pty: ptyProcess,
      cols,
      rows,
      cwd,
      shell,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    this.outputBuffers.set(sessionId, []);

    // Handle output
    ptyProcess.onData((data) => {
      session.lastActivity = new Date();
      
      // Buffer output
      const buffer = this.outputBuffers.get(sessionId) || [];
      buffer.push(data);
      if (buffer.length > this.maxBufferSize) {
        buffer.shift();
      }
      this.outputBuffers.set(sessionId, buffer);

      // Emit for real-time streaming
      const output: TerminalOutput = {
        sessionId,
        data,
        timestamp: new Date()
      };
      this.emit('output', output);
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', { sessionId, exitCode, signal });
      this.sessions.delete(sessionId);
      this.outputBuffers.delete(sessionId);
    });

    this.emit('created', { sessionId, shell, cwd });
    return session;
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.pty.write(data);
    session.lastActivity = new Date();
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.pty.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
    return true;
  }

  kill(sessionId: string, signal?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.pty.kill(signal);
    return true;
  }

  destroy(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.pty.kill();
    } catch {
      // Already dead
    }

    this.sessions.delete(sessionId);
    this.outputBuffers.delete(sessionId);
    this.emit('destroyed', { sessionId });
    return true;
  }

  destroyAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.destroy(sessionId);
    }
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  getOutputBuffer(sessionId: string): string[] {
    return this.outputBuffers.get(sessionId) || [];
  }

  getFullOutput(sessionId: string): string {
    const buffer = this.outputBuffers.get(sessionId);
    return buffer ? buffer.join('') : '';
  }

  clearOutputBuffer(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) return false;
    this.outputBuffers.set(sessionId, []);
    return true;
  }

  // Execute single command and return output
  async exec(
    command: string,
    options: TerminalOptions & { timeout?: number } = {}
  ): Promise<{ output: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 30000;
      const session = this.create(options);
      let output = '';
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.destroy(session.id);
          reject(new Error(`Command timed out after ${timeout}ms`));
        }
      }, timeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.removeListener('output', onOutput);
        this.removeListener('exit', onExit);
      };

      const onOutput = (data: TerminalOutput) => {
        if (data.sessionId === session.id) {
          output += data.data;
        }
      };

      const onExit = (data: { sessionId: string; exitCode: number | null }) => {
        if (data.sessionId === session.id && !resolved) {
          resolved = true;
          cleanup();
          resolve({ output, exitCode: data.exitCode });
        }
      };

      this.on('output', onOutput);
      this.on('exit', onExit);

      // Write command and exit
      const exitCmd = os.platform() === 'win32' ? '\r\nexit\r\n' : '\nexit\n';
      session.pty.write(command + exitCmd);
    });
  }

  // Check if session is active
  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  // Get session count
  getSessionCount(): number {
    return this.sessions.size;
  }

  // Get sessions by shell type
  getSessionsByShell(shell: string): TerminalSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.shell.includes(shell));
  }

  // Get idle sessions (no activity for specified ms)
  getIdleSessions(idleMs: number = 300000): TerminalSession[] {
    const now = Date.now();
    return Array.from(this.sessions.values())
      .filter(s => now - s.lastActivity.getTime() > idleMs);
  }

  // Clean up idle sessions
  cleanupIdleSessions(idleMs: number = 300000): number {
    const idle = this.getIdleSessions(idleMs);
    for (const session of idle) {
      this.destroy(session.id);
    }
    return idle.length;
  }
}

export const terminalService = new TerminalService();
