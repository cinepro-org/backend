/**
 * attempts to extract cloudflare challenge parameters from embed page
 * note: this is a basic implementation and may need updates if cf changes
 */

const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[cf-bypass]', ...args);

/**
 * extracts potential cloudflare tokens from html response
 * @param {string} html - the embed page html
 * @returns {object} extracted tokens or empty object
 */
export function extractCFTokens(html) {
    const tokens = {};

    // look for the window variable assignment pattern
    const windowVarMatch = html.match(/window\['([^']+)'\]\s*=\s*'([^']+)'/);
    if (windowVarMatch) {
        tokens.cfKey = windowVarMatch[1];
        tokens.cfValue = windowVarMatch[2];
        dbg('found cf tokens:', {
            key: tokens.cfKey,
            valueLength: tokens.cfValue?.length
        });
    }

    return tokens;
}

/**
 * attempts to decode/decrypt cf token if possible
 * warning: this is highly dependent on cf's current implementation
 * @param {string} encrypted - the encrypted token value
 * @returns {string} decrypted value or original if decryption fails
 */
export function decodeCFToken(encrypted) {
    try {
        // attempt basic base64 decode
        const decoded = Buffer.from(encrypted, 'base64').toString('utf-8');
        dbg('cf token decoded (might be invalid):', decoded.substring(0, 50));
        return decoded;
    } catch (err) {
        dbg('cf token decode failed:', err.message);
        return encrypted;
    }
}
