// src/extension.ts
// Artifact: terminal-sync-full
// Version: 1.0.1
// Main extension file for Terminal-Synced File Browser

import * as vscode from 'vscode';
import * as path from 'path';
import { TerminalOutputParser, TerminalPtyWrapper } from './terminalParser';

let outputChannel: vscode.OutputChannel;
let remoteExplorer: RemoteFileExplorer;
let terminalWrapper: TerminalPtyWrapper;

export function activate(context: vscode.ExtensionContext) {
    console.log('Terminal-Synced File Browser activated');

    outputChannel = vscode.window.createOutputChannel('Terminal File Sync');
    
    // Create the remote file explorer tree view
    remoteExplorer = new RemoteFileExplorer(outputChannel);
    const treeView = vscode.window.createTreeView('terminalFileExplorer', {
        treeDataProvider: remoteExplorer,
        showCollapseAll: true
    });

    // Create terminal wrapper with parser
    terminalWrapper = new TerminalPtyWrapper(
        outputChannel,
        (newDir: string) => {
            // Callback when directory changes
            remoteExplorer.updateCurrentPath(newDir);
        }
    );

    // Create watched terminal command
    let createWatchedTerminal = vscode.commands.registerCommand(
        'terminal-file-explorer.createWatchedTerminal', 
        () => {
            const terminal = terminalWrapper.createWrappedTerminal('Watched Terminal');
            terminal.show();
            outputChannel.appendLine('✨ Created watched terminal');
            vscode.window.showInformationMessage('Watched terminal created - directory changes will be tracked');
        }
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

    context.subscriptions.push(
        outputChannel,
        treeView,
        createWatchedTerminal,
        refreshCommand,
        connectCommand,
        cdCommand
    );
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