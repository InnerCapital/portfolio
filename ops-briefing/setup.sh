#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "  Daily Briefing System - Setup"
echo "============================================"
echo ""

# ---- Check and Install Node.js ----
if ! command -v node &> /dev/null; then
    echo "  [!!] Node.js not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo "  Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install node
        fi
    else
        # Linux
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
    echo "  [OK] Node.js installed"
else
    echo "  [OK] Node.js $(node --version)"
fi

# ---- Install dependencies ----
echo ""
echo "  Installing dependencies..."
npm install --silent 2>/dev/null
echo "  [OK] Dependencies ready"

# ---- Install Playwright ----
echo ""
echo "  Installing Playwright Chromium..."
npx playwright install chromium 2>/dev/null
if [[ "$OSTYPE" != "darwin"* ]]; then
    npx playwright install-deps chromium 2>/dev/null
fi
echo "  [OK] Browser ready"

# ---- Create folders ----
mkdir -p tokens output playwright-data
echo "  [OK] Folders ready"

# ---- Create .env if needed ----
if [ ! -f ".env" ]; then
    if [ -f ".env.alex" ]; then
        cp .env.alex .env
    elif [ -f ".env.example" ]; then
        cp .env.example .env
    fi
    echo "  [NOTE] Created .env - add your API key"
fi

# ---- Status ----
echo ""
echo "  ---- Status ----"
[ -f "credentials.json" ] && echo "  [OK] Google credentials" || echo "  [!!] Missing credentials.json"
[ -f ".env" ] && echo "  [OK] Environment file" || echo "  [!!] Missing .env"

echo ""
echo "============================================"
echo "  Opening settings page..."
echo "============================================"
echo ""
echo "  Starting server at http://localhost:3001"
echo "  Press Ctrl+C to stop."
echo ""

# Open browser after delay
(sleep 3 && open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001 2>/dev/null) &

node server.js
