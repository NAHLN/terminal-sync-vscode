import { minimatch } from "minimatch";

/**
 * Test whether a filename matches a shell-style glob pattern.
 * This intentionally mirrors GNU-ish glob behavior.
 */
export function matchesGlob(filename: string, pattern: string): boolean 
{
    if (pattern.length == 0) {
        return false; // empty pattern = match all
    }

    return minimatch(filename, pattern, {
        dot: true,        // allow matching dotfiles if pattern includes dot
        nocase: false,    // case-sensitive (Linux/Codespaces behavior)
        matchBase: true   // "*.ts" matches "src/file.ts"
    });
}
