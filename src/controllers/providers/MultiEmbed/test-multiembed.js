import { getMultiembed } from './MultiEmbed.js';

async function runTest() {
    try {
        // DeadPool and Wolverine imdb
        const imdbId = 'tt0298130';

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
