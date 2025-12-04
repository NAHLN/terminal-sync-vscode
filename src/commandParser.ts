// src/commandParser.ts

import * as path from "path";
import * as fs from "fs";

export interface LsOptions {
    showHidden: boolean;      // -a or -A
    longFormat: boolean;      // -l
    sortBy: 'name' | 'time' | 'size' | 'none';  // -t, -S, -U
    reverseSort: boolean;     // -r
    humanReadable: boolean;   // -h
    classify: boolean;        // -F (append indicator to entries)
    almostAll: boolean;          // -A (do not show . or ..)
}


export function isPwdCommand(command: string): boolean {
    return /^\s*pwd\s*$/.test(command);
}

export function isCdCommand(command: string): boolean {
    const cdPatterns = [
        /^cd(\s|$)/,        // cd with optional space/argument or end of line
        /^pushd\s+/,
        /&&\s*cd(\s|$)/,    // cd in command chain
        /;\s*cd(\s|$)/      // cd after semicolon
    ];
    return cdPatterns.some(pattern => pattern.test(command));
}

export function isLsCommand(command: string): boolean {
    // Match ls command, potentially with options and arguments
    // Handles: ls, ls -la, ls /path, ls -l /path, etc.
    return /^\s*ls(\s|$)/.test(command);
}

export function parseLsOptions(command: string): LsOptions {
    const options: LsOptions = {
        showHidden: false,
        longFormat: false,
        sortBy: 'name',
        reverseSort: false,
        humanReadable: false,
        classify: false,
        almostAll: false
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
            options.showHidden = true;  
            options.almostAll = true;   
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


export function extractCdTarget(command: string, currentWorkingDirectory: string): string | null {
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