/**
 * Provider Health Tracking System
 * Tracks success/failure rates for each provider to enable smart prioritization
 */

// In-memory storage for provider stats
// In production, you might want to persist this to Redis or a database
const providerStats = new Map();

// Default timeout for providers (ms)
const DEFAULT_TIMEOUT = 20000;

// Minimum requests before we consider stats reliable
const MIN_REQUESTS_FOR_RELIABILITY = 5;

/**
 * Initialize or get stats for a provider
 * @param {string} providerName - Name of the provider
 * @returns {object} - Provider stats object
 */
function getOrCreateStats(providerName) {
    if (!providerStats.has(providerName)) {
        providerStats.set(providerName, {
            name: providerName,
            successCount: 0,
            failureCount: 0,
            totalRequests: 0,
            avgResponseTime: 0,
            lastSuccess: null,
            lastFailure: null,
            consecutiveFailures: 0,
            isDisabled: false
        });
    }
    return providerStats.get(providerName);
}

/**
 * Record a successful provider call
 * @param {string} providerName - Name of the provider
 * @param {number} responseTimeMs - How long the request took
 * @param {number} filesFound - Number of files found (optional)
 */
export function recordSuccess(providerName, responseTimeMs = 0, filesFound = 0) {
    const stats = getOrCreateStats(providerName);

    stats.successCount++;
    stats.totalRequests++;
    stats.lastSuccess = new Date().toISOString();
    stats.consecutiveFailures = 0;

    // Update rolling average response time
    stats.avgResponseTime = (
        (stats.avgResponseTime * (stats.totalRequests - 1) + responseTimeMs) /
        stats.totalRequests
    );

    // Re-enable if it was disabled and now succeeding
    if (stats.isDisabled && stats.consecutiveFailures === 0) {
        stats.isDisabled = false;
    }
}

/**
 * Record a failed provider call
 * @param {string} providerName - Name of the provider
 * @param {string} errorMessage - Error message (optional)
 */
export function recordFailure(providerName, errorMessage = '') {
    const stats = getOrCreateStats(providerName);

    stats.failureCount++;
    stats.totalRequests++;
    stats.lastFailure = new Date().toISOString();
    stats.consecutiveFailures++;

    // Auto-disable provider after 5 consecutive failures
    if (stats.consecutiveFailures >= 5) {
        stats.isDisabled = true;
    }
}

/**
 * Get success rate for a provider (0-100)
 * @param {string} providerName - Name of the provider
 * @returns {number} - Success rate percentage
 */
export function getSuccessRate(providerName) {
    const stats = getOrCreateStats(providerName);
    if (stats.totalRequests === 0) return 100; // Assume new providers are good
    return Math.round((stats.successCount / stats.totalRequests) * 100);
}

/**
 * Check if a provider is currently healthy enough to use
 * @param {string} providerName - Name of the provider
 * @returns {boolean} - Whether provider should be used
 */
export function isProviderHealthy(providerName) {
    const stats = getOrCreateStats(providerName);

    // Disabled providers are not healthy
    if (stats.isDisabled) return false;

    // Not enough data, assume healthy
    if (stats.totalRequests < MIN_REQUESTS_FOR_RELIABILITY) return true;

    // If success rate is below 20%, consider unhealthy
    return getSuccessRate(providerName) >= 20;
}

/**
 * Get recommended timeout for a provider based on history
 * Slower providers get longer timeouts, faster ones get shorter
 * @param {string} providerName - Name of the provider
 * @returns {number} - Recommended timeout in ms
 */
export function getProviderTimeout(providerName) {
    const stats = getOrCreateStats(providerName);

    if (stats.totalRequests < MIN_REQUESTS_FOR_RELIABILITY) {
        return DEFAULT_TIMEOUT;
    }

    // Give 2x the average response time, with min/max bounds
    const recommendedTimeout = Math.max(
        5000,  // Minimum 5 seconds
        Math.min(
            30000, // Maximum 30 seconds
            stats.avgResponseTime * 2
        )
    );

    return Math.round(recommendedTimeout);
}

/**
 * Get all provider stats for monitoring
 * @returns {object} - All provider stats
 */
export function getAllStats() {
    const result = {};
    for (const [name, stats] of providerStats) {
        result[name] = {
            ...stats,
            successRate: getSuccessRate(name),
            isHealthy: isProviderHealthy(name),
            recommendedTimeout: getProviderTimeout(name)
        };
    }
    return result;
}

/**
 * Reset stats for a specific provider (useful for testing)
 * @param {string} providerName - Name of the provider
 */
export function resetProviderStats(providerName) {
    providerStats.delete(providerName);
}

/**
 * Reset all provider stats
 */
export function resetAllStats() {
    providerStats.clear();
}

/**
 * Get providers sorted by reliability (most reliable first)
 * @param {string[]} providerNames - List of provider names
 * @returns {string[]} - Sorted provider names
 */
export function sortByReliability(providerNames) {
    return [...providerNames].sort((a, b) => {
        const rateA = getSuccessRate(a);
        const rateB = getSuccessRate(b);
        return rateB - rateA; // Higher success rate first
    });
}
