import { getCinemaOS } from './CinemaOS.js';

async function testCinemaOS() {
    console.log('=== Testing CinemaOS Provider ===\n');

    // Test with movie
    const movieMedia = {
        tmdb: '565'
    };

    console.log('Testing with movie TMDB ID:', movieMedia.tmdb);

    try {
        const result = await getCinemaOS(movieMedia);

        if (result.message) {
            console.log('\nError:', result.message);
            console.log('Hint:', result.hint);
        } else {
            console.log('\nSuccess! Found', result.files, 'sources');
            console.log('\nSources:');
            result.files.forEach((file, index) => {
                console.log(`\n[${index + 1}] ${file.file}`);
                console.log(`    Type: ${file.type}`);
                console.log(`    Language: ${file.lang}`);
            });
        }
    } catch (error) {
        console.error('\nUnexpected error:', error.message);
        console.error(error.stack);
    }
}

testCinemaOS();
