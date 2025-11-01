import { getPrimewire } from './primewire.js';

async function test() {
    const movie = {
        type: 'movie',
        imdb: 'tt0137523' // life of pi (a must watch movie folks)
    };

    console.log('[Test] Fetching Primewire links for movie:', movie.imdb);

    const result = await getPrimewire(movie);

    console.log('=== Primewire Result ===');
    console.dir(result, { depth: null });
}

test().catch((err) => console.error('[Test] Uncaught error:', err));
