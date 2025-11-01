// link: https://luluvdoo.com/e/p9uu7dpsvli9, https://luluvdoo.com/e/p9uu7dpsvli9'

import { extract_lulustream } from './lulustream.js';

const testUrl = 'https://luluvdoo.com/e/p9uu7dpsvli9';

console.log('=== LuluStream Extractor Test ===\n');

console.log(`Testing URL: ${testUrl}`);
try {
    const result = await extract_lulustream(testUrl);

    if (result.file) {
        console.log('Success!');
        console.log('  File:', result.file);
        console.log('  Type:', result.type);
        console.log('  Headers:', JSON.stringify(result.headers, null, 2));
    } else {
        console.log('Failed!');
        console.log('  Error:', result.error);
        console.log('  Message:', result.message);
    }
} catch (e) {
    console.log('✗ Exception!');
    console.log('  Error:', e.message);
}
