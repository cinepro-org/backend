// link : https://vidmoly.me/embed-h82feomwyh9n.html
import { extract_vidmoly } from './vidmoly.js';

const testUrl = 'https://vidmoly.me/embed-h82feomwyh9n.html';

console.log('=== VidMoly Extractor Test ===\n');

console.log(`Testing URL: ${testUrl}`);
try {
    const result = await extract_vidmoly(testUrl);

    if (result.file) {
        console.log('Success!');
        console.log('  File:', result.file);
        console.log('  Type:', result.type);
        console.log('  Headers:', JSON.stringify(result.headers, null, 2));
    } else {
        console.log(' Failed!');
        console.log('  Error:', result.error);
        console.log('  Message:', result.message);
    }
} catch (e) {
    console.log(' Exception!');
    console.log('  Error:', e.message);
}
