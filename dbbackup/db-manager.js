import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getDbConfig, getBackupFilename } from './config.js';
import mysql from 'mysql2/promise';

const execAsync = promisify(exec);

/**
 * Create database dump using mysql2 directly (bypasses CLI auth plugin issues)
 */
export const createDatabaseDump = async (outputPath) => {
  try {
    const config = getDbConfig();
    
    const dumpFilename = getBackupFilename();
    const fullPath = path.join(outputPath, dumpFilename);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    console.log(`⏳ Creating database dump for: ${config.database}...`);
    
    // Create connection
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password || '',
      database: config.database,
    });
    
    // Get all tables
    const [tables] = await connection.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`, [config.database]);
    
    // Create SQL dump header
    let sqlDump = `-- MySQL dump 10.13\n`;
    sqlDump += `-- Database: ${config.database}\n`;
    sqlDump += `-- Created: ${new Date().toISOString()}\n\n`;
    sqlDump += `SET FOREIGN_KEY_CHECKS=0;\n\n`;
    
    // Export each table
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      
      // Get CREATE TABLE statement
      const [createTableResult] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
      sqlDump += `\n${createTableResult[0]['Create Table']};\n\n`;
      
      // Get table data
      const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
      
      if (rows.length > 0) {
        // Get column names
        const columns = Object.keys(rows[0]);
        const columnStr = columns.map(col => `\`${col}\``).join(', ');
        
        // Insert statements
        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'number') return val.toString();
            return `'${connection.escape(val).slice(1, -1)}'`;
          }).join(', ');
          
          sqlDump += `INSERT INTO \`${tableName}\` (${columnStr}) VALUES (${values});\n`;
        }
        sqlDump += `\n`;
      }
    }
    
    sqlDump += `SET FOREIGN_KEY_CHECKS=1;\n`;
    
    // Write to file
    fs.writeFileSync(fullPath, sqlDump);
    
    await connection.end();
    
    const fileSize = fs.statSync(fullPath).size / (1024 * 1024);
    
    console.log(`✅ Database dump created successfully!`);
    console.log(`📁 File: ${dumpFilename}`);
    console.log(`📊 Size: ${fileSize.toFixed(2)} MB`);
    
    return {
      success: true,
      filename: dumpFilename,
      path: fullPath,
      size: fileSize,
    };
    
  } catch (error) {
    console.error('❌ Database dump error:', error.message);
    throw error;
  }
};

/**
 * Restore database from dump file
 */
export const restoreDatabaseFromDump = async (dumpFilePath) => {
  try {
    const config = getDbConfig();
    
    if (!fs.existsSync(dumpFilePath)) {
      throw new Error(`Dump file not found: ${dumpFilePath}`);
    }
    
    console.log(`⏳ Restoring database from dump...`);
    
    // Read the dump file
    const sqlContent = fs.readFileSync(dumpFilePath, 'utf8');
    
    // Create connection
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password || '',
      multipleStatements: true,
    });
    
    // Execute the dump
    await connection.query(sqlContent);
    
    await connection.end();
    
    console.log(`✅ Database restored successfully!`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Database restore error:', error.message);
    throw error;
  }
};

/**
 * Verify database connection
 */
export const verifyDatabaseConnection = async () => {
  try {
    const config = getDbConfig();
    
    console.log(`🔍 Verifying database connection...`);
    
    // Create connection
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password || '',
      database: config.database,
    });
    
    // Test connection
    await connection.ping();
    await connection.end();
    
    console.log(`✅ Database connection verified!`);
    console.log(`📍 Host: ${config.host}:${config.port}`);
    console.log(`👤 User: ${config.user}`);
    console.log(`🗄️  Database: ${config.database}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    throw error;
  }
};

export default {
  createDatabaseDump,
  restoreDatabaseFromDump,
  verifyDatabaseConnection,
};
