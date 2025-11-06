# PowerShell script to start all services in split terminals
# This script opens terminals in Cursor/VS Code using the code CLI

Write-Host "Starting services in split terminals..." -ForegroundColor Green

# Get the workspace root directory
$workspaceRoot = $PSScriptRoot

# Function to start a service in a new terminal
function Start-ServiceInTerminal {
    param(
        [string]$ServiceName,
        [string]$ServicePath,
        [string]$GroupName
    )
    
    $serviceFullPath = Join-Path $workspaceRoot $ServicePath
    
    Write-Host "Starting $ServiceName..." -ForegroundColor Yellow
    
    # Use wt (Windows Terminal) if available, otherwise use cmd
    if (Get-Command wt -ErrorAction SilentlyContinue) {
        wt -w 0 split-pane -d "$serviceFullPath" npm run start:dev
    } else {
        # Fallback: Open in new Cursor terminal
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$serviceFullPath'; npm run start:dev"
    }
}

# Start Group 1: API Gateway, Auth, Post
Write-Host "`nStarting Group 1: API Gateway, Auth Service, Post Service" -ForegroundColor Cyan
Start-Sleep -Milliseconds 500
Start-ServiceInTerminal "API Gateway" "services\api-gateway" "group1"
Start-Sleep -Milliseconds 300
Start-ServiceInTerminal "Auth Service" "services\auth-service" "group1"
Start-Sleep -Milliseconds 300
Start-ServiceInTerminal "Post Service" "services\post-service" "group1"

# Wait a bit before starting group 2
Start-Sleep -Seconds 2

# Start Group 2: Notification, Message, User
Write-Host "`nStarting Group 2: Notification Service, Message Service, User Service" -ForegroundColor Cyan
Start-Sleep -Milliseconds 500
Start-ServiceInTerminal "Notification Service" "services\notification-service" "group2"
Start-Sleep -Milliseconds 300
Start-ServiceInTerminal "Message Service" "services\message-service" "group2"
Start-Sleep -Milliseconds 300
Start-ServiceInTerminal "User Service" "services\user-service" "group2"

# Wait a bit before starting frontend
Start-Sleep -Seconds 2

# Start Frontend
Write-Host "`nStarting Frontend (Next.js)" -ForegroundColor Cyan
Start-Sleep -Milliseconds 500
$frontendPath = Join-Path $workspaceRoot "frontend"
Write-Host "Starting Frontend..." -ForegroundColor Yellow

# Use wt (Windows Terminal) if available, otherwise use cmd
if (Get-Command wt -ErrorAction SilentlyContinue) {
    # Open in new tab (works whether WT is already open or not)
    wt new-tab -d "$frontendPath" npm run dev
} else {
    # Fallback: Open in new Cursor terminal
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev"
}

Write-Host "`nAll services started!" -ForegroundColor Green
Write-Host "Note: If Windows Terminal (wt) is not installed, services will open in separate windows." -ForegroundColor Yellow

