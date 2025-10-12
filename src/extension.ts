// src/extension.ts
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as os from 'os';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    console.log('Terminal Observer extension is now active');

    outputChannel = vscode.window.createOutputChannel('Terminal Observer');
    
    // Command to toggle observation view
    let toggleCommand = vscode.commands.registerCommand('terminal-observer.toggle', () => {
        vscode.window.showInformationMessage('Terminal Observer is watching your terminals!');
        outputChannel.show();
    });

    // Command to create an observed terminal
    let createObservedTerminal = vscode.commands.registerCommand('terminal-observer.createTerminal', () => {
        const terminal = vscode.window.createTerminal({
            name: 'Observed Terminal',
            pty: createObservablePty()
        });
        terminal.show();
        logToOutput('✨ Created new observed terminal');
    });

    // Listen for terminal lifecycle events
    context.subscriptions.push(
        vscode.window.onDidOpenTerminal((terminal) => {
            logToOutput(`📍 Terminal opened: ${terminal.name}`);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            logToOutput(`❌ Terminal closed: ${terminal.name}`);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            if (terminal) {
                logToOutput(`🔄 Active terminal: ${terminal.name}`);
            }
        })
    );

    context.subscriptions.push(toggleCommand, createObservedTerminal, outputChannel);
}

function createObservablePty(): vscode.Pseudoterminal {
    const writeEmitter = new vscode.EventEmitter<string>();
    let shellProcess: child_process.ChildProcess | undefined;
    
    const pty: vscode.Pseudoterminal = {
        onDidWrite: writeEmitter.event,
        
        open: () => {
            logToOutput('🚀 Observed terminal opened');
            
            // Determine shell based on OS
            const shell = os.platform() === 'win32' 
                ? process.env.COMSPEC || 'cmd.exe'
                : process.env.SHELL || '/bin/bash';
            
            // Spawn shell process
            shellProcess = child_process.spawn(shell, [], {
                env: process.env,
                cwd: process.cwd()
            });

            // Capture stdout
            shellProcess.stdout?.on('data', (data: Buffer) => {
                const output = data.toString();
                logToOutput(`📤 Output: ${output.trim()}`);
                writeEmitter.fire(output);
            });

            // Capture stderr
            shellProcess.stderr?.on('data', (data: Buffer) => {
                const output = data.toString();
                logToOutput(`⚠️  Error: ${output.trim()}`);
                writeEmitter.fire(output);
            });

            shellProcess.on('exit', (code) => {
                logToOutput(`💀 Shell process exited with code: ${code}`);
                writeEmitter.fire(`\r\nProcess exited with code ${code}\r\n`);
            });

            writeEmitter.fire('🔍 Terminal Observer Active - All I/O is being logged\r\n\r\n');
        },
        
        close: () => {
            logToOutput('🛑 Observed terminal closed');
            shellProcess?.kill();
        },
        
        handleInput: (data: string) => {
            // Log input (mask sensitive data like passwords)
            const displayData = data.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
            logToOutput(`⌨️  Input: ${displayData}`);
            
            // Forward input to shell
            shellProcess?.stdin?.write(data);
        },

        setDimensions: (dimensions: vscode.TerminalDimensions) => {
            // Handle terminal resize if needed
            logToOutput(`📐 Terminal resized: ${dimensions.columns}x${dimensions.rows}`);
        }
    };

    return pty;
}

function logToOutput(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    outputChannel.appendLine(`[${timestamp}] ${message}`);
}

export function deactivate() {
    outputChannel?.dispose();
}