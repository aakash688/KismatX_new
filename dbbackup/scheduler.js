#!/usr/bin/env node

import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseDump, verifyDatabaseConnection } from './db-manager.js';
import { uploadToS3, deleteOldBackupsFromS3 } from './s3-manager.js';
import { validateDbConfig, validateAwsConfig, validateBackupConfig, getBackupConfig } from './config.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse cron schedule and get next run time
 */
const getNextBackupTime = (cronExpression) => {
  try {
    // Parse cron: "0 23 * * *" => [hour, minute]
    const parts = cronExpression.split(' ');
    const minute = parseInt(parts[0]);
    const hour = parseInt(parts[1]);
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextBackup = new Date(now);
    nextBackup.setHours(hour, minute, 0, 0);
    
    // If scheduled time has already passed today, schedule for tomorrow
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }
    
    return nextBackup;
  } catch (error) {
    return null;
  }
};

/**
 * Format time difference to readable string
 */
const formatTimeDifference = (futureDate) => {
  const now = new Date();
  const diff = futureDate - now;
  
  if (diff <= 0) return 'NOW';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${hours}h ${minutes}m ${seconds}s`;
};

/**
 * Log to file
 */
const logToFile = (message, logPath) => {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, logMessage);
  } catch (error) {
    console.warn(`⚠️  Could not write to log file: ${error.message}`);
  }
};

/**
 * Display countdown to next backup
 */
const displayCountdown = (lastBackupTime, nextBackupTime, logPath) => {
  const now = new Date().toLocaleString();
  const last = lastBackupTime ? lastBackupTime.toLocaleString() : 'Never';
  const next = nextBackupTime.toLocaleString();
  const timeUntilNext = formatTimeDifference(nextBackupTime);
  
  console.clear();
  console.log('\n⏰ ============== KismatX Backup Scheduler ==============\n');
  console.log(`📅 Current Time: ${now}`);
  console.log(`\n📋 Backup Status:`);
  console.log(`   Last Backup:  ${last}`);
  console.log(`   Next Backup:  ${next}`);
  console.log(`   Time Until:   ${timeUntilNext}`);
  console.log(`\n📝 Log File: ${logPath}`);
  console.log(`\n💡 Tip: Backups run ONLY at scheduled time`);
  console.log(`   Tip: Each backup: Create → Upload → Delete Local → Clean S3\n`);
  console.log('=======================================================\n');
};

/**
 * Scheduled backup function
 */
const scheduleBackup = async () => {
  try {
    // Validate configurations
    console.log('🔍 Validating configuration...\n');
    validateDbConfig();
    validateAwsConfig();
    validateBackupConfig();
    
    // Get backup configuration
    const backupConfig = getBackupConfig();
    
    // Ensure backup folder exists
    if (!fs.existsSync(backupConfig.backupFolderPath)) {
      fs.mkdirSync(backupConfig.backupFolderPath, { recursive: true });
      console.log(`📁 Created backup folder: ${backupConfig.backupFolderPath}\n`);
    }
    
    const schedule = backupConfig.schedule;
    const retention = backupConfig.retentionDays;
    const logPath = backupConfig.logFilePath;
    
    console.log('📋 Scheduler Configuration:');
    console.log(`  📅 Schedule: ${schedule} (Daily at this time)`);
    console.log(`  📁 Backup Folder: ${backupConfig.backupFolderPath}`);
    console.log(`  📊 S3 Retention: ${retention} days`);
    console.log(`  📝 Log File: ${logPath}`);
    console.log(`\n⏳ Initializing scheduler...\n`);
    
    let lastBackupTime = null;
    const nextBackupTime = getNextBackupTime(schedule);
    
    // Display initial status
    setTimeout(() => {
      displayCountdown(lastBackupTime, nextBackupTime, logPath);
    }, 1000);
    
    // Update countdown every 5 minutes
    const countdownInterval = setInterval(() => {
      displayCountdown(lastBackupTime, nextBackupTime, logPath);
    }, 5 * 60 * 1000); // 5 minutes = 300,000 ms
    
    // Schedule backup task
    cron.schedule(schedule, async () => {
      clearInterval(countdownInterval);
      
      lastBackupTime = new Date();
      const backupTime = lastBackupTime.toISOString();
      const logMessage = `🔄 Backup started`;
      
      console.log(`\n\n⏰ [${backupTime}] Starting scheduled backup...\n`);
      logToFile(logMessage, logPath);
      
      try {
        // Verify database connection
        await verifyDatabaseConnection();
        
        // Create backup in configured folder
        const dumpResult = await createDatabaseDump(backupConfig.backupFolderPath);
        
        // Upload to S3
        const s3Result = await uploadToS3(dumpResult.path, dumpResult.filename);
        
        // ✅ DELETE LOCAL FILE IMMEDIATELY AFTER UPLOAD
        console.log(`\n🧹 Deleting local backup file...`);
        fs.unlinkSync(dumpResult.path);
        console.log(`✅ Local file deleted`);
        
        // ✅ DELETE OLD FILES FROM S3 (older than retention days)
        console.log(`\n☁️  Cleaning up old S3 backups...`);
        await deleteOldBackupsFromS3(retention);
        
        const successMsg = `✅ Backup successful | Size: ${dumpResult.size.toFixed(2)}MB | S3: ${s3Result.key} | Local: Deleted`;
        console.log(`\n${successMsg}\n`);
        logToFile(successMsg, logPath);
        
      } catch (error) {
        const errorMsg = `❌ Backup failed: ${error.message}`;
        console.error(`\n${errorMsg}\n`);
        logToFile(errorMsg, logPath);
      }
      
      // Resume countdown display
      const nextBackup = getNextBackupTime(schedule);
      setTimeout(() => {
        const countdownInterval2 = setInterval(() => {
          displayCountdown(lastBackupTime, nextBackup, logPath);
        }, 5 * 60 * 1000); // 5 minutes = 300,000 ms
        
        // Clear interval on next backup
        setTimeout(() => {
          clearInterval(countdownInterval2);
        }, 24 * 60 * 60 * 1000); // Clear after 24 hours
      }, 2000);
      
      // Show countdown after backup
      displayCountdown(lastBackupTime, nextBackup, logPath);
    });
    
  } catch (error) {
    console.error('\n❌ Scheduler setup failed:', error.message);
    logToFile(`❌ Scheduler setup failed: ${error.message}`, './backups/backups.log');
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Scheduler stopped gracefully');
  process.exit(0);
});

// Run scheduler
scheduleBackup();

