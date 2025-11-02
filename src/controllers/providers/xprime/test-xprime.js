import { getXprime } from './xprime.js';

async function testXprimeMovie() {
    const media = {
        type: 'movie',
        tmdb: '664413',
        imdb: 'tt10886166',
        title: 'Monkey Man',
        year: '2024'
    };

    console.log('Testing Xprime Movie with media:', media);
    console.log('Result:');

    try {
        const result = await getXprime(media);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testXprimeMovie();
