// test-vidwtf.js (wanted to test if it worked coz @Inside4ndroid commented the vidsrcwtf in api so...
// Don't remove this test script @An0n-00 remove this when merging to main
import { getVidsrcWtf } from './VidSrcwtf.js';

async function test() {
    const media = {
        type: 'movie',
        tmdb: 755898
    };

    try {
        const result = await getVidsrcWtf(media);
        console.log('=== VidSrcWtf Result ===');
        console.dir(result, { depth: null });
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
