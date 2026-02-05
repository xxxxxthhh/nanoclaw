#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

# Build with Apple Container
container build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | container run -i ${IMAGE_NAME}:${TAG}"

# Auto-cleanup old snapshots to save disk space
echo ""
echo "🧹 Cleaning up old container snapshots..."
CLEANUP_SCRIPT="$SCRIPT_DIR/../scripts/cleanup-snapshots.sh"
if [ -x "$CLEANUP_SCRIPT" ]; then
  "$CLEANUP_SCRIPT" || echo "⚠️  Snapshot cleanup failed (non-critical)"
else
  echo "⚠️  Cleanup script not found or not executable: $CLEANUP_SCRIPT"
fi
