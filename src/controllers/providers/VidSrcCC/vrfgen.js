// simple in-memory cache for vrf tokens
// stores: { cacheKey: { token: string, expiry: timestamp } }
const vrfCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[vrfgen]', ...args);

/**
 * generates vrf token using external api endpoint
 * implements simple cache with expiry to reduce api calls
 * @param {string} movieId - tmdb id of the media
 * @param {string} userId - extracted user id from embed page
 * @returns {Promise<string>} url-safe vrf token
 */
async function generateVRF(movieId, userId) {
    // create cache key from movieId and userId
    const cacheKey = `${movieId}_${userId}`;

    // check cache first
    const cached = vrfCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        dbg('cache hit for', cacheKey);
        return cached.token;
    }

    dbg('cache miss, fetching vrf for', cacheKey);

    try {
        // the working code uses this format: reversed string + '_' + userId
        // 'BxRJ3LYEj2' reversed becomes 'j2EYL3JRxB'
        const formattedUserId =
            'BxRJ3LYEj2'.split('').reverse().join('') + '_' + userId;

        const vrfApiUrl = `https://aquariumtv.app/vidsrccc?id=${movieId}&user_id=${formattedUserId}`;

        dbg('fetching from', vrfApiUrl);

        const response = await fetch(vrfApiUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`vrf api returned ${response.status}`);
        }

        const vrfToken = await response.text();

        if (!vrfToken || vrfToken.trim() === '') {
            throw new Error('empty vrf token received');
        }

        dbg('vrf token obtained, length:', vrfToken.length);

        // cache the token with expiry
        vrfCache.set(cacheKey, {
            token: vrfToken,
            expiry: Date.now() + CACHE_TTL
        });

        // clean up expired entries periodically
        if (vrfCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of vrfCache.entries()) {
                if (now >= value.expiry) {
                    vrfCache.delete(key);
                    dbg('removed expired cache entry', key);
                }
            }
        }

        return vrfToken;
    } catch (error) {
        dbg('vrf generation failed:', error.message);
        throw error;
    }
}

export { generateVRF };
