#!/bin/bash
# Direct launcher for Xcode on macOS Tahoe 26.2
echo "Starting Xcode..."
nohup /Users/mani/Desktop/Xcode_Ready/Xcode.app/Contents/MacOS/Xcode >/dev/null 2>&1 &
echo "Xcode is opening in the background!"
sleep 2
