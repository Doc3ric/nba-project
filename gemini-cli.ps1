#!/usr/bin/env pwsh
# Gemini CLI Wrapper for NBA Analytics Project
# Quick commands for common tasks

param(
    [Parameter(Mandatory=$true)]
    [string]$Task,
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

function Show-Help {
    Write-Host @"
Gemini CLI Wrapper for NBA Analytics Project

USAGE: .\gemini-cli.ps1 <task> [arguments]

TASKS:
  test-api <endpoint> [options]     - Test an API endpoint
  generate-code <description>        - Generate code for a feature
  generate-tests <target>            - Generate tests for a component/endpoint
  generate-docs <target>             - Generate documentation
  debug <issue-description>          - Debug an issue with Gemini

EXAMPLES:
  .\gemini-cli.ps1 test-api GET /players/search -q "LeBron"
  .\gemini-cli.ps1 generate-code "New prop filter component"
  .\gemini-cli.ps1 generate-tests "PlayerSearch component"
  .\gemini-cli.ps1 debug "FastAPI endpoint returning 500 errors"

CONFIG: .gemini-cli-config.json
PROMPTS: ./prompts/

"@
}

function Invoke-GeminiCLI {
    # Check if API key is set
    if (-not $env:GOOGLE_API_KEY) {
        Write-Error "GOOGLE_API_KEY environment variable not set. Run: gemini-cli config add"
        exit 1
    }

    switch ($Task.ToLower()) {
        "test-api" {
            $prompt = Get-Content "prompts/api-testing.md" -Raw
            Write-Host "🧪 API Testing Mode" -ForegroundColor Cyan
            Write-Host "Analyzing: $($Arguments -join ' ')" -ForegroundColor Yellow
        }
        "generate-code" {
            $prompt = Get-Content "prompts/code-generation.md" -Raw
            Write-Host "💻 Code Generation Mode" -ForegroundColor Cyan
            Write-Host "Task: $($Arguments -join ' ')" -ForegroundColor Yellow
        }
        "generate-tests" {
            $prompt = Get-Content "prompts/test-generation.md" -Raw
            Write-Host "✅ Test Generation Mode" -ForegroundColor Cyan
            Write-Host "Target: $($Arguments -join ' ')" -ForegroundColor Yellow
        }
        "generate-docs" {
            $prompt = Get-Content "prompts/docs-generation.md" -Raw
            Write-Host "📖 Documentation Generation Mode" -ForegroundColor Cyan
            Write-Host "Target: $($Arguments -join ' ')" -ForegroundColor Yellow
        }
        "help" {
            Show-Help
            exit 0
        }
        default {
            Write-Error "Unknown task: $Task"
            Show-Help
            exit 1
        }
    }

    Write-Host "`nContext: Player Props Edge - NBA Analytics Dashboard" -ForegroundColor Gray
    Write-Host "Backend: FastAPI | Frontend: React | Database: SQLite`n" -ForegroundColor Gray
}

# Run the command
Invoke-GeminiCLI

# Note: Actual gemini-cli invocation would go here
# For now, this is a wrapper showing how to use it
Write-Host "`nℹ️  Open this prompt in Gemini to interact: https://ai.google.dev/chatbox" -ForegroundColor Green
