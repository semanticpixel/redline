#!/bin/bash
# redline-hook.sh — Launches redline TUI in a new terminal tab
# Claude Code hooks run without a TTY, so we open a real terminal for interactive annotation.

# Find redline's built entry point relative to this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDLINE_BIN="$SCRIPT_DIR/dist/bin/index.js"

# Fallback: check if redline is in PATH
if [ ! -f "$REDLINE_BIN" ]; then
    REDLINE_BIN="$(which redline 2>/dev/null)"
    if [ -z "$REDLINE_BIN" ]; then
        echo "redline: binary not found" >&2
        exit 1
    fi
fi

# Unique temp files per invocation (PID avoids collisions)
STDIN_FILE="/tmp/redline-stdin-$$.json"
OUTPUT_FILE="/tmp/redline-output-$$.json"

# Cleanup stale files
rm -f "$OUTPUT_FILE"

# Save the hook's stdin (plan JSON from Claude Code)
cat > "$STDIN_FILE"

# Build the command that will run inside the new terminal tab
if [ -f "$SCRIPT_DIR/dist/bin/index.js" ]; then
    REDLINE_CMD="node '$SCRIPT_DIR/dist/bin/index.js'"
else
    REDLINE_CMD="'$REDLINE_BIN'"
fi

TAB_CMD="export REDLINE_OUTPUT_FILE='$OUTPUT_FILE'; cat '$STDIN_FILE' | $REDLINE_CMD 2>/dev/null; exit"

# Detect terminal emulator and open a new tab
if [ -n "$ITERM_SESSION_ID" ] || pgrep -q "iTerm2"; then
    osascript <<APPLE
tell application "iTerm"
    activate
    tell current window
        create tab with default profile
        tell current session of current tab
            write text "$TAB_CMD"
        end tell
    end tell
end tell
APPLE
elif [ "$(uname)" = "Darwin" ]; then
    osascript <<APPLE
tell application "Terminal"
    activate
    do script "$TAB_CMD"
end tell
APPLE
else
    # Linux: try common terminal emulators
    if command -v gnome-terminal &>/dev/null; then
        gnome-terminal -- bash -c "$TAB_CMD"
    elif command -v kitty &>/dev/null; then
        kitty bash -c "$TAB_CMD"
    elif command -v alacritty &>/dev/null; then
        alacritty -e bash -c "$TAB_CMD"
    else
        echo "redline: no supported terminal emulator found" >&2
        exit 1
    fi
fi

# Wait for redline to finish (output file appears when user submits)
TIMEOUT=300
ELAPSED=0
while [ ! -f "$OUTPUT_FILE" ]; do
    sleep 0.5
    ELAPSED=$((ELAPSED + 1))
    if [ "$ELAPSED" -ge "$((TIMEOUT * 2))" ]; then
        # Timed out — auto-approve so Claude isn't stuck
        echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
        rm -f "$STDIN_FILE"
        exit 0
    fi
done

# Small delay to ensure file write is complete
sleep 0.2

# Send redline's response back to Claude Code
cat "$OUTPUT_FILE"

# Cleanup
rm -f "$STDIN_FILE" "$OUTPUT_FILE"
