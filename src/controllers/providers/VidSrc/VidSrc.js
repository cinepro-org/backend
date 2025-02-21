import axios from "axios";

const URL = "https://vidsrc.xyz";
const HOST_URL = "https://edgedeliverynetwork.com";

export async function getVidSrc(params) {
    const tmdbId = params.tmdbId.toString();
    const id = params.imdbId || tmdbId;

    const url = params.episode ?
        `${URL}/embed/tv/${id}/${params.season}-${params.episode}` :
        `${URL}/embed/movie/${id}`;

    const iframeHtml1 = (await axios.get(url)).data;

    // maybe important for later
    let firstServerHash = iframeHtml1.match(/<div class="server" data-hash="([^"]+)">CloudStream Pro<\/div>/)[1];
    let secondServerHash = iframeHtml1.match(/<div class="server" data-hash="([^"]+)">2Embed<\/div>/)[1];
    let thirdServerHash = iframeHtml1.match(/<div class="server" data-hash="([^"]+)">Superembed<\/div>/)[1];

    let secondUrl = extractRegex(iframeHtml1, /id="player_iframe" src="(?<url>[^"]+)"/);
    if (!secondUrl) throw new Error("No second iframe found");
    secondUrl = "https://" + secondUrl.substring(2);

    let iframeHtml2 = (await axios.get(secondUrl, {headers: {Referer: url, Origin: secondUrl}})).data;


    // TODO: Finish this function
    // only works till here. It returns something strange, I think it is a cloudflare background challenge: 
    /*
    * <!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html"/>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/font-awesome/5.12.0-2/css/all.min.css" integrity="" crossorigin="anonymous"/>
<link rel="stylesheet" href="/style_rcp-e600e6.css?t=1731967699"/>

<style>
    body {
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    }
    .hidden {
        display:none;
    }
    
    #asdf {
        width: 0px;
        height: 0px;
    }
    
    #iframe_title {
        position: absolute;
        top: calc(50% + 45px);
        font-size: 1.1em;
        text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        width: calc(100% - 30px);
        text-align: center;
        padding: 0px 15px;
    }
</style>
</head>
<body data-i="12593682"  >
    
    
        <div id="pop_asdf" style="position:absolute; width:100%; height:100%; z-index:2147483650; pointer-events: none;"></div>
        
    <!--<div id="loading_overlay"></div>-->
    <div id="the_frame">
        
    </div>
    
    <div class="cf-turnstile" data-sitekey="0x4AAAAAAA0WKTPOuMGtjfoa" data-callback="cftCallback"></div> <!-- Checking network requests, this data here is being used by cloudflare. -->
    
    <div id="hidden" style="display:hidden;"></div>
    
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-cookie/1.4.1/jquery.cookie.min.js" integrity="sha256-1A78rJEdiWTzco6qdn3igTBv9VupN3Q1ozZNTR4WE/Y=" crossorigin="anonymous"></script>
    
    
    <script>
    
    
    
    function cftCallback(token){ // this would be the next step in vidsrc, but i cannot find the token in the html....
        $.post("/rcp_verify", {token: token}, function(result){
            if(result.length == 1){
                window.location.reload();
            }
        });
    }
    
    </script>
    
   
</body>
</html>

    * */

    // the following stuff I found from here: https://github.com/strumok-app/suppliers/blob/main/src/suppliers/tmdb/extractors/vidsrc_net.rs (translated to js with chatgpt)
    // the repo mentioned above is the only one on github that mentioned edgedeliverynetwork.com (the domain of the hosted videos) (the rest is outdated)
    /*const thirdUrlPath = extractRegex(iframeHtml2, /src: '(?<url>\/prorcp\/[^']+)'/);
    if (!thirdUrlPath) throw new Error("No third iframe found");

    const thirdUrl = `${HOST_URL}${thirdUrlPath}`;
    const iframeHtml3 = (await axios.get(thirdUrl, { headers: { Referer: secondUrl } })).data;

    const match = /<div id="(?<id>[^"]+)" style="display:none;">(?<content>[^>]+)<\/div>/g.exec(iframeHtml3);
    if (!match) throw new Error("No params in third iframe found");

    const decoderId = match.groups.id;
    const content = match.groups.content;

    const decoded = decodeContent(decoderId, content);
    if (!decoded) throw new Error(`Decoder ${decoderId} failed with content: ${content}`);

    return [{ link: decoded, description: "VidSrc.net", headers: null }];*/
    return {
        files: [
            {
                file: secondUrl,
                type: "embed",
                quality: "unknown",
                lang: "en"
            }
        ],
        subtitles: []
    };
}

function extractRegex(text, regex) {
    const match = regex.exec(text);
    return match && match.groups ? match.groups.url : null;
}

function decodeContent(id, content) {
    const decoders = {
        "NdonQLf1Tzyx7bMG": decoder1,
        "sXnL9MQIry": decoder2,
        "IhWrImMIGL": decoder3,
        "xTyBxQyGTA": decoder4,
        "ux8qjPHC66": decoder5,
        "eSfH1IRMyL": decoder6,
        "KJHidj7det": decoder7,
        "o2VSUnjnZl": decoder8,
        "Oi3v1dAlaM": (c) => decoder9(c, 5),
        "TsA2KGDGux": (c) => decoder9(c, 7),
        "JoAHUMCLXV": (c) => decoder9(c, 3),
    };
    return decoders[id] ? decoders[id](content) : null;
}

function decoder1(a) {
    return a.match(/.{1,3}/g).join("");
}

function decoder2(a) {
    const b = "pWB9V)[*4I`nJpp?ozyB~dbr9yt!_n4u";
    const shift = 3;
    const d = Buffer.from(a, "hex").map((v, i) => (v ^ b.charCodeAt(i % b.length)) - shift);
    return Buffer.from(d).toString("base64");
}

function decoder3(a) {
    return Buffer.from(a.replace(/[a-zA-Z]/g, (ch) => {
        const offset = ch <= 'M' || (ch >= 'a' && ch <= 'm') ? 13 : -13;
        return String.fromCharCode(ch.charCodeAt(0) + offset);
    }), "base64").toString();
}

function decoder4(a) {
    return Buffer.from(a.split('').filter((_, i) => i % 2 === 0).join(''), "base64").toString();
}

function decoder5(a) {
    const b = "X9a(O;FMV2-7VO5x;Ao\u0005:dN1NoFs?j,";
    const d = Buffer.from(a, "hex").map((v, i) => v ^ b.charCodeAt(i % b.length));
    return Buffer.from(d).toString("base64");
}

function decoder6(a) {
    return Buffer.from(a.split('').reverse().map(ch => String.fromCharCode(ch.charCodeAt(0) - 1)).join(''), "hex").toString();
}

function decoder7(a) {
    const b = a.slice(10, -16);
    const c = "3SAY~#%Y(V%>5d/Yg\"$G[Lh1rK4a;7ok";
    const d = Buffer.from(b, "base64");
    return Buffer.from(d.map((v, i) => v ^ c.charCodeAt(i % c.length))).toString();
}

function decoder8(a) {
    return Buffer.from(a.replace(/[a-zA-Z]/g, (ch) => {
        const offset = ch <= 'a' ? -1 : -1;
        return String.fromCharCode(ch.charCodeAt(0) + offset);
    })).toString();
}

function decoder9(a, f) {
    const d = Buffer.from(a.replace(/[-_]/g, (m) => (m === "-" ? "+" : "/")), "base64");
    return Buffer.from(d.map((b) => b - f)).toString();
}