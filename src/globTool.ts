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
    const expanded = expandBraces(pattern);

    return expanded.some(p =>
        minimatch(filename, p, {
            dot: true,
            nocase: false,
            matchBase: true
        })
    );
}
function expandBraces(pattern: string): string[] {
    const match = pattern.match(/^(.*?)\{([^}]*)\}(.*)$/);
    if (!match) {
        return [pattern];
    }

    const [, prefix, body, suffix] = match;

    let expansions: string[] = [];

    // Numeric range {01..10}
    const numRange = body.match(/^(\d+)\.\.(\d+)$/);
    if (numRange) {
        const [ , a, b ] = numRange;
        const start = parseInt(a, 10);
        const end = parseInt(b, 10);
        const width = Math.max(a.length, b.length);
        const step = start <= end ? 1 : -1;

        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
            expansions.push(String(i).padStart(width, "0"));
        }
    }

    // Alphabetic range {a..z} / {Z..A}
    else if (/^[a-zA-Z]\.\.[a-zA-Z]$/.test(body)) {
        const start = body.charCodeAt(0);
        const end = body.charCodeAt(3);
        const step = start <= end ? 1 : -1;

        for (let c = start; step > 0 ? c <= end : c >= end; c += step) {
            expansions.push(String.fromCharCode(c));
        }
    }

    // Comma list (including empty elements)
    else if (body.includes(",")) {
        expansions = body.split(",");
    }

    // Unexpandable → leave literal
    else {
        return [pattern];
    }

    // Recursive cartesian expansion
    const results = new Set<string>();
    for (const part of expansions) {
        for (const expanded of expandBraces(`${prefix}${part}${suffix}`)) {
            results.add(expanded);
        }
    }

    return Array.from(results);
}
