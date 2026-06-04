#\!/bin/bash
set -e

# Start Xvfb (virtual framebuffer) for Chrome compositor
Xvfb :99 -screen 0 1280x720x24 -ac &
sleep 2
export DISPLAY=:99

echo "[entrypoint] Xvfb running on display :99"

exec npx --prefix server tsx server/src/index.ts
