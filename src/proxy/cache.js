setInterval(cleanupCache, 30 * 60 * 1000); // every 30 minutes

// Add cache system similar to pstream
const CACHE_MAX_SIZE = 2000;
const CACHE_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
const segmentCache = new Map();

// Check if caching is disabled
const isCacheDisabled = () => process.env.DISABLE_CACHE === 'true';

export function cleanupCache() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [url, entry] of segmentCache.entries()) {
        if (now - entry.timestamp > CACHE_EXPIRY_MS) {
            segmentCache.delete(url);
            expiredCount++;
        }
    }

    // Remove oldest entries if cache is too big
    if (segmentCache.size > CACHE_MAX_SIZE) {
        const entries = Array.from(segmentCache.entries()).sort(
            (a, b) => a[1].timestamp - b[1].timestamp
        );

        const toRemove = entries.slice(0, segmentCache.size - CACHE_MAX_SIZE);
        for (const [url] of toRemove) {
            segmentCache.delete(url);
        }
    }

    return segmentCache.size;
}

// segment-specific caching for ts/video files
// this is separate from api response caching
const SEGMENT_CACHE_MAX_SIZE = 500; // max 500 segments in memory
const SEGMENT_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * get cached segment data
 *
 * @param {string} url - segment url
 * @returns {Buffer|null} cached segment buffer or null
 */
export function getCachedSegment(url) {
    const cached = segmentCache.get(url);
    if (!cached) return null;

    // check if expired
    if (Date.now() - cached.timestamp > SEGMENT_CACHE_EXPIRY_MS) {
        segmentCache.delete(url);
        return null;
    }

    // update access time for lru
    cached.lastAccess = Date.now();
    return cached.data;
}

/**
 * cache segment data
 *
 * @param {string} url - segment url
 * @param {Buffer} data - segment buffer data
 */
export function cacheSegment(url, data) {
    // don't cache if cache is disabled
    if (isCacheDisabled()) return;

    // enforce size limit with lru eviction
    if (segmentCache.size >= SEGMENT_CACHE_MAX_SIZE) {
        // find oldest accessed entry
        let oldest = null;
        let oldestTime = Date.now();

        for (const [key, value] of segmentCache.entries()) {
            if (value.lastAccess < oldestTime) {
                oldestTime = value.lastAccess;
                oldest = key;
            }
        }

        if (oldest) {
            segmentCache.delete(oldest);
        }
    }

    // store segment with metadata
    segmentCache.set(url, {
        data: data,
        timestamp: Date.now(),
        lastAccess: Date.now(),
        size: data.length
    });
}

/**
 * get cache statistics including segment cache
 *
 * @returns {object} cache statistics
 */
export function getExtendedCacheStats() {
    const baseStats = getCacheStats();

    // calculate segment cache size in mb
    let totalSegmentSize = 0;
    for (const [, value] of segmentCache.entries()) {
        totalSegmentSize += value.size;
    }

    return {
        ...baseStats,
        segmentCache: {
            entries: segmentCache.size,
            maxEntries: SEGMENT_CACHE_MAX_SIZE,
            totalSizeMB: (totalSegmentSize / (1024 * 1024)).toFixed(2),
            expiryMinutes: SEGMENT_CACHE_EXPIRY_MS / (60 * 1000)
        }
    };
}

// export segment cache functions
export { segmentCache, SEGMENT_CACHE_MAX_SIZE, SEGMENT_CACHE_EXPIRY_MS };
