// VRF generation using Web Crypto API (matching browser implementation)
import { webcrypto } from 'crypto';

/**
 * Generate VRF token using the exact browser algorithm from embed.min.js
 *
 * Algorithm:
 * 1. Hash "secret_" + userId using SHA-256 to create encryption key
 * 2. Encrypt movieId using AES-CBC with zero IV (16 bytes of zeros)
 * 3. Base64 encode and make URL-safe (+ -> -, / -> _, remove =)
 */
async function generateVRF(movieId, userId) {
    try {
        const textEncoder = new TextEncoder();

        // Encode the plaintext (movieId)
        const plaintext = textEncoder.encode(movieId);

        // Hash "secret_" + userId to create the encryption key
        const keyMaterial = textEncoder.encode('secret_' + userId);
        const keyHash = await webcrypto.subtle.digest('SHA-256', keyMaterial);

        // Import the key for AES-CBC encryption
        const key = await webcrypto.subtle.importKey(
            'raw',
            keyHash,
            { name: 'AES-CBC' },
            false,
            ['encrypt']
        );

        // Use zero IV (16 bytes of zeros) - this is critical!
        const iv = new Uint8Array(16);

        // Encrypt using AES-CBC
        const encrypted = await webcrypto.subtle.encrypt(
            { name: 'AES-CBC', iv: iv },
            key,
            plaintext
        );

        // Convert to base64 and make URL-safe
        const encryptedArray = new Uint8Array(encrypted);
        const binaryString = String.fromCharCode(...encryptedArray);
        const base64 = Buffer.from(binaryString, 'binary').toString('base64');

        // Make URL-safe: + -> -, / -> _, remove trailing =
        const urlSafe = base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        return urlSafe;
    } catch (error) {
        console.error('VRF generation error:', error);
        throw error;
    }
}

// Export the VRF generation function
export { generateVRF };
