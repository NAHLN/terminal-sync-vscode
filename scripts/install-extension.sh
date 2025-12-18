#!/bin/bash
# install-extension.sh
# Installs the pre-built extension package

set -e

VSIX_FILE="terminal-file-explorer-1.1.0.vsix"

if [ ! -f "$VSIX_FILE" ]; then
    echo "❌ Extension package not found: $VSIX_FILE"
    echo "Please build it locally first: vsce package"
    exit 1
fi

echo "🚀 Installing extension from $VSIX_FILE..."

if command -v code &> /dev/null; then
    code --install-extension "$VSIX_FILE" --force
    echo "✅ Extension installed successfully!"
    echo ""
    echo "⚠️  Please reload the VS Code window:"
    echo "   Press Ctrl+Shift+P → Developer: Reload Window"
else
    echo "⚠️  'code' command not found."
    echo "Install manually: Ctrl+Shift+P → Extensions: Install from VSIX → Select $VSIX_FILE"
fi
