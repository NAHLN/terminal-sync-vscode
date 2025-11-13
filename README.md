# Terminal Directory Navigator

A VS Code extension that syncs with your terminal, displaying `ls` output in a beautiful table view. Perfect for learning command-line navigation in Codespaces and remote development environments.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🔄 Automatic Synchronization
- Tracks `cd` commands in the terminal
- Updates directory view automatically
- Shows absolute path in the header

### 📊 Interactive Table View
- Displays `ls` output in a clean, sortable table
- Supports GNU ls flags: `-l`, `-a`, `-h`, `-F`, `-t`, `-S`, `-r`, `-U`
- Click directories to navigate
- Click files to open in editor

### 🎨 Smart Display
- Icons only appear with `-l` or `-F` flags
- Columns adapt based on flags used
- Strictly alphabetical sorting (like GNU ls)
- Human-readable file sizes with `-h`

## Usage

### Basic Commands

```bash
cd /path/to/directory    # Navigate to directory
ls                       # Show files (name only)
ls -l                    # Show detailed listing
ls -lh                   # Show with human-readable sizes
ls -F                    # Show with type indicators (/)
ls -la                   # Show all files including hidden
```

### Supported ls Flags

| Flag | Description |
|------|-------------|
| `-l` | Long format (shows size, date) |
| `-a` | Show hidden files (starting with .) |
| `-A` | Show hidden files (except . and ..) |
| `-h` | Human-readable sizes (KB, MB, GB) |
| `-F` | Classify entries with indicators (/) |
| `-t` | Sort by modification time |
| `-S` | Sort by file size |
| `-r` | Reverse sort order |
| `-U` | No sorting (directory order) |

### Flag Combinations

```bash
ls -lah      # Long format, all files, human-readable
ls -lt       # Long format, sorted by time
ls -lSr      # Long format, sorted by size, reversed
ls -F        # Show type indicators
ls -lF       # Long format with type indicators
```

## Display Modes

### Plain `ls` - Minimal View
```
┌─────────────┐
│ Name        │
├─────────────┤
│ file1.txt   │
│ folder      │
│ script.sh   │
└─────────────┘
```

### `ls -F` - With Indicators
```
┌──────┬──────────────┐
│ Icon │ Name         │
├──────┼──────────────┤
│ 📄   │ file1.txt    │
│ 📁   │ folder/      │
│ 📄   │ script.sh    │
└──────┴──────────────┘
```

### `ls -l` - Full Details
```
┌──────┬───────────┬──────┬─────────────────┐
│ Icon │ Name      │ Size │ Modified        │
├──────┼───────────┼──────┼─────────────────┤
│ 📄   │ file1.txt │ 1234 │ Nov 13 14:30    │
│ 📁   │ folder    │ 4096 │ Nov 12 09:15    │
│ 📄   │ script.sh │ 8192 │ Nov 11 16:45    │
└──────┴───────────┴──────┴─────────────────┘
```

## Installation

### For Development (Codespaces)

This extension is designed to auto-install in Codespaces via the devcontainer configuration.

1. Open the repository in a Codespace
2. The extension installs automatically on startup
3. Reload the window when prompted
4. Look for the Terminal File Explorer icon in the activity bar

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/YOUR-USERNAME/terminal-sync-vscode.git
cd terminal-sync-vscode

# Install and build
npm install
npm run compile

# Package the extension
npx vsce package

# Install in VS Code
code --install-extension terminal-file-explorer-1.1.0.vsix
```

### From Source (Development)

```bash
# Open in VS Code
code .

# Press F5 to launch Extension Development Host
# Test the extension in the new window
```

## Requirements

- VS Code 1.80.0 or higher
- Terminal with shell integration enabled
- Bash, Zsh, or compatible shell

## Extension Settings

This extension currently has no configurable settings. All behavior is controlled by the `ls` flags you use in the terminal.

## Known Issues

- Shell integration required for terminal tracking
- Currently supports Linux/Unix paths (Codespaces, WSL, Mac)
- Some advanced `ls` flags not yet supported

## Roadmap

- [ ] Color coding (blue directories, green executables)
- [ ] More `-F` indicators (*, @, |, =)
- [ ] Executable detection (chmod +x)
- [ ] Symlink support
- [ ] Multi-column layout for plain `ls`
- [ ] Right-click context menu
- [ ] Workflow wizards for data organization

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

[Your Name]

## Acknowledgments

- Inspired by GNU coreutils `ls` command
- Built for teaching command-line navigation in Codespaces
- Uses VS Code's Terminal Shell Integration API

## Support

- **Issues**: [GitHub Issues](https://github.com/YOUR-USERNAME/terminal-sync-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR-USERNAME/terminal-sync-vscode/discussions)

---

**Note**: This extension is designed primarily for educational use in Codespaces and remote development environments. It helps students learn command-line navigation by providing visual feedback.
