import { getFebbox } from './febbox.js';

async function test() {
    const media = {
        type: 'movie',
        imdb: 'tt0468569'
    };

    try {
        const result = await getFebbox(media);
        console.log('=== Febbox Result ===');
        console.dir(result, { depth: null });
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
