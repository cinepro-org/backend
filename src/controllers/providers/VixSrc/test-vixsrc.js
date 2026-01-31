import { getVixSrc } from './VixSrc.js';

async function testVixSrc() {
    // Test with a movie
    const movieMedia = {
        tmdb: '155',
        type: 'movie'
    };

    console.log('Testing VixSrc with movie:', movieMedia);
    try {
        const movieResult = await getVixSrc(movieMedia);
        console.log('Movie Result:');
        console.log(JSON.stringify(movieResult, null, 2));
    } catch (error) {
        console.error('Movie Error:', error);
    }
}

testVixSrc();
