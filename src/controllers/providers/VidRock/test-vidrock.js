import { getVidRock } from './Vidrock.js';

async function test() {
    console.log('Testing VidRock scraper...\n');

    // Test with the movie from the Python example
    const media = {
        tmdb: '533535', // Deadpool & Wolverine
        type: 'movie',
        title: 'Deadpool & Wolverine',
        releaseYear: 2024
    };

    try {
        console.log('Testing with:', media);
        const result = await getVidRock(media);

        if (result.files) {
            console.log('\n✅ Success! Found', result.files.length, 'sources');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.log('\n❌ Error:', result);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

test();
