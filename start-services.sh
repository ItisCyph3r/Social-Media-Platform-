#!/bin/bash
# Bash script to start all services in split terminals
# This script uses tmux to create split terminals

echo "Starting services in split terminals using tmux..."

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo "tmux is not installed. Please install it first:"
    echo "  macOS: brew install tmux"
    echo "  Linux: sudo apt-get install tmux"
    exit 1
fi

# Get the workspace root directory
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create a new tmux session or attach to existing one
SESSION_NAME="services"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session $SESSION_NAME already exists. Attaching..."
    tmux attach-session -t "$SESSION_NAME"
    exit 0
fi

# Create new tmux session
tmux new-session -d -s "$SESSION_NAME" -n "group1"

# Split window into 3 panes for Group 1
tmux send-keys -t "$SESSION_NAME:group1" "cd $WORKSPACE_ROOT/services/api-gateway && npm run start:dev" C-m
tmux split-window -h -t "$SESSION_NAME:group1"
tmux send-keys -t "$SESSION_NAME:group1" "cd $WORKSPACE_ROOT/services/auth-service && npm run start:dev" C-m
tmux split-window -h -t "$SESSION_NAME:group1"
tmux send-keys -t "$SESSION_NAME:group1" "cd $WORKSPACE_ROOT/services/post-service && npm run start:dev" C-m
tmux select-layout -t "$SESSION_NAME:group1" even-horizontal

# Create new window for Group 2
tmux new-window -t "$SESSION_NAME" -n "group2"

# Split window into 3 panes for Group 2
tmux send-keys -t "$SESSION_NAME:group2" "cd $WORKSPACE_ROOT/services/notification-service && npm run start:dev" C-m
tmux split-window -h -t "$SESSION_NAME:group2"
tmux send-keys -t "$SESSION_NAME:group2" "cd $WORKSPACE_ROOT/services/message-service && npm run start:dev" C-m
tmux split-window -h -t "$SESSION_NAME:group2"
tmux send-keys -t "$SESSION_NAME:group2" "cd $WORKSPACE_ROOT/services/user-service && npm run start:dev" C-m
tmux select-layout -t "$SESSION_NAME:group2" even-horizontal

# Create new window for Frontend
tmux new-window -t "$SESSION_NAME" -n "frontend"
tmux send-keys -t "$SESSION_NAME:frontend" "cd $WORKSPACE_ROOT/frontend && npm run dev" C-m

# Select the first window
tmux select-window -t "$SESSION_NAME:group1"

# Attach to the session
tmux attach-session -t "$SESSION_NAME"

