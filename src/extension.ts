// src/extension.ts
// Artifact: terminal-sync-full
// Version: 1.0.3
// Main extension file for Terminal-Synced File Browser
// Enhanced for teaching: highlights and syncs current working directory

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel;
let remoteExplorer: RemoteFileExplorer;
let currentWorkingDirectory: string = '';
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Terminal-Synced File Browser activated');

    outputChannel = vscode.window.createOutputChannel('Terminal File Sync');
    
    // Create status bar item to show current directory
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'terminal-file-explorer.revealCurrentDirectory';
    statusBarItem.text = '$(folder) ~';
    statusBarItem.tooltip = 'Current working directory (click to reveal)';
    statusBarItem.show();
    
    // Create the remote file explorer tree view
    remoteExplorer = new RemoteFileExplorer(outputChannel);
    const treeView = vscode.window.createTreeView('terminalFileExplorer', {
        treeDataProvider: remoteExplorer,
        showCollapseAll: true
    });

    // Initialize with workspace folder or home directory
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const initialDir = workspaceFolder || process.env.HOME || process.cwd();
    currentWorkingDirectory = initialDir;
    remoteExplorer.updateCurrentPath(initialDir);
    updateStatusBar(initialDir);

    // Watch shell execution events (VS Code 1.72+)
    context.subscriptions.push(
        vscode.window.onDidEndTerminalShellExecution(async (e) => {
            const command = e.execution.commandLine.value.trim();
            const exitCode = e.exitCode;
            
            outputChannel.appendLine(`🔍 Command: ${command} (exit: ${exitCode})`);

            // Detect cd commands
            if (isCdCommand(command)) {
                if (exitCode === 0) {
                    // CD succeeded - try to get actual directory
                    const targetDir = extractCdTarget(command);
                    
                    // Check if we could parse it and it exists
                    if (targetDir && fs.existsSync(targetDir)) {
                        outputChannel.appendLine(`✅ CD to: ${targetDir}`);
                        currentWorkingDirectory = targetDir;
                        remoteExplorer.updateCurrentPath(targetDir);
                        updateStatusBar(targetDir);
                        vscode.window.setStatusBarMessage(`📂 ${path.basename(targetDir)}`, 2000);
                    } else {
                        // Couldn't parse or doesn't exist - use terminal's cwd if available
                        outputChannel.appendLine(`⚠️  Using terminal cwd for sync`);
                        syncFromTerminal(e.terminal);
                    }
                } else {
                    outputChannel.appendLine(`❌ CD failed - no change`);
                    vscode.window.setStatusBarMessage(`❌ Directory not found`, 2000);
                }
            }
            
            // Detect pwd command to re-sync
            if (isPwdCommand(command)) {
                outputChannel.appendLine(`📍 PWD - syncing from terminal`);
                syncFromTerminal(e.terminal);
            }
        })
    );

    // Refresh command
    let refreshCommand = vscode.commands.registerCommand('terminal-file-explorer.refresh', () => {
        remoteExplorer.refresh();
        vscode.window.showInformationMessage('File browser refreshed');
    });

    // Reveal current directory in tree
    let revealCommand = vscode.commands.registerCommand('terminal-file-explorer.revealCurrentDirectory', () => {
        if (currentWorkingDirectory) {
            remoteExplorer.revealDirectory(currentWorkingDirectory);
            treeView.reveal(new RemoteFileItem(
                path.basename(currentWorkingDirectory),
                currentWorkingDirectory,
                'directory',
                vscode.TreeItemCollapsibleState.Expanded
            ), { select: true, focus: true });
        }
    });

    // Change directory command (when clicking in tree)
    let cdCommand = vscode.commands.registerCommand('terminal-file-explorer.changeDirectory', async (item: RemoteFileItem) => {
        if (item && item.type === 'directory') {
            const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
            terminal.show();
            terminal.sendText(`cd "${item.fullPath}"`);
            outputChannel.appendLine(`Sent cd command: ${item.fullPath}`);
        }
    });

    // Get current directory command
    let getCurrentDir = vscode.commands.registerCommand('terminal-file-explorer.getCurrentDirectory', async () => {
        const terminal = vscode.window.activeTerminal;
        if (terminal) {
            terminal.sendText('pwd');
        } else {
            vscode.window.showInformationMessage(`Current directory: ${currentWorkingDirectory}`);
        }
    });

    context.subscriptions.push(
        outputChannel,
        treeView,
        statusBarItem,
        refreshCommand,
        revealCommand,
        cdCommand,
        getCurrentDir
    );

    // Show helpful message
    outputChannel.appendLine('✅ Terminal File Sync activated');
    outputChannel.appendLine('💡 Current directory will be highlighted as you navigate');
    outputChannel.show();
}

function updateStatusBar(directory: string) {
    const dirName = path.basename(directory);
    statusBarItem.text = `$(folder) ${dirName}`;
    statusBarItem.tooltip = `Current: ${directory}\nClick to reveal in tree`;
}

function syncFromTerminal(terminal: vscode.Terminal) {
    // Try to get the terminal's current working directory
    // This uses the shell integration's cwd tracking
    const shellIntegration = (terminal as any).shellIntegration;
    
    if (shellIntegration?.cwd) {
        const cwd = shellIntegration.cwd.fsPath || shellIntegration.cwd;
        outputChannel.appendLine(`🔄 Synced from terminal cwd: ${cwd}`);
        currentWorkingDirectory = cwd;
        remoteExplorer.updateCurrentPath(cwd);
        updateStatusBar(cwd);
    } else {
        outputChannel.appendLine(`⚠️  Shell integration cwd not available`);
        // Fallback: just refresh current view
        remoteExplorer.refresh();
    }
}

function triggerPwdSync() {
    // Automatically send pwd command to get current directory
    const terminal = vscode.window.activeTerminal;
    if (terminal) {
        // Send pwd silently to resync
        outputChannel.appendLine('🔄 Auto-syncing with pwd...');
        terminal.sendText('pwd');
    }
}

function isPwdCommand(command: string): boolean {
    return /^\s*pwd\s*$/.test(command);
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

    private currentPath: string = '';
    private fileCache: Map<string, RemoteFileItem[]> = new Map();

    constructor(private outputChannel: vscode.OutputChannel) {}

    refresh(): void {
        this.fileCache.clear();
        this._onDidChangeTreeData.fire();
    }

    updateCurrentPath(newPath: string) {
        this.currentPath = newPath;
        this.outputChannel.appendLine(`📍 Updated current path: ${newPath}`);
        this.refresh();
    }

    revealDirectory(dirPath: string) {
        this.currentPath = dirPath;
        this.refresh();
    }

    getTreeItem(element: RemoteFileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RemoteFileItem): Promise<RemoteFileItem[]> {
        const targetPath = element ? element.fullPath : this.currentPath;

        if (!targetPath) {
            return [new RemoteFileItem(
                '📂 No directory selected',
                'Open a terminal and navigate with cd',
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        // Check cache first
        if (this.fileCache.has(targetPath)) {
            return this.fileCache.get(targetPath) || [];
        }

        // Read actual directory contents
        const items = await this.fetchDirectoryContents(targetPath);
        this.fileCache.set(targetPath, items);
        return items;
    }

    private async fetchDirectoryContents(dirPath: string): Promise<RemoteFileItem[]> {
        try {
            // Check if directory exists
            if (!fs.existsSync(dirPath)) {
                this.outputChannel.appendLine(`⚠️  Directory doesn't exist: ${dirPath}`);
                return [new RemoteFileItem(
                    '⚠️ Directory not found',
                    dirPath,
                    'info',
                    vscode.TreeItemCollapsibleState.None
                )];
            }

            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            // Sort: directories first, then files, both alphabetically
            const sorted = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            const items = sorted.map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                const isDir = entry.isDirectory();
                const isCurrent = fullPath === this.currentPath;
                
                return new RemoteFileItem(
                    entry.name,
                    fullPath,
                    isDir ? 'directory' : 'file',
                    isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    isCurrent
                );
            });

            // If this is the current directory, add a header
            if (dirPath === this.currentPath) {
                items.unshift(new RemoteFileItem(
                    `📍 ${path.basename(dirPath) || path.sep}`,
                    dirPath,
                    'current-dir-header',
                    vscode.TreeItemCollapsibleState.None,
                    true
                ));
            }

            return items;

        } catch (error) {
            this.outputChannel.appendLine(`❌ Error reading directory ${dirPath}: ${error}`);
            return [new RemoteFileItem(
                `❌ Error: ${error}`,
                dirPath,
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }
    }
}

class RemoteFileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        public readonly type: 'file' | 'directory' | 'info' | 'current-dir-header',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isCurrent: boolean = false
    ) {
        super(label, collapsibleState);

        this.tooltip = fullPath;
        this.contextValue = type;

        // Set icons and styling based on type
        if (type === 'current-dir-header') {
            // Special styling for the current directory header
            this.iconPath = new vscode.ThemeIcon(
                'location',
                new vscode.ThemeColor('terminal.ansiGreen')
            );
            // Removed "You are here" - just show the directory name
        } else if (type === 'directory') {
            this.iconPath = new vscode.ThemeIcon(
                isCurrent ? 'folder-opened' : 'folder',
                isCurrent ? new vscode.ThemeColor('terminal.ansiGreen') : undefined
            );
            this.command = {
                command: 'terminal-file-explorer.changeDirectory',
                title: 'Change Directory',
                arguments: [this]
            };
            
            // Highlight current directory
            if (isCurrent) {
                this.description = '← Current';
            }
        } else if (type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

export function deactivate() {
    outputChannel?.dispose();
    statusBarItem?.dispose();
}