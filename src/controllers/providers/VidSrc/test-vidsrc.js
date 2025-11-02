import { getVidSrc } from './VidSrc.js';

async function testVidSrc() {
    const media = {
        imdb: 'tt10886166'
    };

    console.log('Testing VidSrc with media:', media);
    console.log('Result:');

    try {
        const result = await getVidSrc(media);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testVidSrc();
