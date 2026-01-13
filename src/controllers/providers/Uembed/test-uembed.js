import { getUembed } from './uembed.js';

// function to test the uembed
async function testUembed() {
    console.log('Testing UEmbed scraper...\n');

    // Test with the movie from the Python example
    const media = {
        tmdb: '565', // Deadpool & Wolverine
        type: 'movie'
    };

    try {
        console.log('Testing with:', media);
        const result = await getUembed(media);

        if (result.files) {
            console.log('\nSuccess! Found', result.files.length, 'sources');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.log('\nError:', result);
        }
    } catch (error) {
        console.error('\nError:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

testUembed();
