import { extract_savefiles } from './savefiles.js';

// From the Primewire test script
const testUrl = 'https://savefiles.com/e/39u03yhit650';
(async function () {
    try {
        const result = await extract_savefiles(testUrl);
    } catch (e) {
        console.error('Failed to extract from savefiles', e);
    }
})();
