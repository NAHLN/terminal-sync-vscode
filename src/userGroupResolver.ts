import { execSync } from "child_process";
import * as fs from "fs";
import { getEnvironmentData } from "worker_threads";

const uidNameMap = new Map<number, string>();
const gidNameMap = new Map<number, string>();

export function initUserGroupMaps() {
    try {
        const passwd = fs.readFileSync("/etc/passwd", "utf8");
        passwd.split("\n").forEach(line => {
            const parts = line.split(":");
            if (parts.length > 2) {
                const username = parts[0];
                const uid = parseInt(parts[2], 10);
                uidNameMap.set(uid, username);
            }
        });

        const group = fs.readFileSync("/etc/group", "utf8");
        group.split("\n").forEach(line => {
            const parts = line.split(":");
            if (parts.length > 2) {
                const groupname = parts[0];
                const gid = parseInt(parts[2], 10);
                gidNameMap.set(gid, groupname);
            }
        });

    } catch (err) {
        console.error("Failed to read /etc/passwd or /etc/group:", err);
    }
}

export function resolveUser(uid: number): string {
    return uidNameMap.get(uid) ?? getent(uid, false);
}

export function resolveGroup(gid: number): string {
    return gidNameMap.get(gid) ?? getent(gid, true);
}

function getent(id: number, isGroup: boolean): string {
    const command = isGroup ? `getent group ${id}` : `getent passwd ${id}`;
    const map = isGroup ? gidNameMap : uidNameMap;

    try {
        const output = execSync(command, { 
            encoding: "utf8", 
            timeout: 1000,
            stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
        }).trim();
        
        const parts = output.split(":");
        if (parts.length > 0 && parts[0]) {
            const name = parts[0];
            map.set(id, name);  // Update the appropriate map
            return name;
        }
    } catch (err) {
        // getent failed - fall through to numeric
    }

    // Cache the numeric fallback so we don't keep trying
    const fallback = id.toString();
    map.set(id, fallback);
    return fallback;
}