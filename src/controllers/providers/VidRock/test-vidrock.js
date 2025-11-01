import { getVidRock } from './vidrock.js';

async function test() {
    // Example movie media object
    const movie = {
        type: 'movie',
        tmdb: 603692 // John Wick: Chapter 4
    };

    console.log('[Test] Fetching Vidrock links for movie:', movie.tmdb);

    const result = await getVidRock(movie);

    console.log('=== Vidrock Result ===');
    console.dir(result, { depth: null });
}

test().catch((err) => console.error('[Test] Uncaught error:', err));
