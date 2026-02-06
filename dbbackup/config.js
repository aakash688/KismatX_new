import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Load backup configuration from backup-config.env
const backupEnvPath = path.join(__dirname, 'backup-config.env');
if (fs.existsSync(backupEnvPath)) {
  dotenv.config({ path: backupEnvPath });
}

/**
 * Get database configuration from .env
 */
export const getDbConfig = () => {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'KismatX',
  };
};

/**
 * Get AWS configuration from backup-config.env
 */
export const getAwsConfig = () => {
  return {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.AWS_S3_BUCKET,
  };
};

/**
 * Get backup configuration settings
 */
export const getBackupConfig = () => {
  return {
    backupFolderPath: process.env.BACKUP_FOLDER_PATH || './backups',
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *',
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
    autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED === 'true',
    autoDeleteDays: parseInt(process.env.AUTO_DELETE_DAYS) || 2,
    logFilePath: process.env.LOG_FILE_PATH || './backups/backups.log',
    debugMode: process.env.DEBUG_MODE === 'true',
  };
};

/**
 * Validate database configuration
 */
export const validateDbConfig = () => {
  const config = getDbConfig();
  
  if (!config.database) {
    throw new Error('❌ DB_NAME is not configured in .env');
  }
  
  return true;
};

/**
 * Validate AWS configuration
 */
export const validateAwsConfig = () => {
  const config = getAwsConfig();
  
  if (!config.region || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error('❌ AWS credentials are incomplete. Run "npm run setup" first.');
  }
  
  return true;
};

/**
 * Validate backup configuration
 */
export const validateBackupConfig = () => {
  const config = getBackupConfig();
  
  if (!config.backupFolderPath) {
    throw new Error('❌ BACKUP_FOLDER_PATH is not configured. Run "npm run setup" first.');
  }
  
  return true;
};

/**
 * Get timestamp for backup file naming
 */
export const getTimestamp = () => {
  return new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
         new Date().getTime();
};

/**
 * Get backup filename
 */
export const getBackupFilename = () => {
  const dbName = process.env.DB_NAME || 'kismatx';
  return `${dbName}_${getTimestamp()}.sql`;
};

/**
 * Get full backup file path
 */
export const getBackupFilePath = () => {
  const config = getBackupConfig();
  return path.join(config.backupFolderPath, getBackupFilename());
};

export default {
  getDbConfig,
  getAwsConfig,
  getBackupConfig,
  validateDbConfig,
  validateAwsConfig,
  validateBackupConfig,
  getTimestamp,
  getBackupFilename,
  getBackupFilePath,
};
