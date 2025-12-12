// src/extension.ts
// Artifact: terminal-sync-full
// Version: 1.1.0
// Main extension file for Terminal-Synced File Browser
// Enhanced to show files only after 'ls' command with GNU ls option support

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileData, buildFileDataSync, classifyFile } from "./fileData";
import {
    isPwdCommand,
    isCdCommand,
    isLsCommand,
    parseLsOptions,
    extractCdTarget,
    LsOptions
} from "./commandParser";

import * as webviewTemplates from "./webviewTemplates";
import * as UserGroup from "./userGroupResolver";

import { GIT_COMMIT, BUILD_TIME } from "./versionInfo";


let lsOptions: LsOptions = {
    showHidden: false,
    longFormat: false,
    sortBy: 'name',
    reverseSort: false,
    humanReadable: false,
    classify: false,
    almostAll: false
};

// A minimal Dirent-like object for representing "." and ".."
// These behave like directories so the rest of the code can treat them uniformly.
class FakeDirent implements fs.Dirent {
    constructor(public name: string) {}

    isDirectory():       boolean { return true; }
    isFile():            boolean { return false; }
    isSymbolicLink():    boolean { return false; }
    isBlockDevice():     boolean { return false; }
    isCharacterDevice(): boolean { return false; }
    isFIFO():            boolean { return false; }
    isSocket():          boolean { return false; }

    // Use '!' to evade compiler checking for assignment
    parentPath!: string;       // not used
    path!: string;             // not used
}


let outputChannel: vscode.OutputChannel;
let remoteExplorer: RemoteFileExplorer;
let lsTableViewProvider: LsTableViewProvider;
let currentWorkingDirectory: string = '';
let statusBarItem: vscode.StatusBarItem;
let shouldShowFiles: boolean = false;  // Only show files after ls command


export function activate(context: vscode.ExtensionContext) {
    console.log('Terminal-Synced File Browser activated');

    outputChannel = vscode.window.createOutputChannel('Terminal File Sync');
    
    // build the User/Group number => name lookup for `ls`
    UserGroup.initUserGroupMaps();

    // Create status bar item to show current directory
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'terminal-file-explorer.revealCurrentDirectory';
    statusBarItem.text = '$(folder) ~';
    statusBarItem.tooltip = 'Current working directory (click to reveal)';
    statusBarItem.show();
    const versionItem = vscode.window.createStatusBarItem();
    versionItem.text = `Extension hash: ${GIT_COMMIT}`;
    versionItem.show();

    
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
                    const targetDir = extractCdTarget(command, currentWorkingDirectory);
                    
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

function GNULikeSortKey(name: string): string {
    if (name === ".") return "\x00";
    if (name === "..") return "\x01";
    if (name.startsWith(".")) return name.substring(1);
    return name;
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
            classify: false,
            almostAll: false
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
            // Strictly alphabetical - no directories first
            sorted = entries.sort((a, b) => {
                return GNULikeSortKey(a.name).localeCompare(GNULikeSortKey(b.name));
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
        
        let filtered: fs.Dirent[];

        if (lsOptions.showHidden) {
            if (lsOptions.almostAll) {
                // -A (almost-all):
                // show dotfiles EXCEPT "." and ".."
                filtered = entries.filter(entry =>
                    entry.name !== "." &&
                    entry.name !== ".."
                );
            } else {
                // -a:
                // show all dotfiles AND insert "." and ".."
                filtered = [
                    new FakeDirent("."),
                    new FakeDirent(".."),
                    ...entries
                ];
            }
        } else {
            // Default ls behavior:
            // hide dotfiles (anything starting with ".")
            filtered = entries.filter(entry =>
                !entry.name.startsWith('.')
            );
        }

        // Get file stats and create data array
        const fileData: FileData[] = [];
        for (const entry of filtered) {
            const fd = buildFileDataSync(currentWorkingDirectory, entry.name);
            fileData.push(fd);
        }

        // Sort the data
        fileData.sort((a, b) => {
            if (lsOptions.sortBy === 'none') {
                return 0;
            } else if (lsOptions.sortBy === 'name') {
                // Strictly alphabetical - no directories first
                return GNULikeSortKey(a.name).localeCompare(GNULikeSortKey(b.name));
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


class LsTableViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _cssUri?: vscode.Uri;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, "media")
            ]
        };

        this._cssUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "styles.css")
        );

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

    // see webviewTemplates.ts to view the 
    // table's HTML
    private _getInitialHtml(): string {
        return webviewTemplates.getInitialHtml(this._cssUri!);
    }
    private _getWaitingHtml(directory: string): string {
        return webviewTemplates.getWaitingHtml(directory, this._cssUri!);
    }
    private _getHtmlForTable(directory: string, files: FileData[], options: LsOptions): string { 
        return webviewTemplates.getHtmlForTable(directory, files, options, this._cssUri!);
    }

}


export function deactivate() {
    outputChannel?.dispose();
    statusBarItem?.dispose();
}
