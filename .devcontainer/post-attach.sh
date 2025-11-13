#!/bin/bash
# This runs after VS Code attaches to the container

echo "🔨 Building and installing extension..."

# Build the extension
npm run compile

# Package the extension
if ! command -v vsce &> /dev/null; then
    npm install -g @vscode/vsce
fi

vsce package --no-git-tag-version --allow-star-activation

# Install the extension
VSIX_FILE=$(ls -t *.vsix | head -1)
if [ -n "$VSIX_FILE" ]; then
    code --install-extension "$VSIX_FILE" --force
    echo "✅ Extension installed: $VSIX_FILE"
fi

