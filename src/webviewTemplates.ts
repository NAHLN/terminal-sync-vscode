// webviewTemplates.ts -
//   Use this module to organize all html-generating functions.
//   See matching private method names (with _ added in front) in
//   class LsTableViewProvider (extension.ts)
import * as LsParser from "./commandParser";
import * as FileSystem from "./fileData";
import * as path from 'path';

export function getInitialHtml(): string {
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

export function getWaitingHtml(directory: string): string {
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

export function getHtmlForTable(
    directory: string, 
    files: FileSystem.FileData[], 
    options: LsParser.LsOptions
): string {


    // Helper to get -F classify indicator
    const getClassifyIndicator = (file: FileSystem.FileData): string => {
        if (!options.classify) return "";
        // use the precomputed value if present, otherwise compute it
        return file.classify ?? FileSystem.classifyFile(file);
    };

    const tableRows = files.map(file => {
        const icon = file.isDirectory ? '📁' : '📄';
        const className = file.isDirectory ? 'directory' : 'file';
        const action = file.isDirectory ? 'changeDirectory' : 'openFile';
        const fullPath = path.join(directory, file.name);
        const displayName = file.name + getClassifyIndicator(file);
        const showIcon = options.longFormat || options.classify;
        
        // Conditionally include size and date columns only with -l flag
        if (options.longFormat) {
            return `
                <tr class="${className}" onclick="handleClick('${action}', '${fullPath.replace(/'/g, "\\'")}')">
                    ${showIcon ? `<td class="icon">${icon}</td>` : ''}
                    <td class="name">${displayName}</td>
                    <td class="mode">${file.mode}</td>
                    <td class="size">${formatSize(file.size, options.humanReadable)}</td>
                    <td class="date">${formatDate(file.mtime)}</td>
                </tr>
            `;
        } else {
            return `
                <tr class="${className}" onclick="handleClick('${action}', '${fullPath.replace(/'/g, "\\'")}')">
                    ${showIcon ? `<td class="icon">${icon}</td>` : ''}
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
                ${options.longFormat || options.classify ? '<th class="icon"></th>' : ''}
                <th class="name">Name</th>
                ${options.longFormat ? '<th class="mode">Mode</td>' : ''}
                ${options.longFormat ? '<th class="size">Size</th>' : ''}
                ${options.longFormat ? '<th class="date">Modified</th>' : ''}
            </tr>
        </thead>
        <tbody>
            ${tableRows || `<tr><td colspan="${(options.longFormat || options.classify ? 1 : 0) + 1 + (options.longFormat ? 2 : 0)}" class="empty">No files to display</td></tr>`}
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


/*
* Common formatting functions that replicate output by "GNU ls"
*/

export function formatSize(bytes: number, humanReadable: boolean = false): string {
    if (!humanReadable) {
        return bytes.toString();
    }
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
};

export function formatDate(date: Date): string {
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