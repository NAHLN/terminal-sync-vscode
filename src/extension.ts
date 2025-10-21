// src/extension.ts
// Artifact: terminal-sync-full
// Version: 1.0.2
// Main extension file for Terminal-Synced File Browser
// Uses shell integration to watch normal terminals

import * as vscode from 'vscode';
import * as path from 'path';

let outputChannel: vscode.OutputChannel;
let remoteExplorer: RemoteFileExplorer;
let currentWorkingDirectory: string = '';

export function activate(context: vscode.ExtensionContext) {
    console.log('Terminal-Synced File Browser activated');

    outputChannel = vscode.window.createOutputChannel('Terminal File Sync');
    
    // Create the remote file explorer tree view
    remoteExplorer = new RemoteFileExplorer(outputChannel);
    const treeView = vscode.window.createTreeView('terminalFileExplorer', {
        treeDataProvider: remoteExplorer,
        showCollapseAll: true
    });

    // Watch shell execution events (VS Code 1.72+)
    context.subscriptions.push(
        vscode.window.onDidEndTerminalShellExecution(async (e) => {
            const command = e.execution.commandLine.value.trim();
            outputChannel.appendLine(`🔍 Command executed: ${command}`);

            // Detect cd commands
            if (isCdCommand(command)) {
                const targetDir = extractCdTarget(command);
                if (targetDir) {
                    outputChannel.appendLine(`📁 CD detected: ${targetDir}`);
                    currentWorkingDirectory = targetDir;
                    remoteExplorer.updateCurrentPath(targetDir);
                }
            }
        })
    );

    // Refresh command
    let refreshCommand = vscode.commands.registerCommand('terminal-file-explorer.refresh', () => {
        remoteExplorer.refresh();
    });

    // Set connection command
    let connectCommand = vscode.commands.registerCommand('terminal-file-explorer.connect', async () => {
        const host = await vscode.window.showInputBox({
            prompt: 'SSH connection (user@host)',
            placeHolder: 'username@hostname'
        });

        if (host) {
            const workingDir = await vscode.window.showInputBox({
                prompt: 'Initial working directory',
                placeHolder: '/home/username',
                value: '~'
            });

            remoteExplorer.setConnection(host, workingDir || '~');
            vscode.window.showInformationMessage(`Connected to ${host}`);
            outputChannel.appendLine(`Connected to: ${host}, watching directory: ${workingDir}`);
        }
    });

    // Change directory command
    let cdCommand = vscode.commands.registerCommand('terminal-file-explorer.changeDirectory', async (item: RemoteFileItem) => {
        if (item && item.type === 'directory') {
            const terminal = vscode.window.activeTerminal;
            if (terminal) {
                terminal.sendText(`cd "${item.fullPath}"`);
                outputChannel.appendLine(`Sent cd command: ${item.fullPath}`);
            }
        }
    });

    // Get current directory command
    let getCurrentDir = vscode.commands.registerCommand('terminal-file-explorer.getCurrentDirectory', async () => {
        const terminal = vscode.window.activeTerminal;
        if (terminal) {
            terminal.sendText('pwd');
            vscode.window.showInformationMessage('Check the terminal for current directory');
        }
    });

    context.subscriptions.push(
        outputChannel,
        treeView,
        refreshCommand,
        connectCommand,
        cdCommand,
        getCurrentDir
    );

    // Show helpful message
    outputChannel.appendLine('✅ Terminal File Sync activated');
    outputChannel.appendLine('💡 Tip: This extension watches cd commands in your terminals');
    outputChannel.appendLine('💡 Make sure shell integration is enabled in VS Code settings');
}

function isCdCommand(command: string): boolean {
    const cdPatterns = [
        /^cd\s+/,
        /^pushd\s+/,
        /&&\s*cd\s+/,
        /;\s*cd\s+/
    ];
    return cdPatterns.some(pattern => pattern.test(command));
}

function extractCdTarget(command: string): string | null {
    const cdMatch = command.match(/(?:^|&&|;)\s*(?:cd|pushd)\s+(.+?)(?:\s*&&|\s*;|$)/);
    if (!cdMatch) return null;

    let target = cdMatch[1].trim();
    target = target.replace(/^["']|["']$/g, '');
    
    if (target === '-') return null;
    
    // Expand ~ if needed
    if (target === '~' || target.startsWith('~/')) {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            target = target.replace(/^~/, homeDir);
        }
    }

    // Handle relative paths
    if (!path.isAbsolute(target) && currentWorkingDirectory) {
        target = path.resolve(currentWorkingDirectory, target);
    }

    return target;
}

class RemoteFileExplorer implements vscode.TreeDataProvider<RemoteFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RemoteFileItem | undefined | null | void> = 
        new vscode.EventEmitter<RemoteFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RemoteFileItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private host: string = '';
    private currentPath: string = '';
    private fileCache: Map<string, RemoteFileItem[]> = new Map();

    constructor(private outputChannel: vscode.OutputChannel) {}

    setConnection(host: string, initialPath: string) {
        this.host = host;
        this.currentPath = initialPath;
        this.fileCache.clear();
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateCurrentPath(newPath: string) {
        this.currentPath = newPath;
        this.outputChannel.appendLine(`Updated current path: ${newPath}`);
        this.refresh();
    }

    getTreeItem(element: RemoteFileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RemoteFileItem): Promise<RemoteFileItem[]> {
        if (!this.host) {
            return [new RemoteFileItem(
                '⚠️ Not Connected',
                'Use "Connect to SSH Host" or "Create Watched Terminal"',
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        const targetPath = element ? element.fullPath : this.currentPath;

        // Check cache first
        if (this.fileCache.has(targetPath)) {
            return this.fileCache.get(targetPath) || [];
        }

        // In a real implementation, you would:
        // 1. Use SSH/SFTP to list directory contents
        // 2. Parse the output
        // 3. Return file items

        // For now, return a placeholder
        const items = await this.fetchDirectoryContents(targetPath);
        this.fileCache.set(targetPath, items);
        return items;
    }

    private async fetchDirectoryContents(dirPath: string): Promise<RemoteFileItem[]> {
        // TODO: Implement actual SFTP directory listing
        // This is where you'd use ssh2-sftp-client or similar
        
        this.outputChannel.appendLine(`Would fetch contents of: ${dirPath}`);
        
        // Placeholder implementation
        return [
            new RemoteFileItem(
                `📍 Current: ${dirPath}`,
                dirPath,
                'info',
                vscode.TreeItemCollapsibleState.None
            ),
            new RemoteFileItem(
                '💡 SFTP integration needed',
                'Install ssh2-sftp-client to browse files',
                'info',
                vscode.TreeItemCollapsibleState.None
            )
        ];
    }
}

class RemoteFileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        public readonly type: 'file' | 'directory' | 'info',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);

        this.tooltip = fullPath;
        this.contextValue = type;

        // Set icons based on type
        if (type === 'directory') {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.command = {
                command: 'terminal-file-explorer.changeDirectory',
                title: 'Change Directory',
                arguments: [this]
            };
        } else if (type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

export function deactivate() {
    outputChannel?.dispose();
}