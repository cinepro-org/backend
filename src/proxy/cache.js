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
