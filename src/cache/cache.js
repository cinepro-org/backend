import NodeCache from 'node-cache';

// Here comes the big boy to loook for nothing okay here you go if you do something you better do it right
// Setting up cache for 3 hours because lowkey's attention span is short
const cache = new NodeCache({ stdTTL: 10800, checkperiod: 600 });

export function getCacheKey(media) {
    // TV shows need season and episode info, movies just need the basic ID
    if (media.type === 'tv') {
        return `${media.type}_${media.tmdb}_${media.season}_${media.episode}`;
    }
    return `${media.type}_${media.tmdb}`;
}

export function getFromCache(key) {
    // Simple wrapper to grab stuff from cache
    return cache.get(key);
}

export function setToCache(key, data) {
    // Store the scraped data so we don't have to fetch it again
    return cache.set(key, data);
}

export function getCacheStats() {
    // Useful for debugging and seeing how well our cache is performing
    return cache.getStats();
}
