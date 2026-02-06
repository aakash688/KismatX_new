#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createDatabaseDump, verifyDatabaseConnection } from './db-manager.js';
import { uploadToS3, deleteOldBackupsFromS3 } from './s3-manager.js';
import { validateDbConfig, validateAwsConfig, validateBackupConfig, getBackupConfig, getBackupFilePath } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Delete backup files older than specified days
 */
const autoDeleteOldBackups = async (backupFolderPath, daysToKeep) => {
  try {
    if (!fs.existsSync(backupFolderPath)) {
      return;
    }
    
    const files = fs.readdirSync(backupFolderPath);
    const now = Date.now();
    const timeThreshold = daysToKeep * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      
      const filePath = path.join(backupFolderPath, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      if (fileAge > timeThreshold) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`🗑️  Deleted old backup: ${file}`);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`✅ Auto-delete: Removed ${deletedCount} backups older than ${daysToKeep} days\n`);
    }
    
  } catch (error) {
    console.warn(`⚠️  Auto-delete warning: ${error.message}`);
  }
};

/**
 * Main backup function
 */
const runBackup = async () => {
  console.log('\n📦 ============== KismatX Database Backup ==============\n');
  
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
    
    // Verify database connection
    await verifyDatabaseConnection();
    
    // Get backup file path from config
    const backupFilePath = getBackupFilePath();
    
    // Create database dump
    const dumpResult = await createDatabaseDump(backupConfig.backupFolderPath);
    
    // Upload to S3
    const s3Result = await uploadToS3(dumpResult.path, dumpResult.filename);
    
    // ✅ DELETE LOCAL FILE IMMEDIATELY AFTER UPLOAD
    console.log('\n🧹 Deleting local backup file immediately...');
    fs.unlinkSync(dumpResult.path);
    console.log(`✅ Local file deleted: ${dumpResult.filename}`);
    
    // ✅ DELETE OLD FILES FROM S3 (older than retention days)
    console.log('\n☁️  Cleaning up old backups from S3...');
    await deleteOldBackupsFromS3(backupConfig.retentionDays);
    
    // Summary
    console.log('\n✨ ============== Backup Summary ==============');
    console.log(`✅ Database: ${process.env.DB_NAME || 'kismatx'}`);
    console.log(`📊 Dump Size: ${dumpResult.size.toFixed(2)} MB`);
    console.log(`💾 Local File: DELETED ✅`);
    console.log(`☁️  S3 Bucket: ${s3Result.bucket}`);
    console.log(`📍 S3 Path: ${s3Result.key}`);
    console.log(`📅 Timestamp: ${s3Result.timestamp}`);
    console.log('==========================================\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Backup failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('  1. Run "npm run setup" to configure all settings');
    console.error('  2. Ensure backup folder path is writable');
    console.error('  3. Ensure mysqldump is installed and in PATH');
    console.error('  4. Verify database credentials in ../.env');
    console.error('  5. Check AWS permissions for S3 upload\n');
    process.exit(1);
  }
};

// Run backup
runBackup();
