import axios from "axios";

const DOMAIN = "https://vidsrc.cc/api";

export async function getVidSrc(tmdb_id, s, e) {
    const headers = {
        'user-agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        'Referer': `${DOMAIN}`,
        'Origin': `${DOMAIN}`,
    };


    let sources = [];

    let subtitles = [];

    try {
        let urlSearch = '';
        
        if(s && e){
            urlSearch = `${DOMAIN}/api/${tmdb_id}/servers?vrf=9bf6fd51223ef4419412307ef582c7fd:a98422ad9c2c9e44d07cc9455b3b388f&season=${s}&season=${e}`;
        } else {
            urlSearch = `${DOMAIN}/api/${tmdb_id}/servers?vrf=${generateVRF(await getKey(), "/api/source/")}`;
        }

        // set cookie to bypass cloudflare
        axios.defaults.headers.common['cf_clearance'] = await getKey();
        
        
        
        const apiResponse = await axios.get(urlSearch, {
            headers: headers,
        });

        for (const item of apiResponse.data) {
            const secondresponse = await axios.get(`${DOMAIN}/source/${item.hash}`, {
                headers: headers,
            });

            sources.map((source) => {
                return secondresponse.data.source
            });
            
            subtitles.map((sub) => {
                return secondresponse.data.subtitles
            });
        }


        return {VidSrc: [headers, sources, subtitles]};
    } catch (e) {
        return undefined;
    }
}



/*
 * Get the key for the XOR encryption
 * @returns The key
 */
async function getKey() {
    let url = API_URL + "/saas/images/b-loading.png?t=1"; // since the token change every time, bro make my life a bit simpler please :(
    const response = await fetch(url);
    const res = await response.text();
    return res;
}

/*
 * XOR encrypt or decrypt a message
 * @param key The key for the XOR encryption
 * @param message The message to encrypt or decrypt
 * @returns The encrypted or decrypted message
 */
function xorEncryptDecrypt(key , message) {
    let keyCodes = Array.from(key, (char) => char.charCodeAt(0));
    let messageCodes = Array.from(message, (char) => char.charCodeAt(0));

    let result = [];
    for (let i = 0; i < messageCodes.length; i++) {
        result.push(messageCodes[i] ^ keyCodes[i % keyCodes.length]);
    }
    return String.fromCharCode.apply(null, result);
}

/*
 * Generate the VRF
 * @param key The key for the XOR encryption
 * @param encodedMessage The encoded message
 * @returns The generated VRF
 */
function generateVRF(key, encodedMessage) {
    let decodedMessage = decodeURIComponent(encodedMessage);
    let xorResult = xorEncryptDecrypt(key, decodedMessage);

    return encodeURIComponent(Buffer.from(xorResult).toString("base64"));
}