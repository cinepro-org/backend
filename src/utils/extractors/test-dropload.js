import { extract_dropload } from './dropload.js';

const testUrl = 'https://dropload.io/e/bo3c5cjycbbv';

(async () => {
    try {
        const result = await extract_dropload(testUrl);
        console.log('Extracted Result:', result);
    } catch (e) {
        console.log('Extracted Error:', e);
    }
})();
