import { extract_filemoon } from './filemoon.js';
import { ErrorObject } from '../../helpers/ErrorObject.js';

// links:
// https://filemoon.sx/e/5wzoezxqa7yx
const testUrl = 'https://filemoon.sx/e/5wzoezxqa7yx';

console.log('=== FileMoon Extractor Test ===\n');

console.log(`Testing URL: ${testUrl}`);
try {
    const result = await extract_filemoon(testUrl);

    // Check if result is an ErrorObject
    if (result instanceof ErrorObject) {
        console.log('Failed!');
        console.log('  Error:', result.message);
        console.log('  Provider:', result.provider);
        console.log('  Response Code:', result.responseCode);
        console.log('  Hint:', result.hint);
        console.log('\nFull Error Object:');
        console.log(result.toString());
    } else if (result.file) {
        console.log('Success!');
        console.log('  File:', result.file);
        console.log('  Type:', result.type);
        console.log('  Headers:', JSON.stringify(result.headers, null, 2));
    } else {
        console.log('Unknown result format:');
        console.log(result);
    }
} catch (e) {
    console.log('Exception!');
    console.log('  Error:', e.message);
    console.log('  Stack:', e.stack);
}
