/**
 * Settings Cache Utility
 * Retrieve settings from database with in-memory caching
 * 
 * @module utils/settings
 */

import { AppDataSource } from '../config/typeorm.config.js';

const SettingsEntity = "Settings";

// Cache configuration
const CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

// In-memory cache
const settingsCache = new Map();

/**
 * Get setting value with caching
 * 
 * @param {string} key - Setting key (e.g., 'game_multiplier', 'maximum_limit')
 * @param {string} defaultValue - Default value if setting not found
 * @returns {Promise<string>} Setting value
 */
export async function getSetting(key, defaultValue = null) {
    if (!key || typeof key !== 'string') {
        throw new Error('Setting key must be a non-empty string');
    }
    
    // Check cache first
    const cacheEntry = settingsCache.get(key);
    const now = Date.now();
    
    if (cacheEntry && (now - cacheEntry.timestamp) < CACHE_TTL) {
        // Cache hit
        return cacheEntry.value;
    }
    
    // Cache miss or expired - fetch from database
    try {
        const settingsRepo = AppDataSource.getRepository(SettingsEntity);
        const setting = await settingsRepo.findOne({ where: { key } });
        
        const value = setting ? setting.value : defaultValue;
        
        // Update cache
        settingsCache.set(key, {
            value,
            timestamp: now
        });
        
        return value;
        
    } catch (error) {
        console.error(`Error fetching setting "${key}":`, error);
        
        // Return cached value even if expired, or default
        if (cacheEntry) {
            return cacheEntry.value;
        }
        
        return defaultValue;
    }
}

/**
 * Clear settings cache
 * Call this after updating settings to force fresh fetch
 */
export function clearSettingsCache() {
    settingsCache.clear();
    console.log('Settings cache cleared');
}

/**
 * Get all settings as an object
 * 
 * @returns {Promise<Record<string, string>>} Object with all settings (key-value pairs)
 */
export async function getAllSettings() {
    try {
        const settingsRepo = AppDataSource.getRepository(SettingsEntity);
        const allSettings = await settingsRepo.find({
            order: { key: 'ASC' }
        });
        
        const settingsObject = {};
        allSettings.forEach(setting => {
            settingsObject[setting.key] = setting.value;
        });
        
        return settingsObject;
        
    } catch (error) {
        console.error('Error fetching all settings:', error);
        throw error;
    }
}

/**
 * Get setting as a number
 * 
 * @param {string} key - Setting key
 * @param {number} defaultValue - Default numeric value
 * @returns {Promise<number>} Setting value as number
 */
export async function getSettingAsNumber(key, defaultValue = 0) {
    const value = await getSetting(key);
    if (value === null || value === undefined) {
        return defaultValue;
    }
    
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
}

/**
 * Get setting as a boolean
 * 
 * @param {string} key - Setting key
 * @param {boolean} defaultValue - Default boolean value
 * @returns {Promise<boolean>} Setting value as boolean
 */
export async function getSettingAsBoolean(key, defaultValue = false) {
    const value = await getSetting(key);
    if (value === null || value === undefined) {
        return defaultValue;
    }
    
    const lowerValue = value.toLowerCase().trim();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
}








