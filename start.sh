#!/bin/bash
# =============================================================
# Samiksha Analytics — Quick Start Script
# =============================================================
# This script:
#   1. Starts the FastAPI analytics server
#   2. Opens an ngrok tunnel to expose it to the internet
#   3. Shows you the public URL to use in your website
# =============================================================

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   Samiksha Analytics — Quick Start       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed."
    echo "   Install it: brew install ngrok"
    exit 1
fi

# Check if Python dependencies are installed
if ! python3 -c "import fastapi" &> /dev/null; then
    echo "📦 Installing Python dependencies..."
    pip3 install -r backend/requirements.txt
fi

echo ""
echo "🚀 Step 1: Starting analytics server on port 8000..."
echo ""

# Start the FastAPI server in the background
cd "$(dirname "$0")/backend"
uvicorn main:app --host 127.0.0.1 --port 8000 &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo ""
echo "🌐 Step 2: Starting ngrok tunnel..."
echo ""

# Start ngrok in the background
ngrok http 8000 --log=stdout &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Get the public URL from ngrok's API
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
    echo "⚠️  Could not auto-detect ngrok URL."
    echo "   Check http://127.0.0.1:4040 for your public URL."
    echo ""
    NGROK_URL="CHECK_NGROK_DASHBOARD"
fi

echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║  ✅ Analytics server is running!                     ║"
echo "  ║                                                      ║"
echo "  ║  Your public ngrok URL:                              ║"
echo "  ║  $NGROK_URL"
echo "  ║                                                      ║"
echo "  ║  Dashboard:   http://localhost:8000                   ║"
echo "  ║  ngrok panel: http://127.0.0.1:4040                  ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
echo "📝 NEXT STEPS:"
echo ""
echo "  1. Open your website files:"
echo "     - Samiksha-Tiwari-Tarot-Reader/index.html"
echo "     - Samiksha-Tiwari-Tarot-Reader/pricing.html"
echo ""
echo "  2. Find this line in both files:"
echo '     <script>window.SAMIKSHA_API_URL = "YOUR_NGROK_URL";</script>'
echo ""
echo "  3. Replace YOUR_NGROK_URL with:"
echo "     $NGROK_URL"
echo ""
echo "  4. Commit and push your changes to GitHub."
echo ""
echo "  5. Visit your website — tracking will start automatically!"
echo ""
echo "⚠️  NOTE: ngrok URLs change every time you restart."
echo "   For permanent tracking, deploy to Render/Railway instead."
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

# Wait for user to press Ctrl+C
trap "kill $SERVER_PID $NGROK_PID 2>/dev/null; echo ''; echo '👋 Stopped.'; exit 0" INT TERM
wait
