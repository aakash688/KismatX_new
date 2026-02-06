#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { listBackups, downloadBackupFromS3, deleteBackupFromS3 } from './s3-manager.js';
import { validateAwsConfig } from './config.js';

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
 * Interactive restore wizard
 */
const restoreBackup = async () => {
  console.log('\n📥 ============== Restore Database Backup ==============\n');
  
  try {
    // Validate AWS config
    validateAwsConfig();
    
    // List available backups
    const backups = await listBackups();
    
    if (backups.length === 0) {
      console.log('\n❌ No backups available to restore');
      process.exit(0);
    }
    
    // Ask user to select backup
    const selection = await question('\n🔢 Enter backup number to restore (or "cancel" to exit): ');
    
    if (selection.toLowerCase() === 'cancel') {
      console.log('\n❌ Restore cancelled');
      process.exit(0);
    }
    
    const backupIndex = parseInt(selection) - 1;
    
    if (isNaN(backupIndex) || backupIndex < 0 || backupIndex >= backups.length) {
      console.log('\n❌ Invalid selection');
      process.exit(1);
    }
    
    const selectedBackup = backups[backupIndex];
    
    console.log(`\n✅ Selected: ${selectedBackup.key}`);
    
    // Ask for download location
    const downloadPath = await question('📁 Enter download directory (default: ./): ') || './';
    
    // Ensure directory exists
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }
    
    const filename = path.basename(selectedBackup.key);
    const fullPath = path.join(downloadPath, filename);
    
    // Confirm restoration
    const confirm = await question(`\n⚠️  Are you sure you want to download? (yes/no): `);
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('\n❌ Download cancelled');
      process.exit(0);
    }
    
    // Download backup
    await downloadBackupFromS3(selectedBackup.key, fullPath);
    
    console.log(`\n✨ Next steps:`);
    console.log(`  1. Review the downloaded file: ${fullPath}`);
    console.log(`  2. To restore to database, run:`);
    console.log(`     node restore.js`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Restore error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
};

// Run restore
restoreBackup();
