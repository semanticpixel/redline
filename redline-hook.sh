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

# Unique temp files per invocation
TMP_DIR="${TMPDIR:-/tmp}"
STDIN_FILE="$(mktemp "$TMP_DIR/redline-stdin.XXXXXX.json")"
OUTPUT_FILE="$(mktemp "$TMP_DIR/redline-output.XXXXXX.json")"
HEARTBEAT_FILE="${OUTPUT_FILE}.heartbeat"

# The wrapper polls for existence, so the final output path must not exist
# until redline atomically renames the completed response into place.
rm -f "$OUTPUT_FILE"

cleanup_files() {
    rm -f "$STDIN_FILE" "$OUTPUT_FILE" "$OUTPUT_FILE".*.tmp "$HEARTBEAT_FILE"
}

escape_applescript_string() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Save the hook's stdin (plan JSON from Claude Code)
cat > "$STDIN_FILE"

# Build the command that will run inside the new terminal tab
if [ -f "$SCRIPT_DIR/dist/bin/index.js" ]; then
    REDLINE_CMD="node '$SCRIPT_DIR/dist/bin/index.js'"
else
    REDLINE_CMD="'$REDLINE_BIN'"
fi

TAB_CMD="export REDLINE_OUTPUT_FILE='$OUTPUT_FILE'; cat '$STDIN_FILE' | $REDLINE_CMD 2>/dev/null; exit"
APPLESCRIPT_TAB_CMD="$(escape_applescript_string "$TAB_CMD")"

# Detect terminal emulator and open a new tab
if [ -n "$ITERM_SESSION_ID" ] || pgrep -q "iTerm2"; then
    osascript <<APPLE
tell application "iTerm"
    activate
    tell current window
        create tab with default profile
        tell current session of current tab
            write text "$APPLESCRIPT_TAB_CMD"
        end tell
    end tell
end tell
APPLE
elif [ "$(uname)" = "Darwin" ]; then
    osascript <<APPLE
tell application "Terminal"
    activate
    do script "$APPLESCRIPT_TAB_CMD"
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
        cleanup_files
        exit 1
    fi
fi

# Wait for redline to finish (output file appears when user submits)
# The Node process writes a heartbeat file every 10s while the TUI is active.
# If the heartbeat goes stale (user closed the tab), we auto-approve early
# instead of waiting the full timeout.
TIMEOUT_SECONDS=900
HEARTBEAT_STALE_SECONDS=60
HALF_SECOND_TICKS=0
while [ ! -f "$OUTPUT_FILE" ]; do
    sleep 0.5
    HALF_SECOND_TICKS=$((HALF_SECOND_TICKS + 1))

    # Hard timeout — deny so the plan is re-presented rather than silently approved
    if [ "$HALF_SECOND_TICKS" -ge "$((TIMEOUT_SECONDS * 2))" ]; then
        echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Review timed out — the redline TUI did not respond within the timeout window. Please re-present the plan."}}}'
        cleanup_files
        exit 0
    fi

    # Heartbeat check — if the TUI started but the heartbeat is stale,
    # the user likely closed the tab without submitting.
    # Deny so the plan is re-presented rather than silently approved.
    if [ -f "$HEARTBEAT_FILE" ]; then
        HEARTBEAT_MTIME=$(stat -f %m "$HEARTBEAT_FILE" 2>/dev/null || stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null || date +%s)
        HEARTBEAT_AGE=$(( $(date +%s) - HEARTBEAT_MTIME ))
        if [ "$HEARTBEAT_AGE" -ge "$HEARTBEAT_STALE_SECONDS" ]; then
            echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Review interrupted — the redline TUI was closed without submitting. Please re-present the plan."}}}'
            cleanup_files
            exit 0
        fi
    fi
done

# Send redline's response back to Claude Code
cat "$OUTPUT_FILE"

# Cleanup
cleanup_files
