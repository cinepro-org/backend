import { getVidSrcCC } from './vidsrccc.js';

async function testVidSrc() {
    const media = {
        type: 'movie',
        tmdb: '664413',
        imdbId: 'tt10886166'
    };

    console.log('Testing VidSrc with media:', media);
    console.log('Result');

    try {
        const result = await getVidSrcCC(media);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testVidSrc();
