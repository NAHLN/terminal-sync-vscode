// src/terminalParser.ts
// Artifact: terminal-parser
// Version: 1.0.0
// Terminal output parser for detecting cd commands and tracking current directory

import * as vscode from 'vscode';

export interface ParsedCommand {
    type: 'cd' | 'pwd' | 'ls' | 'unknown';
    command: string;
    args?: string[];
    target?: string;
    timestamp: Date;
}

export class TerminalOutputParser {
    private buffer: string = '';
    private commandHistory: ParsedCommand[] = [];
    private currentDirectory: string = '';
    
    // ANSI escape code regex for cleaning output
    private ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

    /**
     * Parse incoming terminal data
     */
    parseData(data: string): ParsedCommand[] {
        this.buffer += data;
        const commands: ParsedCommand[] = [];

        // Clean ANSI escape codes
        const cleanData = this.stripAnsi(this.buffer);

        // Try to parse different command patterns
        const cdCommand = this.parseCdCommand(cleanData);
        if (cdCommand) {
            commands.push(cdCommand);
            this.commandHistory.push(cdCommand);
        }

        const pwdOutput = this.parsePwdOutput(cleanData);
        if (pwdOutput) {
            commands.push(pwdOutput);
            this.currentDirectory = pwdOutput.target || '';
            this.commandHistory.push(pwdOutput);
        }

        // Clear buffer after processing (keep last 1000 chars for context)
        if (this.buffer.length > 1000) {
            this.buffer = this.buffer.slice(-1000);
        }

        return commands;
    }

    /**
     * Parse cd commands from terminal output
     * Handles: cd, cd dir, cd /path, cd .., cd ~, cd -, pushd, popd
     */
    private parseCdCommand(data: string): ParsedCommand | null {
        // Match various cd command patterns
        const patterns = [
            // Standard cd commands
            /(?:^|\n|\$ )\s*cd\s+([^\s;&|]+)/,
            // cd with quotes
            /(?:^|\n|\$ )\s*cd\s+["']([^"']+)["']/,
            // pushd
            /(?:^|\n|\$ )\s*pushd\s+([^\s;&|]+)/,
            // Commands chained with &&
            /&&\s*cd\s+([^\s;&|]+)/,
            // Commands chained with ;
            /;\s*cd\s+([^\s;&|]+)/,
        ];

        for (const pattern of patterns) {
            const match = data.match(pattern);
            if (match) {
                const target = match[1].trim();
                
                // Skip if it's just echoing help or similar
                if (target === '--help' || target === '-h') {
                    continue;
                }

                return {
                    type: 'cd',
                    command: 'cd',
                    args: [target],
                    target: this.resolveTarget(target),
                    timestamp: new Date()
                };
            }
        }

        // Check for popd
        if (/(?:^|\n|\$ )\s*popd\b/.test(data)) {
            return {
                type: 'cd',
                command: 'popd',
                target: undefined, // Would need directory stack to resolve
                timestamp: new Date()
            };
        }

        return null;
    }

    /**
     * Parse pwd output
     * Looks for absolute paths that appear to be pwd output
     */
    private parsePwdOutput(data: string): ParsedCommand | null {
        // Match pwd command followed by output
        const pwdPattern = /(?:^|\n|\$ )\s*pwd\s*\n(\/[^\n]+)/;
        const match = data.match(pwdPattern);
        
        if (match) {
            const directory = match[1].trim();
            return {
                type: 'pwd',
                command: 'pwd',
                target: directory,
                timestamp: new Date()
            };
        }

        // Also try to detect directory from shell prompt (e.g., user@host:/path$)
        const promptPattern = /(?:^|\n)[^@\n]+@[^:]+:(\/[^\$\n]+)[\$#]/;
        const promptMatch = data.match(promptPattern);
        
        if (promptMatch) {
            const directory = promptMatch[1].trim();
            // Only update if it's different from current
            if (directory !== this.currentDirectory) {
                return {
                    type: 'pwd',
                    command: 'prompt',
                    target: directory,
                    timestamp: new Date()
                };
            }
        }

        return null;
    }

    /**
     * Resolve relative paths to absolute (best effort)
     */
    private resolveTarget(target: string): string {
        // Handle special cases
        if (target === '~' || target.startsWith('~/')) {
            // Would need to know user's home directory
            return target;
        }
        
        if (target === '-') {
            // Previous directory - would need to track history
            return target;
        }

        if (target === '..') {
            // Parent directory
            if (this.currentDirectory) {
                const parts = this.currentDirectory.split('/').filter(p => p);
                parts.pop();
                return '/' + parts.join('/');
            }
            return target;
        }

        if (target.startsWith('../')) {
            // Relative parent path
            if (this.currentDirectory) {
                const upLevels = (target.match(/\.\.\//g) || []).length;
                const parts = this.currentDirectory.split('/').filter(p => p);
                for (let i = 0; i < upLevels; i++) {
                    parts.pop();
                }
                const remaining = target.replace(/\.\.\//g, '');
                if (remaining) {
                    parts.push(remaining);
                }
                return '/' + parts.join('/');
            }
            return target;
        }

        if (target.startsWith('./')) {
            // Current directory relative
            if (this.currentDirectory) {
                return this.currentDirectory + '/' + target.slice(2);
            }
            return target;
        }

        if (target.startsWith('/')) {
            // Absolute path
            return target;
        }

        // Relative path from current directory
        if (this.currentDirectory) {
            return this.currentDirectory + '/' + target;
        }

        return target;
    }

    /**
     * Strip ANSI escape codes from terminal output
     */
    private stripAnsi(text: string): string {
        return text.replace(this.ansiRegex, '');
    }

    /**
     * Get current directory (best guess)
     */
    getCurrentDirectory(): string {
        return this.currentDirectory;
    }

    /**
     * Set current directory manually
     */
    setCurrentDirectory(dir: string): void {
        this.currentDirectory = dir;
    }

    /**
     * Get command history
     */
    getHistory(): ParsedCommand[] {
        return [...this.commandHistory];
    }

    /**
     * Clear parser state
     */
    clear(): void {
        this.buffer = '';
        this.commandHistory = [];
        this.currentDirectory = '';
    }
}

/**
 * Parser specifically for capturing terminal output using PTY
 */
export class TerminalPtyWrapper {
    private parser: TerminalOutputParser;
    private onDirectoryChangeCallback?: (newDir: string) => void;

    constructor(
        private outputChannel: vscode.OutputChannel,
        onDirectoryChange?: (newDir: string) => void
    ) {
        this.parser = new TerminalOutputParser();
        this.onDirectoryChangeCallback = onDirectoryChange;
    }

    /**
     * Create a wrapped terminal with output interception
     */
    createWrappedTerminal(name: string = 'Watched Terminal'): vscode.Terminal {
        const writeEmitter = new vscode.EventEmitter<string>();
        let shellProcess: any = null;

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            
            open: () => {
                // Import child_process and spawn shell
                const child_process = require('child_process');
                const os = require('os');
                
                const shell = os.platform() === 'win32'
                    ? process.env.COMSPEC || 'cmd.exe'
                    : process.env.SHELL || '/bin/bash';
                
                const args = os.platform() === 'win32' ? [] : ['-i'];
                
                shellProcess = child_process.spawn(shell, args, {
                    env: { ...process.env, TERM: 'xterm-256color' },
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                // Capture and parse stdout
                shellProcess.stdout?.on('data', (data: Buffer) => {
                    const output = data.toString();
                    
                    // Parse the output
                    const commands = this.parser.parseData(output);
                    commands.forEach(cmd => {
                        if (cmd.type === 'cd' && cmd.target) {
                            this.outputChannel.appendLine(`📁 Directory changed: ${cmd.target}`);
                            this.onDirectoryChangeCallback?.(cmd.target);
                        } else if (cmd.type === 'pwd' && cmd.target) {
                            this.outputChannel.appendLine(`📍 Current directory: ${cmd.target}`);
                            this.onDirectoryChangeCallback?.(cmd.target);
                        }
                    });
                    
                    // Forward to terminal display
                    writeEmitter.fire(output);
                });

                shellProcess.stderr?.on('data', (data: Buffer) => {
                    writeEmitter.fire(data.toString());
                });

                shellProcess.on('exit', (code: number) => {
                    writeEmitter.fire(`\r\n[Process exited with code ${code}]\r\n`);
                });
            },
            
            close: () => {
                shellProcess?.kill();
            },
            
            handleInput: (data: string) => {
                shellProcess?.stdin?.write(data);
            }
        };

        return vscode.window.createTerminal({ name, pty });
    }

    /**
     * Get the parser instance
     */
    getParser(): TerminalOutputParser {
        return this.parser;
    }
}