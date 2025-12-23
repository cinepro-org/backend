/**
 * Enhanced Media Scraper API
 * Features:
 * - Per-provider timeouts
 * - Health tracking
 * - Source validation
 * - Smart error handling
 */

import { getTwoEmbed } from './controllers/providers/2Embed/2embed.js';
import { getAutoembed } from './controllers/providers/AutoEmbed/autoembed.js';
import { getVidSrcCC } from './controllers/providers/VidSrcCC/vidsrccc.js';
import { getVidSrc } from './controllers/providers/VidSrc/VidSrc.js';
import { getVidRock } from './controllers/providers/VidRock/Vidrock.js';
import { getMultiembed } from './controllers/providers/MultiEmbed/MultiEmbed.js';
import { getCinemaOS } from './controllers/providers/CinemaOS/CinemaOS.js';
import { getVidZee } from './controllers/providers/VidZee/VidZee.js';
import { getFmovies4u } from './controllers/providers/Fmovies4u/fmovies4u.js';
import { getVidstorm } from './controllers/providers/Vidstorm/vidstorm.js';
import { getWyzie } from './controllers/subs/wyzie.js';
import { getLibre } from './controllers/subs/libresubs.js';
import { ErrorObject } from './helpers/ErrorObject.js';
import { getCacheKey, getFromCache, setToCache } from './cache/cache.js';
import { withTimeout } from './utils/fetchHelper.js';
import {
    recordSuccess,
    recordFailure,
    isProviderHealthy,
    getProviderTimeout,
    getAllStats
} from './utils/providerHealth.js';
import { validateAndFilterFiles, quickValidate } from './utils/sourceValidator.js';

const shouldDebug = process.argv.includes('--debug');

// Provider configuration with default timeouts
const PROVIDER_CONFIG = {
    // Video providers (Tier 1 - most reliable)
    getFmovies4u: { fn: getFmovies4u, tier: 1, defaultTimeout: 30000 },
    getVidstorm: { fn: getVidstorm, tier: 1, defaultTimeout: 20000 },
    getTwoEmbed: { fn: getTwoEmbed, tier: 1, defaultTimeout: 20000 },
    getVidSrc: { fn: getVidSrc, tier: 1, defaultTimeout: 20000 },
    getVidRock: { fn: getVidRock, tier: 1, defaultTimeout: 15000 },

    // Video providers (Tier 2 - generally reliable)
    getAutoembed: { fn: getAutoembed, tier: 2, defaultTimeout: 20000 },
    getVidSrcCC: { fn: getVidSrcCC, tier: 2, defaultTimeout: 20000 },
    getMultiembed: { fn: getMultiembed, tier: 2, defaultTimeout: 20000 },

    // Video providers (Tier 3 - less reliable or slower)
    getCinemaOS: { fn: getCinemaOS, tier: 3, defaultTimeout: 25000 },
    getVidZee: { fn: getVidZee, tier: 3, defaultTimeout: 25000 },

    // Subtitle providers (always run)
    getWyzie: { fn: getWyzie, tier: 'subs', defaultTimeout: 10000 },
    getLibre: { fn: getLibre, tier: 'subs', defaultTimeout: 10000 }
};

/**
 * Run a provider with timeout and health tracking
 * @param {string} providerName - Name of the provider
 * @param {function} providerFn - Provider function to call
 * @param {object} media - Media object
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<object>} - Result with data and provider name
 */
async function runProvider(providerName, providerFn, media, timeoutMs) {
    const startTime = Date.now();

    try {
        // Check if provider is healthy before running
        if (!isProviderHealthy(providerName)) {
            if (shouldDebug) {
                console.log(`[PROVIDER] Skipping ${providerName} - marked as unhealthy`);
            }
            return { data: null, provider: providerName, skipped: true };
        }

        // Run with timeout
        const data = await withTimeout(
            providerFn(media),
            timeoutMs,
            providerName
        );

        const responseTime = Date.now() - startTime;

        // Check if we got valid data
        if (data && !(data instanceof Error || data instanceof ErrorObject)) {
            const filesCount = Array.isArray(data.files) ? data.files.length : (data.files ? 1 : 0);
            recordSuccess(providerName, responseTime, filesCount);

            if (shouldDebug) {
                console.log(`[PROVIDER] ${providerName} succeeded in ${responseTime}ms with ${filesCount} files`);
            }
        } else {
            recordFailure(providerName, data?.message || 'No valid data returned');
            if (shouldDebug) {
                console.log(`[PROVIDER] ${providerName} returned error/empty in ${responseTime}ms`);
            }
        }

        return { data, provider: providerName };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        recordFailure(providerName, error.message);

        if (shouldDebug) {
            console.error(`[PROVIDER] ${providerName} failed after ${responseTime}ms:`, error.message);
        }

        return { data: null, provider: providerName, error: error.message };
    }
}

/**
 * Main scrape function with all improvements
 * @param {object} media - Media object with tmdb, imdb, season, episode
 * @returns {Promise<object>} - Scraped files and subtitles
 */
export async function scrapeMedia(media) {
    const cacheKey = getCacheKey(media);

    // Check cache first
    if (!shouldDebug) {
        const cachedResult = getFromCache(cacheKey);
        if (cachedResult) {
            if (shouldDebug) {
                console.log(`[CACHE] Serving ${cacheKey} from cache`);
            }
            return cachedResult;
        }
    }

    if (shouldDebug) {
        console.log(`[SCRAPE] Starting scrape for ${cacheKey}`);
    }

    // Separate video providers from subtitle providers
    const videoProviders = Object.entries(PROVIDER_CONFIG)
        .filter(([_, config]) => config.tier !== 'subs');

    const subProviders = Object.entries(PROVIDER_CONFIG)
        .filter(([_, config]) => config.tier === 'subs');

    // Run all video providers in parallel with individual timeouts
    const videoPromises = videoProviders.map(([name, config]) => {
        const timeout = getProviderTimeout(name) || config.defaultTimeout;
        return runProvider(name, config.fn, media, timeout);
    });

    // Run subtitle providers in parallel
    const subPromises = subProviders.map(([name, config]) => {
        const timeout = config.defaultTimeout;
        return runProvider(name, config.fn, media, timeout);
    });

    // Wait for all providers
    const [videoResults, subResults] = await Promise.all([
        Promise.all(videoPromises),
        Promise.all(subPromises)
    ]);

    const allResults = [...videoResults, ...subResults];

    // Extract and deduplicate files
    // Keep sources from different providers even if same URL (different headers may work better)
    let files = allResults
        .filter(({ data }) => data && !(data instanceof Error || data instanceof ErrorObject))
        .flatMap(({ data }) => Array.isArray(data.files) ? data.files : (data.files ? [data.files] : []))
        .filter(quickValidate) // Quick validation first (no network)
        .filter((file, index, self) =>
            file && file.file &&
            // Keep source if: this is the first occurrence of this URL+source combo
            self.findIndex(f => f.file === file.file && f.source === file.source) === index
        );

    // Extract and deduplicate subtitles
    const subtitles = allResults
        .filter(({ data }) => data && !(data instanceof Error || data instanceof ErrorObject))
        .flatMap(({ data }) => data.subtitles || [])
        .filter((sub, index, self) =>
            sub && sub.url &&
            self.findIndex(s => s.url === sub.url) === index
        );

    // Skip validation entirely - return all unique sources
    // User prefers to debug which sources work rather than filter them out
    // Validation can be re-enabled by setting VALIDATE_SOURCES=true in .env
    const shouldValidateSources = process.env.VALIDATE_SOURCES === 'true';
    if (shouldValidateSources && files.length > 0) {
        if (shouldDebug) {
            console.log(`[VALIDATE] Validating ${files.length} sources...`);
        }

        const validatedFiles = await validateAndFilterFiles(files, true);

        if (shouldDebug) {
            console.log(`[VALIDATE] ${validatedFiles.length}/${files.length} sources passed validation`);
        }

        files = validatedFiles;
    } else if (shouldDebug) {
        console.log(`[SCRAPE] Skipping validation, returning all ${files.length} sources`);
    }

    // Build final result
    let finalResult;
    if (shouldDebug) {
        // In debug mode, include errors and provider info
        const errors = allResults
            .filter(({ data }) => data instanceof Error || data instanceof ErrorObject)
            .map(({ data, provider }) => ({ provider, error: data?.message || data?.toString() }));

        const providerStats = allResults.map(({ provider, skipped, error }) => ({
            provider,
            skipped: !!skipped,
            error: error || null
        }));

        finalResult = { files, subtitles, errors, providerStats };
    } else {
        finalResult = { files, subtitles };
    }

    // Cache if we found streams
    if (files.length > 0 && !shouldDebug) {
        setToCache(cacheKey, finalResult);
    }

    if (shouldDebug) {
        console.log(`[SCRAPE] Completed: ${files.length} files, ${subtitles.length} subtitles`);
    }

    return finalResult;
}

/**
 * Get provider health statistics
 * Exposed for the /provider-stats endpoint
 * @returns {object} - All provider stats
 */
export function getProviderStats() {
    return getAllStats();
}

export default { scrapeMedia, getProviderStats };
