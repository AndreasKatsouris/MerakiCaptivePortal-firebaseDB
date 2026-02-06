#!/bin/bash

# init.sh - Sparks Hospitality Development Environment Setup
# This script initializes the development environment for the Meraki Captive Portal project

set -e  # Exit on error

echo "=========================================="
echo "Sparks Hospitality - Development Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 22+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${YELLOW}Warning: Node.js version 22+ recommended (you have v$NODE_VERSION)${NC}"
fi
echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"
echo ""

# Check Firebase CLI
echo "Checking Firebase CLI..."
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}Firebase CLI not found. Installing...${NC}"
    npm install -g firebase-tools
fi
echo -e "${GREEN}✓ Firebase CLI $(firebase --version) detected${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    if [ -f ".env.template" ]; then
        echo "Creating .env from .env.template..."
        cp .env.template .env
        echo -e "${YELLOW}⚠ Please configure .env with your credentials${NC}"
    else
        echo -e "${RED}Error: .env.template not found${NC}"
    fi
    echo ""
fi

# Install dependencies
echo "Installing dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
else
    echo "Root dependencies already installed"
fi
echo ""

# Install Cloud Functions dependencies
if [ -d "functions" ]; then
    echo "Installing Cloud Functions dependencies..."
    cd functions
    if [ ! -d "node_modules" ]; then
        npm install
    else
        echo "Functions dependencies already installed"
    fi
    cd ..
else
    echo -e "${YELLOW}Warning: functions directory not found${NC}"
fi
echo ""

# Check Firebase project
echo "Checking Firebase project configuration..."
if [ -f ".firebaserc" ]; then
    PROJECT_ID=$(grep -o '"default": "[^"]*' .firebaserc | cut -d'"' -f4)
    echo -e "${GREEN}✓ Firebase project: $PROJECT_ID${NC}"
else
    echo -e "${RED}Error: .firebaserc not found${NC}"
    echo "Please run: firebase init"
    exit 1
fi
echo ""

# Start Firebase Emulators
echo "Starting Firebase Emulators..."
echo -e "${YELLOW}This will start:${NC}"
echo "  - Firebase Functions Emulator (port 5001)"
echo "  - Firebase Realtime Database Emulator (port 9000)"
echo "  - Firebase Hosting Emulator (port 5000)"
echo "  - Firebase Firestore Emulator (port 8080)"
echo "  - Firebase Storage Emulator (port 9199)"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop the emulators${NC}"
echo ""

# Check if emulators are already running
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Port 5000 already in use. Stopping existing process...${NC}"
    kill $(lsof -t -i:5000) 2>/dev/null || true
    sleep 2
fi

# Start emulators with UI
firebase emulators:start --import=./firebase-export --export-on-exit

# Note: The script will stay running while emulators are active
# On exit (Ctrl+C), Firebase will auto-export data to ./firebase-export
