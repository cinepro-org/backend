// Credit where it's due: https://github.com/Dungeon69/vidsrc_wasm
import { webcrypto } from 'crypto';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let wasm;
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

class StoragePolyfill {
    constructor() {
        this.storage = new Map();
    }

    get length() {
        return this.storage.size;
    }

    setItem(key, value) {
        if (typeof key !== 'string' || typeof value !== 'string') {
            throw new TypeError(
                'StoragePolyfill: key and value must be strings'
            );
        }
        this.storage.set(key, value);
        return true;
    }

    getItem(key) {
        return this.storage.get(key) || null;
    }

    removeItem(key) {
        this.storage.delete(key);
    }

    clear() {
        this.storage.clear();
    }
}

const fakeWindow = {
    WebAssembly,
    localStorage: new StoragePolyfill(),
    sessionStorage: new StoragePolyfill(),
    navigator: {
        webdriver: false,
        userAgent: userAgent
    },
    document: { cookie: '' },
    location: {
        href: '',
        origin: ''
    },
    crypto: webcrypto,
    msCrypto: webcrypto,
    performance: { timeOrigin: Date.now() },
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder
};

function addToExternrefTable0(value) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_2.set(idx, value);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

const cachedTextEncoder = new TextEncoder();
const cachedTextDecoder = new TextDecoder('utf-8', {
    ignoreBOM: true,
    fatal: true
});

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

function passStringToWasm0(arg, malloc, realloc) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8Memory0()
        .subarray(ptr, ptr + buf.length)
        .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
}

function getImports() {
    const imports = {
        wbg: {
            __wbg_setLocalStorage_edfb7a1bd99ea948: function (
                keyPtr,
                keyLen,
                valuePtr,
                valueLen
            ) {
                const key = getStringFromWasm0(keyPtr, keyLen);
                const value = getStringFromWasm0(valuePtr, valueLen);
                fakeWindow.localStorage.setItem(key, value);
            },
            __wbg_buffer_61b7ce01341d7f88: function (arg0) {
                return arg0.buffer;
            },
            __wbg_call_500db948e69c7330: function () {
                return handleError(function (arg0, arg1, arg2) {
                    return arg0.call(arg1, arg2);
                }, arguments);
            },
            __wbg_call_b0d8e36992d9900d: function () {
                return handleError(function (arg0, arg1) {
                    return arg0.call(arg1);
                }, arguments);
            },
            __wbg_crypto_ed58b8e10a292839: function (arg0) {
                return fakeWindow.crypto;
            },
            __wbg_getRandomValues_bcb4912f16000dc4: function () {
                return handleError(function (arg0, arg1) {
                    arg0.getRandomValues(arg1);
                }, arguments);
            },
            __wbg_msCrypto_0a36e2ec3a343d26: function (arg0) {
                return fakeWindow.msCrypto;
            },
            __wbg_new_3ff5b33b1ce712df: function (arg0) {
                return new Uint8Array(arg0);
            },
            __wbg_newnoargs_fd9e4bf8be2bc16d: function (arg0, arg1) {
                return new Function(getStringFromWasm0(arg0, arg1));
            },
            __wbg_newwithbyteoffsetandlength_ba35896968751d91: function (
                arg0,
                arg1,
                arg2
            ) {
                return new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
            },
            __wbg_newwithlength_34ce8f1051e74449: function (arg0) {
                return new Uint8Array(arg0 >>> 0);
            },
            __wbg_node_02999533c4ea02e3: function (arg0) {
                return arg0.node;
            },
            __wbg_process_5c1d670bc53614b8: function (arg0) {
                return arg0.process;
            },
            __wbg_randomFillSync_ab2cfe79ebbf2740: function () {
                return handleError(function (arg0, arg1) {
                    arg0.randomFillSync(arg1);
                }, arguments);
            },
            __wbg_require_79b1e9274cde3c87: function () {
                return handleError(function () {
                    return module.require;
                }, arguments);
            },
            __wbg_setSessionStorage_22507adda175c3d2: function (
                keyPtr,
                keyLen,
                valuePtr,
                valueLen
            ) {
                const key = getStringFromWasm0(keyPtr, keyLen);
                const value = getStringFromWasm0(valuePtr, valueLen);
                return fakeWindow.sessionStorage.setItem(key, value);
            },
            __wbg_set_23d69db4e5c66a6e: function (arg0, arg1, arg2) {
                arg0.set(arg1, arg2 >>> 0);
            },
            __wbg_subarray_46adeb9b86949d12: function (arg0, arg1, arg2) {
                return arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            },
            __wbg_versions_c71aa1626a93e0a1: function (arg0) {
                return arg0.versions;
            },
            __wbindgen_is_function: function (arg0) {
                return typeof arg0 === 'function';
            },
            __wbindgen_is_object: function (arg0) {
                const val = arg0;
                return typeof val === 'object' && val !== null;
            },
            __wbindgen_is_string: function (arg0) {
                return typeof arg0 === 'string';
            },
            __wbindgen_is_undefined: function (arg0) {
                return arg0 === undefined;
            },
            __wbindgen_memory: function () {
                return wasm.memory;
            },
            __wbindgen_string_new: function (arg0, arg1) {
                return getStringFromWasm0(arg0, arg1);
            },
            __wbindgen_throw: function (arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_static_accessor_WINDOW_ae1c80c7eea8d64a: function () {
                return addToExternrefTable0(fakeWindow);
            },
            __wbg_static_accessor_GLOBAL_0be7472e492ad3e3: function () {
                return addToExternrefTable0(global);
            },
            __wbg_static_accessor_GLOBAL_THIS_1a6eb482d12c9bfb: function () {
                return addToExternrefTable0(globalThis);
            },
            __wbg_static_accessor_SELF_1dc398a895c82351: function () {
                return addToExternrefTable0(globalThis);
            },
            __wbindgen_init_externref_table: function () {
                const table = wasm.__wbindgen_export_2;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
            __wbindgen_externref_table_grow: function (delta) {
                const table = wasm.__wbindgen_export_2;
                const old = table.length;
                const newLen = old + delta;
                table.grow(delta);
                return old;
            },

            __wbindgen_externref_table_set_null: function (idx) {
                const table = wasm.__wbindgen_export_2;
                table.set(idx, null);
            }
        }
    };
    return imports;
}

async function initWasm(wasmModule) {
    const imports = getImports();

    if (!(wasmModule instanceof WebAssembly.Module)) {
        wasmModule = new WebAssembly.Module(wasmModule);
    }

    const instance = new WebAssembly.Instance(wasmModule, imports);
    wasm = instance.exports;

    cachedUint8Memory0 = null;
    if (typeof wasm.__wbindgen_start === 'function') {
        wasm.__wbindgen_start();
    }

    return wasm;
}

function encrypted(id) {
    const t = passStringToWasm0(
        id,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc
    );
    wasm.encrypted(t, WASM_VECTOR_LEN);
}

/**
 * Generates vrf token from the wasm module.
 * I'm not sure about the vrf token expiration time. It can be cached.
 * @param {string} movieId
 * @returns {Promise<string>}
 */

// we should probably try to pass the userID from the vidsrc.cc page

export async function generateVRF(movieId) {
    const encoder = new TextEncoder();
    // we should probably try to pass the userID from the vidsrc.cc page
    const keyData = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode('Bh0IPAQjGH0FIwB5Bxp9MAQjEA')
    );

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        {
            name: 'AES-CBC'
        },
        false,
        ['encrypt']
    );
    const algo = {
        name: 'AES-CBC',
        iv: new Uint8Array(16)
    };
    const buffer = await crypto.subtle.encrypt(
        algo,
        key,
        encoder.encode(movieId)
    );

    function transform(buffer) {
        const n = String.fromCharCode(...new Uint8Array(buffer));
        return btoa(n)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    return transform(buffer);
}
