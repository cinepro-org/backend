import { extract_streamwish } from './extractors/streamwish.js';
import { ErrorObject } from '../helpers/ErrorObject.js';
import { extract_mixdrop } from './extractors/mixdrop.js';
import { extract_streamtape } from './extractors/streamtape.js';
import { extract_bigwarp } from './extractors/bigwarp.js';
import { extract_filelions } from './extractors/filelions.js';
import { extract_voesx } from './extractors/voesx.js';

const streamwish =
    /(?:\/\/|\.)((?:(?:stream|flas|obey|sfast|str|embed|[mads]|cdn|asn|player|hls)?wish(?:embed|fast|only|srv)?|ajmidyad|atabkhha|atabknha|atabknhk|atabknhs|abkrzkr|abkrzkz|vidmoviesb|kharabnahs|hayaatieadhab|cilootv|tuktukcinema|doodporn|ankrzkz|volvovideo|strmwis|ankrznm|yadmalik|khadhnayad|eghjrutf|eghzrutw|playembed|egsyxurh|egtpgrvh|uqloads|javsw|cinemathek|trgsfjll|fsdcmo|anime4low|mohahhda|ma2d|dancima|swhoi|gsfqzmqu|jodwish|swdyu|katomen|iplayerhls|hlsflast|4yftwvrdz7|ghbrisk)\.(?:com|to|sbs|pro|xyz|store|top|site|online|me|shop|fun))(?:\/e\/|\/f\/|\/d\/)?([0-9a-zA-Z$:\/.]+)/;
const mixdrop =
    /(?:\/\/|\.)((?:mi?xdro*p\d*(?:jmk)?|md(?:3b0j6hj|bekjwqa|fx9dc8n|y48tn97|zsmutpcvykb))\.(?:c[ho]m?|to|sx|bz|gl|club|vc|ag|pw|net|is|s[ib]|nu|m[sy]|ps))\/(?:f|e)\/(\w+)/;
const streamtape =
    /(?:\/\/|\.)((?:s(?:tr)?(?:eam|have)?|tapewith|watchadson)?(?:adblock(?:er|plus)?|antiad|noads)?(?:ta?p?e?|cloud)?(?:blocker|advertisement|adsenjoyer)?\.(?:com|cloud|net|pe|site|link|cc|online|fun|cash|to|xyz|org|wiki|club|tech))\/(?:e|v)\/([0-9a-zA-Z]+)/;

const bigwarp =
    /(?:\/\/|\.)((?:bigwarp|bgwp)\.(?:io|cc|art))\/(?:e\/|embed-)?([0-9a-zA-Z=]+)/;
const filelions =
    /(?:\/\/|\.)(?:filelions|ajmidyadfihayh|alhayabambi|techradar|moflix-stream|azipcdn|motvy55|[mad]lions|lumiawatch|javplaya|javlion|fviplions|egsyxutd|fdewsdc|vidhide|peytone|anime7u|coolciima|gsfomqu|katomen|dht|6sfkrspw4u|ryderjet|e4xb5c2xnz|smooth|kinoger|movearn|videoland|mivalyo)(?:pro|vip|pre|plus|hub)?\.(?:com?|to|sbs|ink|click|pro|live|store|xyz|top|online|site|fun|be)\/(?:s|v|f|d|embed|file|download)\/([0-9a-zA-Z$:\/.]+)/;
const voesx =
    /(?:\/\/|\.)((?:audaciousdefaulthouse|launchreliantcleaverriver|kennethofficialitem|reputationsheriffkennethsand|fittingcentermondaysunday|paulkitchendark|housecardsummerbutton|fraudclatterflyingcar|35volitantplimsoles5\.com|sethniceletter|bigclatterhomesguideservice|uptodatefinishconferenceroom|edwardarriveoften|realfinanceblogcenter|tinycat-voe-fashion|20demidistance9elongations|michaelapplysome|telyn610zoanthropy|toxitabellaeatrebates306|greaseball6eventual20|jayservicestuff|745mingiestblissfully|19turanosephantasia|30sensualizeexpression|sandrataxeight|321naturelikefurfuroid|449unceremoniousnasoseptal|guidon40hyporadius9|brucevotewithin|cyamidpulverulence530|boonlessbestselling244|antecoxalbobbing1010|lukecomparetwo|matriculant401merited|scatch176duplicities|availedsmallest|stevenimaginelittle|counterclockwisejacky|simpulumlamerop|wolfdyslectic|nectareousoverelate|metagnathtuggers|gamoneinterrupted|chromotypic|crownmakermacaronicism|diananatureforeign|yodelswartlike|figeterpiazine|strawberriesporail|valeronevijao|timberwoodanotia|generatesnitrosate|apinchcaseation|nonesnanking|kathleenmemberhistory|jamiesamewalk|bradleyviewdoctor|graceaddresscommunity|shannonpersonalcost|cindyeyefinal|rebeccaneverbase|loriwithinfamily|roberteachfinal|erikcoldperson|jasminetesttry|heatherdiscussionwhen|robertplacespace|alleneconomicmatter|josephseveralconcern|donaldlineelse|lisatrialidea|toddpartneranimal|jamessoundcost|brittneystandardwestern|sandratableother|robertordercharacter|maxfinishseveral|chuckle-tube|kristiesoundsimply|adrianmissionminute|nathanfromsubject|richardsignfish|jennifercertaindevelopment|jonathansociallike|mariatheserepublican|johnalwayssame|kellywhatcould|jilliandescribecompany|(?:v-?o-?e)?(?:-?un-?bl[o0]?c?k\d{0,2})?(?:-?voe)?)\.(?:sx|com|net))\/(?:e\/)?([0-9A-Za-z]+)/;
export async function extract(url, DOMAIN = '') {
    if (streamwish.test(url)) {
        return await extract_streamwish(url, DOMAIN);
    } else if (mixdrop.test(url)) {
        let data = await extract_mixdrop(url.split('/').pop());
        if (data instanceof ErrorObject) {
            return data;
        }
        return {
            file: data.url,
            type: 'mp4',
            headers: data.headers
        };
    } else if (streamtape.test(url)) {
        let data = await extract_streamtape(url);
        if (data instanceof ErrorObject) {
            return data;
        }
        return {
            file: data.file || data.url,
            type: 'mp4'
        };
    } else if (bigwarp.test(url)) {
        let data = await extract_bigwarp(url);
        if (data instanceof ErrorObject) {
            return data;
        }
        return {
            file: data.url,
            type: 'mp4',
            headers: data.headers
        };
    } else if (filelions.test(url)) {
        let data = await extract_filelions(url);
        if (data instanceof ErrorObject) {
            return data;
        }
        return {
            file: data.file,
            type: data.type,
            quality: data.quality
        };
    } else if (voesx.test(url)) {
        let data = await extract_voesx(url);
        if (data instanceof ErrorObject) {
            return data;
        }
        return {
            file: data.file,
            type: data.type,
            quality: data.quality
        };
    }

    if (process.argv.includes('--debug')) {
        console.log(
            `[extractor] ${url} (${DOMAIN}) is not a supported server... maybe check this out!`
        );
    }
    return new ErrorObject(
        'No extractor found',
        'Extractor',
        500,
        'No extractor found matching for this URL: ' + url,
        true,
        true
    );
}
