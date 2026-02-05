#!/bin/bash
# Clean up old Apple Container snapshots
# Keeps only the newest 2 snapshots to save disk space

SNAPSHOTS_DIR="$HOME/Library/Application Support/com.apple.container/snapshots"

if [ ! -d "$SNAPSHOTS_DIR" ]; then
  echo "❌ Snapshots directory not found"
  exit 1
fi

cd "$SNAPSHOTS_DIR" || exit 1

# Count snapshots (excluding ingest directory)
SNAPSHOT_COUNT=$(ls -t | grep -v ingest | wc -l | tr -d ' ')

if [ "$SNAPSHOT_COUNT" -le 2 ]; then
  echo "✓ Only $SNAPSHOT_COUNT snapshot(s) found, no cleanup needed"
  exit 0
fi

# Calculate how many to delete
TO_DELETE=$((SNAPSHOT_COUNT - 2))

echo "Found $SNAPSHOT_COUNT snapshots, deleting oldest $TO_DELETE..."

# Delete old snapshots
ls -t | grep -v ingest | tail -n +3 | while read snapshot; do
  echo "  🗑️  Deleting: $snapshot"
  rm -rf "$snapshot"
done

# Show results
NEW_SIZE=$(du -sh "$SNAPSHOTS_DIR" | cut -f1)
echo ""
echo "✅ Cleanup complete!"
echo "Current size: $NEW_SIZE"
