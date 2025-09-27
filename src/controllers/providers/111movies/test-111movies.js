// test-111movies.js
import { get111Movies } from './111movies.js';

async function test() {
    const movie = {
        imdb: 'tt0137523'
    };

    console.log('[Test] Fetching 111Movies links for TMDB:', movie.imdb);

    const result = await get111Movies(movie);

    console.log('=== 111Movies Result ===');
    console.dir(result, { depth: null });
}

test().catch((err) => console.error('[Test] Uncaught error:', err));
