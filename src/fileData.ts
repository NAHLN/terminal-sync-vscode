// fileData.ts
import * as fs from "fs";
import * as path from "path";
import * as UserGroup from "./userGroupResolver";

export interface FileTypeFlags {
    isRegularFile: boolean; 
    isDirectory: boolean;
    isSymlink: boolean;
    isFIFO: boolean;
    isSocket: boolean;
    isCharacterDevice: boolean;
    isBlockDevice: boolean;
}

export interface FileData extends FileTypeFlags {
  name: string;
  fullPath: string;

  // raw stats
  stats: fs.Stats;

  // convenience fields
  mode: string;            // "-rwxr-xr--"

  mtime: Date;
  atime: Date;
  ctime: Date;
  size: number;

  // symlink target if applicable
  linkTarget?: string;

  // pretty-printed for display
  sizeString: string;
  accessDateString: string;
  modifiedDateString: string;
  changedDateString: string; // metadata, such as permissions

  // file owner and group provided by userGroupResolver
  owner:string;
  group:string;

  // optional: ls classification symbols like "/", "@", "*"
  classify?: string;
}

const S_IFIFO =  0o010000;  // named pipe
const S_IFCHR =  0o020000;  // character device file
const S_IFDIR =  0o040000;  // directory
const S_IFBLK =  0o060000;  // block device file
const S_IFREG =  0o100000;  // regular file
const S_IFLNK =  0o120000;  // symbolic link
const S_IFSOCK = 0o140000;  // socket
const S_IFMT  =  0o170000;  // bitmask for file type.  

function detectFileType(stats: fs.Stats):FileTypeFlags {
    const mode = stats.mode & S_IFMT;

    return {
        isRegularFile: mode === S_IFREG,
        isDirectory: mode === S_IFDIR,
        isSymlink: mode === S_IFLNK,
        isFIFO: mode === S_IFIFO,
        isSocket: mode === S_IFSOCK,
        isCharacterDevice: mode === S_IFCHR,
        isBlockDevice: mode === S_IFBLK
    };
}


export function buildFileDataSync(dir: string, filename: string): FileData {
  const fullPath = path.join(dir, filename);
  const stats = fs.lstatSync(fullPath);

  // file type flags from helper
  const typeFlags = detectFileType(stats);

  const fileData: FileData = {
    name: filename,
    fullPath,
    stats,

    // convenience fields
    mode: "",
    ...typeFlags,   // ★ spreads all POSIX type booleans

    mtime: stats.mtime,
    atime: stats.atime,
    ctime: stats.ctime,
    size: stats.size,

    // pretty-printed fields
    sizeString: formatSize(stats.size),
    accessDateString: formatDate(stats.atime),
    modifiedDateString: formatDate(stats.mtime),
    changedDateString: formatDate(stats.ctime),

    owner: UserGroup.resolveUser(stats.uid),
    group: UserGroup.resolveGroup(stats.gid),

    classify: undefined
  };

  fileData.mode = formatMode(fileData);

  // symlink target resolution
  if (fileData.isSymlink) {
    try {
      fileData.linkTarget = fs.readlinkSync(fullPath);
    } catch {
      /* ignore errors */
    }
  }

  // optional classification indicator
  fileData.classify = classifyFile(fileData);

  return fileData;
}

export function classifyFile(file: FileData): string {
  if (file.isDirectory) return "/";
  if (file.isSymlink) return "@";
  if (file.isSocket) return "=";
  if (file.isFIFO) return "|";

  // Executable regular file
  if (file.isRegularFile && (file.stats.mode & 0o111)) {
    return "*";
  }

  return "";
}

export function formatDate(d: Date): string {
  const now = new Date();
  const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000; // APPROX: same method GNU uses
  const diff = now.getTime() - d.getTime();

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const month = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, " "); // Note: ls uses space padding, not 0

  if (Math.abs(diff) < sixMonthsMs) {
    // Recent file → Mon DD HH:MM
    const hours = String(d.getHours()).padStart(2, "0");
    const mins  = String(d.getMinutes()).padStart(2, "0");
    return `${month} ${day} ${hours}:${mins}`;
  } else {
    // Older file → Mon DD  YYYY
    const year = d.getFullYear();
    return `${month} ${day}  ${year}`;
  }
}


export function formatSize(bytes: number): string {
  // Matches GNU ls: 1024-based units
  const units = ["B", "K", "M", "G", "T", "P", "E"];
  let size = bytes;
  let unitIndex = 0;

  // Determine the largest unit
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  // Formatting rules:
  // - No decimals if size is an integer (e.g., "2K")
  // - One decimal place otherwise (e.g., "1.5K")
  const rounded =
    size >= 10 || Number.isInteger(size)
      ? size.toFixed(0)
      : size.toFixed(1);

  // ls -lh omits the "B" suffix for bytes
  if (unitIndex === 0) {
    return `${rounded}`;
  }

  return `${rounded}${units[unitIndex]}`;
}


export function fileTypeChar(flags: FileTypeFlags): string {
  if (flags.isDirectory) return "d";
  if (flags.isSymlink) return "l";
  if (flags.isFIFO) return "p";
  if (flags.isSocket) return "s";
  if (flags.isCharacterDevice) return "c";
  if (flags.isBlockDevice) return "b";
  return "-"; // regular file or unknown
}
export function permissionsFromModeBits(mode: number): string {
  const bits = [
    // user
    (mode & 0o400) ? "r" : "-",
    (mode & 0o200) ? "w" : "-",
    (mode & 0o100) ? "x" : "-",
    // group
    (mode & 0o040) ? "r" : "-",
    (mode & 0o020) ? "w" : "-",
    (mode & 0o010) ? "x" : "-",
    // other
    (mode & 0o004) ? "r" : "-",
    (mode & 0o002) ? "w" : "-",
    (mode & 0o001) ? "x" : "-"
  ];

  return bits.join("");
}
export function formatMode(file: FileData): string {
  const typeChar = fileTypeChar(file);            // use precomputed booleans
  const permStr = permissionsFromModeBits(file.stats.mode); // numeric mode is already present
  return typeChar + permStr;
}