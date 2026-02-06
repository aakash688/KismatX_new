/**
 * Barcode Generator Utility for Cloudflare Workers
 * Generate and verify secure barcodes for bet slips
 * 
 * @module utils/barcode
 */

/**
 * Generate secure barcode for bet slip
 * 
 * Compact 13-character printable format (Base36, uppercase)
 * - Deterministic: based on gameId + slip UUID prefix
 * - Secure: derived from crypto digest with secret key
 * - Printable: only 0-9 and A-Z
 * 
 * @param {string} gameId - Game ID in format YYYYMMDDHHMM
 * @param {string} slipId - UUID of the bet slip
 * @param {string} secret - Secret key from environment
 * @returns {Promise<string>} 13-character secure barcode
 */
export async function generateSecureBarcode(gameId, slipId, secret = 'kismatx-default-secret') {
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
  
  // Generate HMAC-SHA256 hash using Web Crypto API
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(dataString);
  
  // Import the key
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Generate HMAC
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // Convert ArrayBuffer to Uint8Array
  const digest = new Uint8Array(signature);
  
  // Take first 8 bytes (64 bits) and encode in Base36
  const first8Bytes = digest.slice(0, 8);
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
 * @param {string} secret - Secret key from environment
 * @returns {Promise<boolean>} True if barcode is valid, false otherwise
 */
export async function verifyBarcode(gameId, slipId, barcode, secret) {
  if (!gameId || !slipId || !barcode) {
    return false;
  }
  
  try {
    // Regenerate barcode and compare
    const expectedBarcode = await generateSecureBarcode(gameId, slipId, secret);
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
