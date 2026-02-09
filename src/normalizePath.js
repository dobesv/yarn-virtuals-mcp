import path from "path";

export default function normalizePath(p) {
    p = p.trim().replace(/^["']|["']$/g, '');
    const isUnixPath = p.startsWith('/') && (
        p.match(/^\/mnt\/[a-z]\//i) ||
        (process.platform !== 'win32') ||
        (process.platform === 'win32' && !p.match(/^\/[a-zA-Z]\//)));
    if (isUnixPath) {
        return p.replace(/\/+/g, '/').replace(/(?<!^)\/$/, '');
    }
    if (p.match(/^[a-zA-Z]:/)) {
        p = p.replace(/\//g, '\\');
    }
    let normalized = path.normalize(p);
    if (normalized.match(/^[a-zA-Z]:/)) {
        let result = normalized.replace(/\//g, '\\');
        if (/^[a-z]:/.test(result)) {
            result = result.charAt(0).toUpperCase() + result.slice(1);
        }
        return result;
    }
    if (process.platform === 'win32') {
        return normalized.replace(/\//g, '\\');
    }
    return normalized;
}
