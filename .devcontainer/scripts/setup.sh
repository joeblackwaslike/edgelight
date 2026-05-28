#!/usr/bin/env bash
# Post-create one-time setup. Runs once after the container is first built.
# Subsequent attaches use discover-deps.sh instead.
set -euo pipefail

echo "==> devcontainer setup"

# Recreate the ~/.claude/skills → ~/.agents/skills symlink inside the container.
# The host mounts ~/.agents at /home/vscode/.agents (read-only) and ~/.claude at
# /home/vscode/.claude (writable), but the symlink itself must exist in the container.
if [ -d "$HOME/.agents/skills" ] && [ -d "$HOME/.claude" ]; then
    rm -f "$HOME/.claude/skills"
    ln -sf "$HOME/.agents/skills" "$HOME/.claude/skills"
    echo "    linked ~/.claude/skills → ~/.agents/skills"
fi

# Initialize the mkcert local CA so self-signed certs are trusted in this container
if command -v mkcert >/dev/null 2>&1; then
    mkcert -install 2>/dev/null || true
    echo "    mkcert CA installed"
fi

echo "==> setup complete"
