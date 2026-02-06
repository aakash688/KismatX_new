/**
 * Barcode Generator Utility
 * Generate and verify secure barcodes for bet slips
 * 
 * @module utils/barcode
 */

import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Barcode secret from environment variable
const BARCODE_SECRET = process.env.BARCODE_SECRET;

if (!BARCODE_SECRET || BARCODE_SECRET.length < 32) {
    console.warn('⚠️  WARNING: BARCODE_SECRET not set or too short. Using default (NOT SECURE FOR PRODUCTION).');
}

// Default secret for development (should be replaced in production)
const DEFAULT_SECRET = 'kismatx-barcode-secret-key-change-in-production-2024';

const SECRET_KEY = BARCODE_SECRET || DEFAULT_SECRET;

/**
 * Generate secure barcode for bet slip
 * 
 * Compact 13-character printable format (Base36, uppercase)
 * - Deterministic: based on gameId + slip UUID prefix
 * - Secure: derived from HMAC-SHA256 with secret key
 * - Printable: only 0-9 and A-Z
 * 
 * @param {string} gameId - Game ID in format YYYYMMDDHHMM
 * @param {string} slipId - UUID of the bet slip
 * @returns {string} 13-character secure barcode
 */
export function generateSecureBarcode(gameId, slipId) {
    if (!gameId || typeof gameId !== 'string') {
        throw new Error('gameId must be a non-empty string');
    }
    
    if (!slipId || typeof slipId !== 'string') {
        throw new Error('slipId must be a non-empty string');
    }
    
    // Validate gameId format (12 digits)
    if (!/^\d{12}$/.test(gameId)) {
        throw new Error(`Invalid gameId format: ${gameId}. Expected 12 digits (YYYYMMDDHHMM)`);
    }
    
    // Extract first 8 characters from UUID
    const slipPrefix = slipId.substring(0, 8).toUpperCase();
    
    // Create data string for HMAC
    const dataString = `${gameId}_${slipPrefix}`;
    
    // Generate HMAC-SHA256 hash (as raw bytes)
    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(dataString);
    const digest = hmac.digest(); // Buffer
    
    // Take first 8 bytes (64 bits) and encode in Base36 → ~13 chars
    // Convert first 8 bytes to BigInt
    const first8Bytes = digest.subarray(0, 8);
    let value = 0n;
    for (const byte of first8Bytes) {
        value = (value << 8n) + BigInt(byte);
    }
    
    // Encode to Base36 uppercase
    const base36 = value.toString(36).toUpperCase();
    
    // Left-pad with zeros to ensure fixed 13 chars
    const barcode = base36.padStart(13, '0');
    
    return barcode;
}

/**
 * Verify barcode integrity
 * 
 * @param {string} gameId - Game ID used to generate barcode
 * @param {string} slipId - UUID of the bet slip
 * @param {string} barcode - Barcode to verify
 * @returns {boolean} True if barcode is valid, false otherwise
 */
export function verifyBarcode(gameId, slipId, barcode) {
    if (!gameId || !slipId || !barcode) {
        return false;
    }
    
    try {
        // Regenerate barcode and compare
        const expectedBarcode = generateSecureBarcode(gameId, slipId);
        return typeof barcode === 'string'
            && /^[0-9A-Z]{13}$/.test(barcode)
            && expectedBarcode === barcode;
        
    } catch (error) {
        console.error('Error verifying barcode:', error);
        return false;
    }
}

/**
 * Parse barcode and extract components
 * 
 * @param {string} barcode - Barcode string to parse
 * @returns {{ code: string }} Parsed barcode components (compact format)
 * @throws {Error} If barcode format is invalid
 */
export function parseBarcode(barcode) {
    if (!barcode || typeof barcode !== 'string') {
        throw new Error('Barcode must be a non-empty string');
    }
    
    // Expected compact format: 13 printable Base36 chars (0-9, A-Z)
    const barcodeRegex = /^[0-9A-Z]{13}$/;
    const isValid = barcodeRegex.test(barcode);
    if (!isValid) {
        throw new Error(`Invalid barcode format: ${barcode}. Expected 13 characters [0-9A-Z].`);
    }
    
    return {
        code: barcode
    };
}

