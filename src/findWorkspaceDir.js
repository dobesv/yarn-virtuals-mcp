import path from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";

export default function findWorkspaceDir(workspaceName) {
    const out = execSync('yarn workspaces list --json', { encoding: 'utf8', cwd: process.cwd(), timeout: 10000 });
    for (const line of out.trim().split('\n')) {
        const ws = JSON.parse(line);
        if (ws.name === workspaceName) return path.resolve(process.cwd(), ws.location);
    }
    const direct = path.resolve(process.cwd(), workspaceName);
    if (existsSync(direct)) return direct;
    throw new Error(`Workspace not found: ${workspaceName}`);
}
