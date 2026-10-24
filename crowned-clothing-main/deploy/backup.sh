#!/bin/bash
# Backs up the shop database with a timestamped filename.
# Suggested cron entry (daily at 2am), edit the path first:
#   0 2 * * * /opt/textile-shop-manager/deploy/backup.sh
#
# Keeps the last 30 backups and deletes older ones automatically.

set -e
cd "$(dirname "$0")/.."

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
cp server/shop.db "$BACKUP_DIR/shop_${TIMESTAMP}.db"

# Keep only the most recent 30 backups
ls -1t "$BACKUP_DIR"/shop_*.db 2>/dev/null | tail -n +31 | xargs -r rm --

echo "Backed up to $BACKUP_DIR/shop_${TIMESTAMP}.db"
