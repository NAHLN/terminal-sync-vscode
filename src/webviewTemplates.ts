// webviewTemplates.ts -
//   Use this module to organize all html-generating functions.
//   See matching private method names (with _ added in front) in
//   class LsTableViewProvider (extension.ts)
import { matchesGlob } from "./globTool";
import * as path from 'path';
import * as vscode from 'vscode';
import * as LsParser from "./commandParser";
import * as FileSystem from "./fileData";

export function getInitialHtml(cssUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LS Table</title>
<link href="${cssUri}" rel="stylesheet">
</head>
<body>
<div class="waiting">
    <p>Run <code>ls</code> in the terminal to view directory contents</p>
</div>
</body>
</html>`;
}

export function getWaitingHtml(directory: string, cssUri: vscode.Uri): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LS Table</title>
    <link href="${cssUri}" rel="stylesheet">
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
    options: LsParser.LsOptions,
    cssUri: vscode.Uri
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


        const activeGlob = "*.json";   
        const isMatch = matchesGlob(file.name, activeGlob);
        const rowClass = [
            file.isDirectory ? "directory" : "file",
            isMatch ? "glob-match" : "glob-nomatch"
        ].join(" ");
        
        // Conditionally include size and date columns only with -l flag
        if (options.longFormat) {
            return `
                <tr class="${rowClass}" onclick="handleClick('${action}', '${fullPath.replace(/'/g, "\\'")}')">
                    <td class="mode" title="${escapeHtml(getModeTooltip(file))}">${file.mode}</td>
                    <td class="owner">${file.owner}</td>
                    <td class="group">${file.group}</td>
                    <td class="size">${formatSize(file.size, options.humanReadable)}</td>
                    <td class="date">${formatDate(file.mtime)}</td>
                    <td class="name">${displayName}</td>                    
                </tr>
            `;
        } else {
            return `
                <tr class="${rowClass}" onclick="handleClick('${action}', '${fullPath.replace(/'/g, "\\'")}')">
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
    <link href="${cssUri}" rel="stylesheet">
</head>
<body>
    <div class="header">
        <span class="directory-path">📂 ${directory}</span>
    </div>
    <table>
        <thead>
            <tr>
                ${options.longFormat ? '<th class="mode">Mode</td>' : ''}
                ${options.longFormat ? '<th class="owner">Owner</th>' : ''}
                ${options.longFormat ? '<th class="group">Group</th>' : ''}
                ${options.longFormat ? '<th class="size">Size</th>' : ''}
                ${options.longFormat ? '<th class="date">Modified</th>' : ''}
                <th class="name">Name</th>                
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

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, "&#10;");
}

function getModeTooltip(file: FileSystem.FileData): string {
    const mode = file.mode; // like "-rwxr-xr--"

    const typeChar = mode[0];
    const user = mode.slice(1, 4);
    const group = mode.slice(4, 7);
    const other = mode.slice(7, 10);

    const typeMap: Record<string, string> = {
        '-': 'Regular file',
        'd': 'Directory',
        'l': 'Symbolic link',
        'c': 'Character device',
        'b': 'Block device',
        's': 'Socket',
        'p': 'FIFO (named pipe)',
    };

    function decodePerms(perm: string): string {
        return [
            perm[0] === 'r' ? 'Read' : '',
            perm[1] === 'w' ? 'Write' : '',
            perm[2] === 'x' ? 'Execute' : ''
        ].filter(Boolean).join(',');
    }

    return [
        `${file.name} (${mode})`,
        `Type: ${typeMap[typeChar] ?? 'Unknown'} (${typeChar})`,
        `User: ${decodePerms(user)} (${user})`,
        `Group: ${decodePerms(group)} (${group})`,
        `Other: ${decodePerms(other)} (${other})`,
    ].join('\n');
}