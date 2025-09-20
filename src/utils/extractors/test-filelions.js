import { extract_filelions } from './filelions.js';

// Test url got from the primwire test script
const testUrl = 'https://filelions.to/v/zt7ie6a5cbq7';

(async () => {
    try {
        const result = await extract_filelions(testUrl);
        console.log('Extracted Result:', result);
    } catch (e) {
        console.log('Extracted Error:', e);
    }
})();
