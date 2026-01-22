// test-vidsrc-cc.js
// Temporary test script to verify VidSrcCC integration
// Do not remove unless confirmed working and merged

import { getVidSrcCC } from './vidsrccc.js';

async function test() {
    const media = {
        type: 'movie', // change to 'tv' to test TV flow
        tmdb: 755898,
        imdbId: 'tt15354916' // optional but recommended
        // season: 1,
        // episode: 1
    };

    try {
        const result = await getVidSrcCC(media);
        console.log('=== VidSrcCC Result ===');
        console.dir(result, { depth: null });
    } catch (err) {
        console.error('VidSrcCC test failed:', err);
    }
}

test();
