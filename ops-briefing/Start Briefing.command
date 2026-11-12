#!/bin/bash
cd "$(dirname "$0")"

# First run? Do setup
if [ ! -d "node_modules" ]; then
    echo "First run — setting up..."
    bash setup.sh
else
    echo ""
    echo "============================================"
    echo "  Starting Daily Briefing Server"
    echo "============================================"
    echo ""
    echo "  Opening http://localhost:3001"
    echo "  Press Ctrl+C to stop."
    echo ""
    (sleep 2 && open http://localhost:3001) &
    node server.js
fi
