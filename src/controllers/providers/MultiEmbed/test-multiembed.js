import { getMultiembed } from './MultiEmbed.js';

async function runTest() {
    try {
        // war of the worlds imdb
        const imdbId = 'tt13186306';

        console.log('Testing Multiembed with imdbId:', imdbId);

        const result = await getMultiembed({ imdb: imdbId });

        console.log('Multiembed extractor result:');
        console.dir(result, { depth: null });
    } catch (err) {
        console.error('Test failed:', err.message);
        console.error(err);
    }
}

runTest();
