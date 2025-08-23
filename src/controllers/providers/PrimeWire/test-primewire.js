import { getPrimewire } from './primewire.js';

async function test() {
    const movie = {
        type: 'movie',
        imdb: 'tt3896198'
    };

    console.log('[Test] Fetching Primewire links for movie:', movie.imdb);

    const result = await getPrimewire(movie);

    console.log('=== Primewire Result ===');
    console.dir(result, { depth: null });
}

test().catch((err) => console.error('[Test] Uncaught error:', err));
