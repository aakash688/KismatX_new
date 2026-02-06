# KismatX — Database Backup Utility

Automated MySQL database backup tool with PM2 scheduling, local retention, and optional S3 upload.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Node.js | Runtime |
| PM2 | Process manager & cron scheduling |
| mysqldump | Database export |
| AWS S3 (optional) | Remote backup storage |

## Files

```
dbbackup/
├── backup.js           # Main backup script
├── restore.js          # Restore from backup
├── scheduler.js        # PM2 cron-based scheduler
├── config.js           # Configuration loader
├── db-manager.js       # MySQL connection & dump utilities
├── s3-manager.js       # AWS S3 upload (optional)
├── setup.js            # First-time setup wizard
├── ecosystem.config.js # PM2 configuration
├── backup-config.env.example  # Environment template
└── package.json
```

## Setup

```bash
cd dbbackup
npm install

# Configure
cp backup-config.env.example backup-config.env
# Edit backup-config.env with your DB credentials

# Run manually
node backup.js

# Schedule with PM2
pm2 start ecosystem.config.js
```

## Restore

```bash
node restore.js --file backups/KismatX_2025-11-25.sql
```
