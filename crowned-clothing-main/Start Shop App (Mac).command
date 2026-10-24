#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "First-time setup - installing dependencies, this may take a minute..."
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "Something went wrong during install. Make sure Node.js is installed"
    echo "from https://nodejs.org and try again."
    read -p "Press Enter to close..."
    exit 1
  fi
fi

echo "Building the app..."
npm run build
if [ $? -ne 0 ]; then
  echo ""
  echo "Build failed. See the messages above."
  read -p "Press Enter to close..."
  exit 1
fi

echo "Starting the shop app server..."
npm run start &
SERVER_PID=$!

sleep 3
open http://localhost:4000

echo ""
echo "The app should now be open in your browser."
echo "Keep this window open while you use the app - closing it stops the app."
echo ""
echo "First time only: sign in as Admin / PIN 0000, then set a real PIN"
echo "and add your team under the Users tab."
echo ""

wait $SERVER_PID
