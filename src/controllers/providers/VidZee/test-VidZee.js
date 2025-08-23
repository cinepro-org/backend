// Don't remove this test script @An0n-00 remove this when merging to main
import { getVidZee } from './VidZee.js';

async function test() {
    const media = {
        type: 'movie',
        tmdb: 550
    };

    try {
        const result = await getVidZee(media);
        console.log('=== VidZee Result ===');
        console.dir(result, { depth: null });
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
