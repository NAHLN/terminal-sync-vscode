import * as fs from "fs";

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
    return uidNameMap.get(uid) ?? uid.toString();
}

export function resolveGroup(gid: number): string {
    return gidNameMap.get(gid) ?? gid.toString();
}