#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => new Promise((resolve) => {
  rl.question(prompt, resolve);
});

/**
 * Validate if path exists or can be created
 */
const validatePath = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(dirPath, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get default backup path based on OS
 */
const getDefaultBackupPath = () => {
  if (process.platform === 'win32') {
    return 'C:\\KismatX\\backups';
  } else if (process.platform === 'darwin') {
    return `${os.homedir()}/KismatX/backups`;
  } else {
    return '/var/backups/kismatx';
  }
};

/**
 * Format cron schedule for display
 */
const formatCronDescription = (cron) => {
  const parts = cron.split(' ');
  if (parts.length !== 5) return 'Invalid cron format';
  
  const descriptions = {
    '0 2 * * *': 'Every day at 2:00 AM',
    '0 0 * * *': 'Every day at midnight',
    '0 */4 * * *': 'Every 4 hours',
    '0 0 * * 0': 'Every Sunday at midnight',
    '0 0 1 * *': '1st of month at midnight',
    '*/15 * * * *': 'Every 15 minutes',
  };
  
  return descriptions[cron] || 'Custom schedule';
};

/**
 * Interactive setup wizard for backup configuration
 */
const setupBackupConfig = async () => {
  console.log('\n🔐 ============== KismatX Backup Configuration Setup ==============\n');
  console.log('This wizard will help you configure database backups to AWS S3.\n');
  
  try {
    // ==================== AWS CREDENTIALS ====================
    console.log('📱 Step 1: AWS Credentials\n');
    console.log('You need:');
    console.log('  • AWS Access Key ID');
    console.log('  • AWS Secret Access Key');
    console.log('  • AWS Region (e.g., us-east-1)');
    console.log('  • S3 Bucket Name\n');
    
    const region = await question('📍 AWS Region (e.g., us-east-1): ');
    if (!region) throw new Error('Region is required');
    
    const accessKeyId = await question('🔑 AWS Access Key ID: ');
    if (!accessKeyId) throw new Error('Access Key ID is required');
    
    const secretAccessKey = await question('🔓 AWS Secret Access Key: ');
    if (!secretAccessKey) throw new Error('Secret Access Key is required');
    
    const bucket = await question('🪣 S3 Bucket Name: ');
    if (!bucket) throw new Error('Bucket name is required');
    
    // ==================== BACKUP FOLDER PATH ====================
    console.log('\n📁 Step 2: Local Backup Folder\n');
    const defaultPath = getDefaultBackupPath();
    console.log(`Default path: ${defaultPath}\n`);
    
    const backupPathInput = await question(`📂 Enter backup folder path (press Enter for default): `);
    let backupPath = backupPathInput || defaultPath;
    
    // Normalize path
    backupPath = path.resolve(backupPath);
    
    // Validate path
    if (!validatePath(backupPath)) {
      throw new Error(`Cannot create or access directory: ${backupPath}`);
    }
    
    console.log(`✅ Backup folder validated: ${backupPath}\n`);
    
    // ==================== BACKUP SCHEDULE ====================
    console.log('⏰ Step 3: Backup Schedule (Cron Format)\n');
    console.log('Common schedules:');
    console.log('  1. 0 2 * * *       → Every day at 2:00 AM (default)');
    console.log('  2. 0 0 * * *       → Every day at midnight');
    console.log('  3. 0 */4 * * *     → Every 4 hours');
    console.log('  4. 0 0 * * 0       → Every Sunday at midnight');
    console.log('  5. 0 0 1 * *       → 1st of month at midnight');
    console.log('  6. */15 * * * *    → Every 15 minutes');
    console.log('  7. Custom\n');
    
    const scheduleChoice = await question('🔢 Select schedule (1-7, or press Enter for default): ');
    
    let schedule = '0 2 * * *'; // Default
    
    if (scheduleChoice === '1' || scheduleChoice === '') {
      schedule = '0 2 * * *';
    } else if (scheduleChoice === '2') {
      schedule = '0 0 * * *';
    } else if (scheduleChoice === '3') {
      schedule = '0 */4 * * *';
    } else if (scheduleChoice === '4') {
      schedule = '0 0 * * 0';
    } else if (scheduleChoice === '5') {
      schedule = '0 0 1 * *';
    } else if (scheduleChoice === '6') {
      schedule = '*/15 * * * *';
    } else if (scheduleChoice === '7') {
      schedule = await question('📝 Enter custom cron expression (e.g., 0 3 * * *): ');
      if (!schedule) throw new Error('Schedule is required');
    }
    
    console.log(`✅ Schedule: ${formatCronDescription(schedule)}\n`);
    
    // ==================== AUTO-DELETE OLD BACKUPS ====================
    console.log('🗑️  Step 4: Auto-Delete Old Backups\n');
    
    const autoDeleteChoice = await question('⚠️  Auto-delete backups older than days? (yes/no, default: yes): ');
    let autoDeleteEnabled = autoDeleteChoice.toLowerCase() !== 'no';
    let autoDeleteDays = 2; // Default
    
    if (autoDeleteEnabled) {
      const daysInput = await question('📅 Days to retain backups (default: 2): ');
      autoDeleteDays = daysInput ? parseInt(daysInput) : 2;
      
      if (isNaN(autoDeleteDays) || autoDeleteDays < 1) {
        autoDeleteDays = 2;
      }
      
      console.log(`✅ Will delete backups older than ${autoDeleteDays} days\n`);
    } else {
      console.log(`✅ Auto-delete disabled\n`);
    }
    
    // ==================== RETENTION DAYS ====================
    console.log('📊 Step 5: Backup Retention\n');
    const retentionDaysInput = await question('📅 Days to retain backups in S3 (default: 30): ');
    const retentionDays = retentionDaysInput ? parseInt(retentionDaysInput) : 30;
    
    if (isNaN(retentionDays) || retentionDays < 1) {
      throw new Error('Retention days must be a positive number');
    }
    
    console.log(`✅ S3 backups retained for ${retentionDays} days\n`);
    
    // ==================== CREATE CONFIG ====================
    const envContent = `# KismatX Database Backup Configuration
# Generated on ${new Date().toISOString()}
# Setup by: Interactive Setup Wizard

# ==================== AWS CREDENTIALS ====================
# AWS Region (e.g., us-east-1, eu-west-1, ap-south-1)
AWS_REGION=${region}

# AWS Access Key ID - Get from AWS IAM Console
AWS_ACCESS_KEY_ID=${accessKeyId}

# AWS Secret Access Key - Keep this secret!
AWS_SECRET_ACCESS_KEY=${secretAccessKey}

# S3 Bucket Name for backups
AWS_S3_BUCKET=${bucket}

# ==================== LOCAL BACKUP PATH ====================
# Folder where local backup files will be stored before uploading to S3
# Files are saved as: BACKUP_FOLDER_PATH/KismatX_YYYY-MM-DD_timestamp.sql
BACKUP_FOLDER_PATH=${backupPath}

# ==================== BACKUP SCHEDULE ====================
# Cron format: minute hour day month weekday
# Examples:
#   0 2 * * *    = Every day at 2:00 AM
#   0 0 * * 0    = Every Sunday at midnight
#   0 */4 * * *  = Every 4 hours
#   */15 * * * * = Every 15 minutes
# Reference: https://crontab.guru/
BACKUP_SCHEDULE=${schedule}

# ==================== AUTO-DELETE SETTINGS ====================
# Enable automatic deletion of local backup files older than specified days
AUTO_DELETE_ENABLED=${autoDeleteEnabled ? 'true' : 'false'}

# Delete local backup files older than N days (only if AUTO_DELETE_ENABLED=true)
# This keeps your disk space clean, backups are already in S3
AUTO_DELETE_DAYS=${autoDeleteDays}

# ==================== S3 RETENTION ====================
# Days to retain backups in S3 before deletion (optional cleanup)
# Set to 0 to disable auto-cleanup in S3
BACKUP_RETENTION_DAYS=${retentionDays}

# ==================== LOGGING ====================
# Log file location (optional)
LOG_FILE_PATH=${path.join(backupPath, 'backups.log')}

# Enable detailed logging (true/false)
DEBUG_MODE=false
`;
    
    const configPath = path.join(__dirname, 'backup-config.env');
    fs.writeFileSync(configPath, envContent);
    
    // ==================== SUMMARY ====================
    console.log('\n✨ ============== Configuration Summary ==============\n');
    console.log('✅ AWS Setup:');
    console.log(`   Region: ${region}`);
    console.log(`   Bucket: ${bucket}`);
    console.log(`   Access Key: ${accessKeyId.substring(0, 5)}...${accessKeyId.substring(accessKeyId.length - 5)}`);
    
    console.log('\n✅ Backup Setup:');
    console.log(`   Local Folder: ${backupPath}`);
    console.log(`   Schedule: ${formatCronDescription(schedule)}`);
    console.log(`   Cron: ${schedule}`);
    
    console.log('\n✅ Auto-Delete Setup:');
    console.log(`   Enabled: ${autoDeleteEnabled ? 'Yes' : 'No'}`);
    if (autoDeleteEnabled) {
      console.log(`   Delete files older than: ${autoDeleteDays} days`);
    }
    
    console.log('\n✅ Retention Setup:');
    console.log(`   S3 Retention: ${retentionDays} days`);
    
    console.log(`\n📝 Config file saved: ${configPath}`);
    
    console.log(`\n🎉 Setup Complete! You can now run:\n`);
    console.log(`  npm run backup              # Create a backup now`);
    console.log(`  npm run backup:schedule     # Start automatic backups`);
    console.log(`  npm run restore             # Restore from S3\n`);
    
  } catch (error) {
    console.error(`\n❌ Setup error: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
};

// Run setup
setupBackupConfig();
