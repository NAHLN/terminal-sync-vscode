# Terminal Workspace Tools

Visual workspace tools that provide guided entry points into terminal-based workflows in VS Code.

The first included tool synchronizes terminal navigation (`cd`, `ls`) with a directory tree and a GNU-style table view. Future tools will add guided workflows such as project initialization and data import — all implemented as transparent shell commands.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

**Terminal Workspace Tools** bridges the gap between *workspace intent* and *terminal execution*.

It does not replace the shell.  
Instead, it provides visual context and guided entry points into common terminal tasks — especially in remote and HPC environments.

---

## Current Tool: Terminal-Synced Directory Navigator

### 🔄 Automatic Synchronization
- Tracks `cd` commands in the integrated terminal
- Updates directory views automatically
- Displays the current working directory in the UI

### 📊 GNU-style `ls` Table View
- Renders `ls` output in a structured table
- Honors GNU `ls` semantics and flags
- Click directories to navigate
- Click files to open in the editor

### 🎛 Supported `ls` Flags

| Flag | Description |
|------|-------------|
| `-l` | Long format (permissions, size, date) |
| `-a` | Show hidden files |
| `-A` | Show hidden files except `.` and `..` |
| `-h` | Human-readable sizes |
| `-F` | Classify entries with indicators (`/`, `*`, etc.) |
| `-t` | Sort by modification time |
| `-S` | Sort by file size |
| `-r` | Reverse sort |
| `-U` | Unsorted (directory order) |

Flag combinations behave as expected:

```bash
ls -lah
ls -lt
ls -lSr
ls -lF
```

---

## Usage

1. Open a terminal in VS Code
2. Navigate using `cd`
3. Run `ls` with your preferred flags
4. View results in the **LS Table** panel and **Directory Tree**

No commands are intercepted or modified — the extension reacts to what you run.

---

## Installation

### From the VS Code Marketplace
Search for:

```
Terminal Workspace Tools
```

or install directly from the Marketplace once published.

### Development / Codespaces

```bash
git clone https://github.com/NAHLN/terminal-sync-vscode.git
cd terminal-sync-vscode
npm install
npm run compile
```

Launch with **F5** to open an Extension Development Host.

---

## Requirements

- VS Code ≥ 1.80
- Terminal shell integration enabled
- Bash, Zsh, or compatible shell
- Linux, macOS, WSL, Codespaces, or remote HPC environments

---

## Roadmap

Planned additions build on the same philosophy:  
**visual guidance → transparent shell commands**

- [ ] Workspace initialization wizard
- [ ] Data import helpers (e.g. Illumina read organization)
- [ ] Context-aware actions (right-click tools)
- [ ] Enhanced classification and color semantics
- [ ] Optional task templates for HPC workflows

---

## Design Philosophy

- No hidden execution
- No proprietary pipelines
- No workflow lock-in
- Shell-first, always

Every tool either:
- Visualizes existing terminal state, or
- Generates shell commands you can inspect and run yourself

---

## Contributing

Contributions and feedback are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## License

MIT — see [LICENSE](LICENSE)

---

## Acknowledgments

- GNU coreutils `ls`
- VS Code Terminal Shell Integration API
- Designed for remote, HPC, and Codespaces workflows
