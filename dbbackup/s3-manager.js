import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { getAwsConfig, validateAwsConfig } from './config.js';

/**
 * Initialize AWS S3 client
 */
export const initializeS3 = () => {
  const config = getAwsConfig();
  
  const s3 = new AWS.S3({
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  
  return s3;
};

/**
 * Upload backup file to S3
 */
export const uploadToS3 = async (filePath, fileName) => {
  try {
    validateAwsConfig();
    
    const s3 = initializeS3();
    const config = getAwsConfig();
    
    const fileContent = fs.readFileSync(filePath);
    
    const params = {
      Bucket: config.bucket,
      Key: `kmx/${fileName}`,
      Body: fileContent,
      ContentType: 'application/x-sql',
      Metadata: {
        'backup-date': new Date().toISOString(),
        'database': process.env.DB_NAME || 'kismatx',
      },
    };
    
    console.log(`📤 Uploading ${fileName} to S3...`);
    
    const result = await s3.upload(params).promise();
    
    console.log(`✅ Backup uploaded successfully!`);
    console.log(`📍 Location: s3://${config.bucket}/${params.Key}`);
    console.log(`🔗 ETag: ${result.ETag}`);
    
    return {
      success: true,
      location: result.Location,
      bucket: config.bucket,
      key: params.Key,
      etag: result.ETag,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error('❌ S3 Upload Error:', error.message);
    throw error;
  }
};

/**
 * List all backups in S3
 */
export const listBackups = async () => {
  try {
    validateAwsConfig();
    
    const s3 = initializeS3();
    const config = getAwsConfig();
    
    const params = {
      Bucket: config.bucket,
      Prefix: 'kmx/',
    };
    
    const result = await s3.listObjectsV2(params).promise();
    
    if (!result.Contents || result.Contents.length === 0) {
      console.log('📭 No backups found in S3');
      return [];
    }
    
    console.log(`📦 Found ${result.Contents.length} backup(s):\n`);
    
    const backups = result.Contents.map(file => ({
      key: file.Key,
      size: (file.Size / (1024 * 1024)).toFixed(2) + ' MB',
      lastModified: file.LastModified,
    })).sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    backups.forEach((backup, index) => {
      console.log(`${index + 1}. ${backup.key}`);
      console.log(`   📊 Size: ${backup.size}`);
      console.log(`   📅 Modified: ${backup.lastModified}\n`);
    });
    
    return backups;
    
  } catch (error) {
    console.error('❌ Error listing backups:', error.message);
    throw error;
  }
};

/**
 * Download backup from S3
 */
export const downloadBackupFromS3 = async (key, outputPath) => {
  try {
    validateAwsConfig();
    
    const s3 = initializeS3();
    const config = getAwsConfig();
    
    const params = {
      Bucket: config.bucket,
      Key: key,
    };
    
    console.log(`📥 Downloading ${key}...`);
    
    const data = await s3.getObject(params).promise();
    
    fs.writeFileSync(outputPath, data.Body);
    
    console.log(`✅ Backup downloaded to: ${outputPath}`);
    
    return {
      success: true,
      path: outputPath,
      size: data.Body.length,
    };
    
  } catch (error) {
    console.error('❌ Download Error:', error.message);
    throw error;
  }
};

/**
 * Delete old backups from S3 (kmx/ folder)
 */
export const deleteOldBackupsFromS3 = async (retentionDays) => {
  try {
    if (retentionDays <= 0) {
      console.log('🔄 S3 retention cleanup disabled (BACKUP_RETENTION_DAYS <= 0)');
      return { success: true, deleted: 0 };
    }
    
    validateAwsConfig();
    
    const s3 = initializeS3();
    const config = getAwsConfig();
    
    const params = {
      Bucket: config.bucket,
      Prefix: 'kmx/',
    };
    
    console.log(`🔍 Checking S3 for backups older than ${retentionDays} days...`);
    
    const result = await s3.listObjectsV2(params).promise();
    
    if (!result.Contents || result.Contents.length === 0) {
      console.log('📭 No backups found in S3 kmx/ folder');
      return { success: true, deleted: 0 };
    }
    
    const now = Date.now();
    const timeThreshold = retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    const deletePromises = [];
    
    for (const file of result.Contents) {
      const fileAge = now - new Date(file.LastModified).getTime();
      
      if (fileAge > timeThreshold) {
        const deleteParams = {
          Bucket: config.bucket,
          Key: file.Key,
        };
        
        deletePromises.push(
          s3.deleteObject(deleteParams).promise().then(() => {
            console.log(`  🗑️  Deleted from S3: ${file.Key}`);
            deletedCount++;
          })
        );
      }
    }
    
    await Promise.all(deletePromises);
    
    if (deletedCount > 0) {
      console.log(`✅ S3 Cleanup: Removed ${deletedCount} backups older than ${retentionDays} days`);
    }
    
    return { success: true, deleted: deletedCount };
    
  } catch (error) {
    console.error('❌ S3 cleanup error:', error.message);
    throw error;
  }
};

/**
 * Delete backup from S3
 */
export const deleteBackupFromS3 = async (key) => {
  try {
    validateAwsConfig();
    
    const s3 = initializeS3();
    const config = getAwsConfig();
    
    const params = {
      Bucket: config.bucket,
      Key: key,
    };
    
    await s3.deleteObject(params).promise();
    
    console.log(`✅ Backup deleted: ${key}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Delete Error:', error.message);
    throw error;
  }
};

export default {
  initializeS3,
  uploadToS3,
  listBackups,
  downloadBackupFromS3,
  deleteBackupFromS3,
  deleteOldBackupsFromS3,
};
