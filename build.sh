#!/bin/bash

# Spec Kit VS Code Extension - Build and Package Script

set -e

echo "📦 Building Spec Kit VS Code Extension..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js >= 18.0.0${NC}"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be >= 18.0.0 (current: $(node -v))${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Step 1: Clean
echo -e "\n${YELLOW}1. Cleaning...${NC}"
rm -rf node_modules dist out *.vsix
echo -e "${GREEN}✓ Cleaned${NC}"

# Step 2: Install dependencies
echo -e "\n${YELLOW}2. Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 3: Lint
echo -e "\n${YELLOW}3. Running linter...${NC}"
npm run lint || echo -e "${YELLOW}⚠ Linting warnings (non-fatal)${NC}"

# Step 4: Compile TypeScript
echo -e "\n${YELLOW}4. Compiling TypeScript...${NC}"
npm run compile
echo -e "${GREEN}✓ TypeScript compiled${NC}"

# Step 5: Build with esbuild
echo -e "\n${YELLOW}5. Building with esbuild...${NC}"
npm run esbuild-base -- --minify
echo -e "${GREEN}✓ Build complete${NC}"

# Step 6: Package extension
echo -e "\n${YELLOW}6. Packaging extension...${NC}"
if command -v vsce &> /dev/null; then
    vsce package
else
    npm run package
fi
echo -e "${GREEN}✓ Packaged${NC}"

# Find the .vsix file
VSIX_FILE=$(find . -maxdepth 1 -name "*.vsix" | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo -e "${RED}❌ Failed to create .vsix file${NC}"
    exit 1
fi

echo -e "\n${GREEN}✅ Extension packaged successfully!${NC}"
echo -e "${GREEN}📦 File: $(basename $VSIX_FILE)${NC}"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Install in VS Code: Extensions: Install from VSIX (${VSIX_FILE})"
echo "2. Publish to Marketplace: npm run publish (requires authentication)"
echo ""
