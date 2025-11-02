import { getAutoembed } from './AutoEmbed.js';

async function testAutoEmbed() {
    // Test with a movie
    const movieMedia = {
        tmdb: '578',
        type: 'movie'
    };

    console.log('Testing AutoEmbed with movie:', movieMedia);

    try {
        const movieResult = await getAutoembed(movieMedia);
        console.log('Movie Result:');
        console.log(JSON.stringify(movieResult, null, 2));
    } catch (error) {
        console.error('Movie Error:', error);
    }
}

testAutoEmbed();
