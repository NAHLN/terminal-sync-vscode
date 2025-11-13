// src/extension.ts
// Artifact: terminal-sync-full
// Version: 1.1.0
// Main extension file for Terminal-Synced File Browser
// Enhanced to show files only after 'ls' command with GNU ls option support

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel;
let remoteExplorer: RemoteFileExplorer;
let lsTableViewProvider: LsTableViewProvider;
let currentWorkingDirectory: string = '';
let statusBarItem: vscode.StatusBarItem;
let shouldShowFiles: boolean = false;  // Only show files after ls command
let lsOptions: LsOptions = {
    showHidden: false,
    longFormat: false,
    sortBy: 'name',
    reverseSort: false,
    humanReadable: false,
    classify: false
};

interface LsOptions {
    showHidden: boolean;      // -a or -A
    longFormat: boolean;      // -l
    sortBy: 'name' | 'time' | 'size' | 'none';  // -t, -S, -U
    reverseSort: boolean;     // -r
    humanReadable: boolean;   // -h
    classify: boolean;        // -F (append indicator to entries)
}

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

    // Create the ls table webview provider
    lsTableViewProvider = new LsTableViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('terminalLsTable', lsTableViewProvider)
    );

    // Initialize with workspace folder or home directory
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const initialDir = workspaceFolder || process.env.HOME || process.cwd();
    currentWorkingDirectory = initialDir;
    remoteExplorer.updateCurrentPath(initialDir, false, lsOptions);  // Don't show files until ls
    updateStatusBar(initialDir);

    // Watch shell execution events (VS Code 1.72+)
    context.subscriptions.push(
        vscode.window.onDidEndTerminalShellExecution(async (e) => {
            const command = e.execution.commandLine.value.trim();
            const exitCode = e.exitCode;
            
            outputChannel.appendLine(`Command: ${command} (exit: ${exitCode})`);

            // Detect cd commands
            if (isCdCommand(command)) {
                if (exitCode === 0) {
                    // CD succeeded - try to get actual directory
                    const targetDir = extractCdTarget(command);
                    
                    // Check if we could parse it and it exists
                    if (targetDir && fs.existsSync(targetDir)) {
                        outputChannel.appendLine(`CD to: ${targetDir}`);
                        currentWorkingDirectory = targetDir;
                        // Don't show files yet - wait for ls
                        shouldShowFiles = false;
                        remoteExplorer.updateCurrentPath(targetDir, false, lsOptions);
                        updateStatusBar(targetDir);
                        
                        // Clear the webview table
                        if (lsTableViewProvider) {
                            lsTableViewProvider.clearTable(targetDir);
                        }
                        
                        vscode.window.setStatusBarMessage(`Dir: ${path.basename(targetDir)}`, 2000);
                    } else {
                        // Couldn't parse or doesn't exist - use terminal's cwd if available
                        outputChannel.appendLine(`Using terminal cwd for sync`);
                        syncFromTerminal(e.terminal, false);
                    }
                } else {
                    outputChannel.appendLine(`CD failed - no change`);
                    vscode.window.setStatusBarMessage(`Directory not found`, 2000);
                }
            }
            
            // Detect ls command
            if (isLsCommand(command)) {
                if (exitCode === 0) {
                    outputChannel.appendLine(`LS command detected`);
                    // Parse ls options
                    const parsedOptions = parseLsOptions(command);
                    lsOptions = parsedOptions;
                    shouldShowFiles = true;
                    outputChannel.appendLine(`LS options: ${JSON.stringify(parsedOptions)}`);
                    remoteExplorer.updateCurrentPath(currentWorkingDirectory, true, parsedOptions);
                    
                    // Update webview table
                    await updateLsTableView();
                    
                    vscode.window.setStatusBarMessage(`Listed files`, 2000);
                } else {
                    outputChannel.appendLine(`LS failed`);
                }
            }
            
            // Detect pwd command to re-sync
            if (isPwdCommand(command)) {
                outputChannel.appendLine(`PWD - syncing from terminal`);
                syncFromTerminal(e.terminal, shouldShowFiles);
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
    outputChannel.appendLine('Terminal File Sync activated');
    outputChannel.appendLine('Use cd to navigate, then ls to view files');
    outputChannel.show();
}

function updateStatusBar(directory: string) {
    const dirName = path.basename(directory);
    statusBarItem.text = `$(folder) ${dirName}`;
    statusBarItem.tooltip = `Current: ${directory}\nClick to reveal in tree`;
}

function syncFromTerminal(terminal: vscode.Terminal, showFiles: boolean) {
    // Try to get the terminal's current working directory
    // This uses the shell integration's cwd tracking
    const shellIntegration = (terminal as any).shellIntegration;
    
    if (shellIntegration?.cwd) {
        const cwd = shellIntegration.cwd.fsPath || shellIntegration.cwd;
        outputChannel.appendLine(`Synced from terminal cwd: ${cwd}`);
        currentWorkingDirectory = cwd;
        shouldShowFiles = showFiles;
        remoteExplorer.updateCurrentPath(cwd, showFiles, lsOptions);
        updateStatusBar(cwd);
    } else {
        outputChannel.appendLine(`Shell integration cwd not available`);
        // Fallback: just refresh current view
        remoteExplorer.refresh();
    }
}

function isPwdCommand(command: string): boolean {
    return /^\s*pwd\s*$/.test(command);
}

function isCdCommand(command: string): boolean {
    const cdPatterns = [
        /^cd(\s|$)/,        // cd with optional space/argument or end of line
        /^pushd\s+/,
        /&&\s*cd(\s|$)/,    // cd in command chain
        /;\s*cd(\s|$)/      // cd after semicolon
    ];
    return cdPatterns.some(pattern => pattern.test(command));
}

function isLsCommand(command: string): boolean {
    // Match ls command, potentially with options and arguments
    // Handles: ls, ls -la, ls /path, ls -l /path, etc.
    return /^\s*ls(\s|$)/.test(command);
}

function parseLsOptions(command: string): LsOptions {
    const options: LsOptions = {
        showHidden: false,
        longFormat: false,
        sortBy: 'name',
        reverseSort: false,
        humanReadable: false,
        classify: false
    };

    // Extract options part (everything after 'ls' but before paths)
    const parts = command.trim().split(/\s+/);
    
    for (const part of parts) {
        if (!part.startsWith('-')) continue;
        
        // Handle both -a and --all style options
        if (part === '--all' || part.includes('a')) {
            options.showHidden = true;
        }
        if (part === '--almost-all' || part.includes('A')) {
            options.showHidden = true;  // -A is similar to -a
        }
        if (part === '-l' || part.includes('l')) {
            options.longFormat = true;
        }
        if (part === '--reverse' || part.includes('r')) {
            options.reverseSort = true;
        }
        if (part === '-t' || part.includes('t')) {
            options.sortBy = 'time';
        }
        if (part === '-S' || part.includes('S')) {
            options.sortBy = 'size';
        }
        if (part === '-U' || part.includes('U')) {
            options.sortBy = 'none';  // Unsorted (directory order)
        }
        if (part === '--human-readable' || part.includes('h')) {
            options.humanReadable = true;
        }
        if (part === '--classify' || part === '-F' || part.includes('F')) {
            options.classify = true;
        }
    }

    return options;
}

function extractCdTarget(command: string): string | null {
    // Check if it's just "cd" without arguments - should go to HOME
    const justCd = command.match(/(?:^|&&|;)\s*cd\s*(?:&&|;|$)/);
    if (justCd) {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        return homeDir || null;
    }

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
    private showFiles: boolean = false;
    private lsOptions: LsOptions;
    private fileCache: Map<string, RemoteFileItem[]> = new Map();

    constructor(private outputChannel: vscode.OutputChannel) {
        this.lsOptions = {
            showHidden: false,
            longFormat: false,
            sortBy: 'name',
            reverseSort: false,
            humanReadable: false,
            classify: false
        };
    }

    refresh(): void {
        this.fileCache.clear();
        this._onDidChangeTreeData.fire();
    }

    updateCurrentPath(newPath: string, showFiles: boolean, options: LsOptions) {
        this.currentPath = newPath;
        this.showFiles = showFiles;
        this.lsOptions = options;
        this.outputChannel.appendLine(`Updated current path: ${newPath}, showFiles: ${showFiles}`);
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
                'No directory selected',
                'Open a terminal and navigate with cd',
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        // If we're at the root and files shouldn't be shown yet
        if (!element && !this.showFiles) {
            return [new RemoteFileItem(
                `Current: ${path.basename(targetPath)}`,
                targetPath,
                'current-dir-header',
                vscode.TreeItemCollapsibleState.None,
                true
            ), new RemoteFileItem(
                'Run "ls" to view files',
                'Waiting for ls command',
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        // Check cache first
        const cacheKey = `${targetPath}-${this.showFiles}-${JSON.stringify(this.lsOptions)}`;
        if (this.fileCache.has(cacheKey)) {
            return this.fileCache.get(cacheKey) || [];
        }

        // Read actual directory contents
        const items = await this.fetchDirectoryContents(targetPath);
        this.fileCache.set(cacheKey, items);
        return items;
    }

    private async fetchDirectoryContents(dirPath: string): Promise<RemoteFileItem[]> {
        try {
            // Check if directory exists
            if (!fs.existsSync(dirPath)) {
                this.outputChannel.appendLine(`Directory doesn't exist: ${dirPath}`);
                return [new RemoteFileItem(
                    'Directory not found',
                    dirPath,
                    'info',
                    vscode.TreeItemCollapsibleState.None
                )];
            }

            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            // Filter hidden files based on options
            let filtered = entries;
            if (!this.lsOptions.showHidden) {
                filtered = entries.filter(entry => !entry.name.startsWith('.'));
            }

            // Sort based on options
            let sorted = await this.sortEntries(filtered, dirPath);

            // Calculate max name lengths for alignment (separate for files and dirs)
            let maxDirNameLength = 0;
            let maxFileNameLength = 0;
            if (this.lsOptions.longFormat) {
                for (const entry of sorted) {
                    if (entry.isDirectory()) {
                        maxDirNameLength = Math.max(maxDirNameLength, entry.name.length);
                    } else {
                        maxFileNameLength = Math.max(maxFileNameLength, entry.name.length);
                    }
                }
            }

            // Map to RemoteFileItems with stat info for long format
            const items: RemoteFileItem[] = [];
            for (const entry of sorted) {
                const fullPath = path.join(dirPath, entry.name);
                const isDir = entry.isDirectory();
                const isCurrent = fullPath === this.currentPath;
                
                let stat: fs.Stats | undefined;
                if (this.lsOptions.longFormat) {
                    try {
                        stat = await fs.promises.stat(fullPath);
                    } catch (err) {
                        // Ignore stat errors
                    }
                }
                
                items.push(new RemoteFileItem(
                    entry.name,
                    fullPath,
                    isDir ? 'directory' : 'file',
                    isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    isCurrent,
                    stat,
                    this.lsOptions,
                    isDir ? maxDirNameLength : maxFileNameLength
                ));
            }

            // If this is the current directory, add a header
            if (dirPath === this.currentPath) {
                items.unshift(new RemoteFileItem(
                    `Current: ${path.basename(dirPath) || path.sep}`,
                    dirPath,
                    'current-dir-header',
                    vscode.TreeItemCollapsibleState.None,
                    true
                ));
            }

            return items;

        } catch (error) {
            this.outputChannel.appendLine(`Error reading directory ${dirPath}: ${error}`);
            return [new RemoteFileItem(
                `Error: ${error}`,
                dirPath,
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }
    }

    private async sortEntries(entries: fs.Dirent[], dirPath: string): Promise<fs.Dirent[]> {
        if (this.lsOptions.sortBy === 'none') {
            // No sorting - return as is
            return entries;
        }

        let sorted: fs.Dirent[];

        if (this.lsOptions.sortBy === 'name') {
            // Sort by name, directories first
            sorted = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });
        } else if (this.lsOptions.sortBy === 'time') {
            // Sort by modification time
            const entriesWithTime: Array<{entry: fs.Dirent, mtime: number}> = [];
            for (const entry of entries) {
                try {
                    const stat = await fs.promises.stat(path.join(dirPath, entry.name));
                    entriesWithTime.push({ entry, mtime: stat.mtimeMs });
                } catch {
                    entriesWithTime.push({ entry, mtime: 0 });
                }
            }
            entriesWithTime.sort((a, b) => b.mtime - a.mtime);
            sorted = entriesWithTime.map(e => e.entry);
        } else if (this.lsOptions.sortBy === 'size') {
            // Sort by size
            const entriesWithSize: Array<{entry: fs.Dirent, size: number}> = [];
            for (const entry of entries) {
                try {
                    const stat = await fs.promises.stat(path.join(dirPath, entry.name));
                    entriesWithSize.push({ entry, size: stat.size });
                } catch {
                    entriesWithSize.push({ entry, size: 0 });
                }
            }
            entriesWithSize.sort((a, b) => b.size - a.size);
            sorted = entriesWithSize.map(e => e.entry);
        } else {
            sorted = entries;
        }

        // Apply reverse if requested
        if (this.lsOptions.reverseSort) {
            sorted.reverse();
        }

        return sorted;
    }
}

class RemoteFileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        public readonly type: 'file' | 'directory' | 'info' | 'current-dir-header',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isCurrent: boolean = false,
        public readonly stat?: fs.Stats,
        public readonly lsOptions?: LsOptions,
        public readonly maxNameLength?: number
    ) {
        // Call super first with just the label - we'll modify this.label later if needed
        super(label, collapsibleState);

        // Pad the label if we're in long format and have maxNameLength
        if (lsOptions?.longFormat && maxNameLength) {
            const padding = '\u00A0'.repeat(Math.max(0, maxNameLength - label.length));
            this.label = label + padding;
        }

        this.tooltip = fullPath;
        this.contextValue = type;

        // Set icons and styling based on type
        if (type === 'current-dir-header') {
            // Special styling for the current directory header
            this.iconPath = new vscode.ThemeIcon(
                'location',
                new vscode.ThemeColor('terminal.ansiGreen')
            );
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
                this.description = 'Current';
            } else if (stat && lsOptions) {
                // Show size and date for long format with padding for alignment
                const sizeStr = lsOptions.humanReadable 
                    ? this.formatSize(stat.size) 
                    : stat.size.toString();
                const dateStr = this.formatDate(stat.mtime);
                const paddedSize = this.padRight(sizeStr, lsOptions.humanReadable ? 8 : 12);
                this.description = `${paddedSize}${dateStr}`;
            }
        } else if (type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
            
            // Show file info for long format
            if (stat && lsOptions) {
                const sizeStr = lsOptions.humanReadable 
                    ? this.formatSize(stat.size) 
                    : stat.size.toString();
                const dateStr = this.formatDate(stat.mtime);
                const paddedSize = this.padRight(sizeStr, lsOptions.humanReadable ? 8 : 12);
                this.description = `${paddedSize}${dateStr}`;
                
                const displaySize = lsOptions.humanReadable 
                    ? this.formatSize(stat.size) 
                    : `${stat.size} bytes`;
                this.tooltip = `${fullPath}\nSize: ${displaySize}\nModified: ${stat.mtime.toLocaleString()}`;
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }

    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
    }

    private padRight(str: string, width: number): string {
        // Use non-breaking spaces (\u00A0) for padding to maintain alignment
        const NBSP = '\u00A0';
        if (str.length >= width) {
            return str;
        }
        return str + NBSP.repeat(width - str.length);
    }

    private formatDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // If within the last 6 months, show like GNU ls: "Mon DD HH:MM"
        // If older, show: "Mon DD  YYYY"
        if (diffDays < 180) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const day = date.getDate().toString().padStart(2, ' ');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${month} ${day} ${hours}:${minutes}`;
        } else {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const day = date.getDate().toString().padStart(2, ' ');
            const year = date.getFullYear();
            return `${month} ${day}  ${year}`;
        }
    }
}

async function updateLsTableView() {
    if (!lsTableViewProvider || !shouldShowFiles) {
        return;
    }

    try {
        // Read directory contents
        const entries = await fs.promises.readdir(currentWorkingDirectory, { withFileTypes: true });
        
        // Filter hidden files
        let filtered = entries;
        if (!lsOptions.showHidden) {
            filtered = entries.filter(entry => !entry.name.startsWith('.'));
        }

        // Get file stats and create data array
        const fileData: Array<{
            name: string;
            isDir: boolean;
            size: number;
            mtime: Date;
        }> = [];

        for (const entry of filtered) {
            const fullPath = path.join(currentWorkingDirectory, entry.name);
            try {
                const stat = await fs.promises.stat(fullPath);
                fileData.push({
                    name: entry.name,
                    isDir: entry.isDirectory(),
                    size: stat.size,
                    mtime: stat.mtime
                });
            } catch (err) {
                // Skip files we can't stat
            }
        }

        // Sort the data
        fileData.sort((a, b) => {
            if (lsOptions.sortBy === 'none') {
                return 0;
            } else if (lsOptions.sortBy === 'name') {
                // Directories first, then by name
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            } else if (lsOptions.sortBy === 'time') {
                return b.mtime.getTime() - a.mtime.getTime();
            } else if (lsOptions.sortBy === 'size') {
                return b.size - a.size;
            }
            return 0;
        });

        if (lsOptions.reverseSort) {
            fileData.reverse();
        }

        // Update the webview
        lsTableViewProvider.updateTable(currentWorkingDirectory, fileData, lsOptions);
    } catch (err) {
        outputChannel.appendLine(`Error updating table view: ${err}`);
    }
}

interface FileData {
    name: string;
    isDir: boolean;
    size: number;
    mtime: Date;
}

class LsTableViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getInitialHtml();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'changeDirectory':
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    terminal.sendText(`cd "${message.path}"`);
                    break;
                case 'openFile':
                    const doc = await vscode.workspace.openTextDocument(message.path);
                    await vscode.window.showTextDocument(doc);
                    break;
            }
        });
    }

    public updateTable(directory: string, files: FileData[], options: LsOptions) {
        if (this._view) {
            this._view.webview.html = this._getHtmlForTable(directory, files, options);
        }
    }

    public clearTable(directory: string) {
        if (this._view) {
            this._view.webview.html = this._getWaitingHtml(directory);
        }
    }

    private _getInitialHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LS Table</title>
    <style>
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
        }
        .waiting {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="waiting">
        <p>Run <code>ls</code> in the terminal to view directory contents</p>
    </div>
</body>
</html>`;
    }

    private _getWaitingHtml(directory: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LS Table</title>
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
        }
        .header {
            padding: 8px 10px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            font-weight: bold;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .directory-path {
            color: var(--vscode-terminal-ansiGreen);
            font-size: 12px;
        }
        .waiting {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="directory-path">📂 ${directory}</span>
    </div>
    <div class="waiting">
        <p>Run <code>ls</code> to view directory contents</p>
    </div>
</body>
</html>`;
    }

    private _getHtmlForTable(directory: string, files: FileData[], options: LsOptions): string {
        const formatSize = (bytes: number): string => {
            if (!options.humanReadable) {
                return bytes.toString();
            }
            if (bytes < 1024) return `${bytes}B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
            if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
        };

        const formatDate = (date: Date): string => {
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const day = date.getDate().toString().padStart(2, ' ');
            
            if (diffDays < 180) {
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${month} ${day} ${hours}:${minutes}`;
            } else {
                const year = date.getFullYear();
                return `${month} ${day}  ${year}`;
            }
        };

        // Helper to get -F classify indicator
        const getClassifyIndicator = (file: FileData): string => {
            if (!options.classify) return '';
            if (file.isDir) return '/';
            // Could add more indicators: * for executable, @ for symlink, etc.
            return '';
        };

        const tableRows = files.map(file => {
            const icon = file.isDir ? '📁' : '📄';
            const className = file.isDir ? 'directory' : 'file';
            const action = file.isDir ? 'changeDirectory' : 'openFile';
            const fullPath = path.join(directory, file.name);
            const displayName = file.name + getClassifyIndicator(file);
            
            // Conditionally include size and date columns only with -l flag
            if (options.longFormat) {
                return `
                    <tr class="${className}" onclick="handleClick('${action}', '${fullPath.replace(/'/g, "\\'")}')">
                        <td class="icon">${icon}</td>
                        <td class="name">${displayName}</td>
                        <td class="size">${formatSize(file.size)}</td>
                        <td class="date">${formatDate(file.mtime)}</td>
                    </tr>
                `;
            } else {
                return `
                    <tr class="${className}" onclick="handleClick('${action}', '${fullPath.replace(/'/g, "\\'")}')">
                        <td class="icon">${icon}</td>
                        <td class="name">${displayName}</td>
                    </tr>
                `;
            }
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LS Table</title>
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            padding: 8px 10px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            font-weight: bold;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .directory-path {
            color: var(--vscode-terminal-ansiGreen);
            font-size: 12px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        th {
            position: sticky;
            top: 33px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            padding: 4px 8px;
            text-align: left;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            font-size: 11px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }
        th.icon { width: 30px; }
        th.name { width: auto; }
        th.size { width: 80px; }
        th.date { width: 120px; }
        tr {
            cursor: pointer;
        }
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        tr.directory:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        td {
            padding: 4px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        td.icon {
            text-align: center;
            font-size: 14px;
        }
        td.name {
            font-weight: 500;
        }
        tr.directory td.name {
            color: var(--vscode-terminal-ansiBlue);
            font-weight: 600;
        }
        td.size {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        td.date {
            color: var(--vscode-descriptionForeground);
            font-variant-numeric: tabular-nums;
        }
        .empty {
            padding: 40px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="directory-path">📂 ${directory}</span>
    </div>
    <table>
        <thead>
            <tr>
                <th class="icon"></th>
                <th class="name">Name</th>
                ${options.longFormat ? '<th class="size">Size</th>' : ''}
                ${options.longFormat ? '<th class="date">Modified</th>' : ''}
            </tr>
        </thead>
        <tbody>
            ${tableRows || `<tr><td colspan="${options.longFormat ? '4' : '2'}" class="empty">No files to display</td></tr>`}
        </tbody>
    </table>
    <script>
        const vscode = acquireVsCodeApi();
        
        function handleClick(action, path) {
            vscode.postMessage({
                command: action,
                path: path
            });
        }
    </script>
</body>
</html>`;
    }
}

export function deactivate() {
    outputChannel?.dispose();
    statusBarItem?.dispose();
}
