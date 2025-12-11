@echo off
REM Spec Kit VS Code Extension - Build and Package Script for Windows

setlocal enabledelayedexpansion

echo Building Spec Kit VS Code Extension...

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo Error: Node.js is not installed. Please install Node.js ^>= 18.0.0
    exit /b 1
)

REM Check Node version
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo Node.js %NODE_VERSION%

REM Check if npm is installed
where npm >nul 2>nul
if errorlevel 1 (
    echo Error: npm is not installed
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo npm %NPM_VERSION%

REM Step 1: Clean
echo.
echo 1. Cleaning...
if exist node_modules rmdir /s /q node_modules
if exist dist rmdir /s /q dist
if exist out rmdir /s /q out
for /f %%i in ('dir /b *.vsix 2^>nul') do del %%i
echo Done

REM Step 2: Install dependencies
echo.
echo 2. Installing dependencies...
call npm install
if errorlevel 1 (
    echo Error: npm install failed
    exit /b 1
)

REM Step 3: Lint
echo.
echo 3. Running linter...
call npm run lint
if errorlevel 1 (
    echo Warning: Linting issues found (non-fatal)
)

REM Step 4: Compile TypeScript
echo.
echo 4. Compiling TypeScript...
call npm run compile
if errorlevel 1 (
    echo Error: TypeScript compilation failed
    exit /b 1
)

REM Step 5: Build with esbuild
echo.
echo 5. Building with esbuild...
call npm run esbuild-base -- --minify
if errorlevel 1 (
    echo Error: Build failed
    exit /b 1
)

REM Step 6: Package extension
echo.
echo 6. Packaging extension...
call npm run package
if errorlevel 1 (
    echo Error: Packaging failed
    exit /b 1
)

REM Find the .vsix file
for /f %%i in ('dir /b *.vsix 2^>nul ^| findstr /v "^$"') do (
    set VSIX_FILE=%%i
)

if "%VSIX_FILE%"=="" (
    echo Error: Failed to create .vsix file
    exit /b 1
)

echo.
echo Success! Extension packaged.
echo File: %VSIX_FILE%
echo.
echo Next steps:
echo 1. Install in VS Code: Extensions: Install from VSIX (%VSIX_FILE%)
echo 2. Publish to Marketplace: npm run publish (requires authentication)
echo.
