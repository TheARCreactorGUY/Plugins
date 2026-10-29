/**
 * Freekz (freekz.to / Vidstuck & Freekz StreamHub Native) Provider Plugin for Euthopiar
 *
 * Multi-Engine High-Speed Streaming Architecture:
 *
 *  Engine 1: Freekz StreamHub Native App Engine (Reverse engineered from official Freekz.apk)
 *   - Native direct MP4 CDN streaming from bcdnxw.hakunaymatata.com
 *   - Zero-dependency pure JS MD5 client token generator
 *   - Dynamic JWT session handshake via /wefeed-h5api-bff/home?host=mzfi.me
 *   - Dual-channel stream extraction via /subject/play & /subject/download
 *   - Full multi-resolution support (1080p, 720p, 480p, 360p) with instant Range/HTTP 206 seeking
 *   - Automatic multi-language subtitle track extraction from native captions
 *
 *  Engine 2: Vidstuck Multi-Server CDN Engine (vidstuck.cc)
 *   - 5 CDN architectures: Atlas (HLS), Ursa (Dual-Audio), Daedalus (AWS CloudFront),
 *     Orion (MPEG-DASH / dubs), Andromeda (MPEG-DASH)
 *   - Native CryptoJS.AES decryption with zero third-party bundle overhead
 *   - Direct /backend/subtitle multi-language integration
 *
 *  Engine 3: Headless Browser.resolve Fallback
 *   - Sniffs decrypted streams & auto-clicks server switcher tabs if APIs rotate
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var NATIVE_API_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
var NATIVE_HOST = 'mzfi.me';
var BASE_URL = 'https://freekz.to';
var BACKEND_URL = 'https://vidstuck.cc';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var PROVIDER_ID = 'freekz';
var PROVIDER_NAME = 'Freekz';

// Deobfuscated parameter keys for vidstuck backend
var KEY_TMDB = "a7f39c821d604e5b9c1e547b";
var KEY_TS = "61d9a5274c8e3b29f38c291e6";
var KEY_TOKEN = "c492f7a183d601e436c538a716d";
var KEY_TITLE = "5e28c9147a306d1e29f3674b392a1";
var KEY_YEAR = "b731e6c94f08675f8341c306e";
var KEY_SEASON = "d8427b59c38a2f957c3613e85b";
var KEY_EPISODE = "91c6e4a753d1f785c92346b713d";
var KEY_SERVER = "6b491e7258d392e7561a9384c";
var KEY_TYPE = "c281b306d28147a35632e816b";
var KEY_DATE = "e1649321a39e5814b3027";
var KEY_LATEST_DATE = "e92543416ad739e5814b3027";
var KEY_IMDB = "f35a8c19d674b3265e871c4933a725f";

var AES_PASSPHRASE = "7f4c9e2a81d63b05c4f7a9e8126d3b50e1a8c7f23d9465ab0c6e9f1d4a7b832c";

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': BACKEND_URL + '/',
    'Origin': BACKEND_URL,
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
};

var STREAM_CACHE = {};
var CACHE_TTL_MS = 5 * 60 * 1000;

var cachedNativeToken = null;
var nativeTokenExpiresAt = 0;

/* =========================================================================
   PURE JS ZERO-DEPENDENCY MD5 IMPLEMENTATION
   ========================================================================= */
function pureMd5(str) {
    if (typeof CryptoJS !== 'undefined' && CryptoJS.MD5) {
        return CryptoJS.MD5(str).toString();
    }
    if (typeof require !== 'undefined') {
        try {
            return require('crypto').createHash('md5').update(str).digest('hex');
        } catch (_) {}
    }
    function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }
    function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function md51(s) {
        var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
        for (i = 64; i <= s.length; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }
    function md5blk(s) {
        var md5blks = [], i;
        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }
    var hex_chr = '0123456789abcdef'.split('');
    function rhex(n) {
        var s = '', j = 0;
        for (; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        return s;
    }
    function hex(x) {
        for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]);
        return x.join('');
    }
    function add32(a, b) {
        return (a + b) & 0xFFFFFFFF;
    }
    return hex(md51(str));
}

function generateMovieBoxClientToken() {
    var ts = Math.floor(Date.now() / 1000);
    var rev = String(ts).split('').reverse().join('');
    var hash = pureMd5(rev);
    return ts + ',' + hash;
}

/* =========================================================================
   FREEKZ STREAMHUB NATIVE ENGINE (Reverse Engineered from Freekz.apk)
   ========================================================================= */
async function getNativeSessionToken() {
    var now = Date.now();
    if (cachedNativeToken && nativeTokenExpiresAt > now + 60000) {
        return cachedNativeToken;
    }
    try {
        var clientToken = generateMovieBoxClientToken();
        var res = await fetchWithTimeout(NATIVE_API_BASE + '/home?host=' + NATIVE_HOST, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://' + NATIVE_HOST + '/',
                'Origin': 'https://' + NATIVE_HOST,
                'X-Client-Info': '{"timezone":"Asia/Manila"}',
                'X-Request-Lang': 'en',
                'X-Client-Token': clientToken,
                'X-No-High-Risk-Restrict': '0',
                'X-Vip-Restrict': '0'
            }
        }, 6000);

        if (res.ok) {
            var xUser = res.headers.get('x-user');
            if (xUser) {
                var parsed = JSON.parse(xUser);
                if (parsed && parsed.token) {
                    cachedNativeToken = parsed.token;
                    nativeTokenExpiresAt = now + 3600000;
                    return cachedNativeToken;
                }
            }
        }
    } catch (_) {}
    return '';
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchNativeSubjects(query) {
    var token = await getNativeSessionToken();
    try {
        var headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': 'https://' + NATIVE_HOST + '/search-result?keyword=' + encodeURIComponent(query),
            'Origin': 'https://' + NATIVE_HOST,
            'X-Client-Info': '{"timezone":"Asia/Manila"}',
            'X-Request-Lang': 'en',
            'X-No-High-Risk-Restrict': '0',
            'X-Vip-Restrict': '0'
        };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        var res = await fetchWithTimeout(NATIVE_API_BASE + '/subject/search', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                keyword: query,
                page: 1,
                perPage: 15,
                subjectType: 0
            })
        }, 7000);

        if (res.ok) {
            var data = await res.json();
            if (data && data.data && Array.isArray(data.data.items)) {
                return data.data.items;
            }
        }
    } catch (_) {}
    return [];
}

function selectNativeCandidates(items, targetTitle, targetYear, isTv, season) {
    if (!items || items.length === 0) return [];
    var cleanTarget = cleanTitle(targetTitle);
    var targetWords = cleanTarget.split(' ').filter(function(w) { return w.length > 1; });

    var scored = [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.subjectId) continue;
        var itemClean = cleanTitle(item.title);
        var itemType = Number(item.subjectType); // 1 = Movie, 2 = TV Series, 6 = Clip
        var score = 0;

        if (isTv) {
            if (itemType === 2) score += 400;
            else if (itemType === 1) score -= 500;
            else if (itemType === 6) score -= 800;

            if (season) {
                var sRegex = new RegExp('\\b(s0*' + season + '|season\\s*0*' + season + ')\\b', 'i');
                if (sRegex.test(item.title)) {
                    score += 300;
                } else if (/\bs\d+\b/i.test(item.title)) {
                    score -= 300;
                }
            }
        } else {
            if (itemType === 1) score += 400;
            else if (itemType === 2) score -= 500;
            else if (itemType === 6) score -= 800;

            if (targetYear && item.releaseDate && item.releaseDate.indexOf(targetYear) === 0) {
                score += 200;
            }
        }

        if (itemClean === cleanTarget) {
            score += 500;
        } else if (itemClean.indexOf(cleanTarget) === 0) {
            score += 300;
        } else {
            var matched = 0;
            for (var w = 0; w < targetWords.length; w++) {
                if (itemClean.indexOf(targetWords[w]) >= 0) matched++;
            }
            if (targetWords.length > 0 && matched / targetWords.length >= 0.5) {
                score += matched * 60;
            } else {
                score -= 200;
            }
        }

        if (item.hasResource) score += 100;
        scored.push({ item: item, score: score });
    }

    scored.sort(function(a, b) { return b.score - a.score; });
    if (scored.length === 0 || scored[0].score <= 0) return [];

    var selected = [scored[0].item];
    for (var j = 1; j < scored.length; j++) {
        if (scored[j].score <= 0) continue;
        var it = scored[j].item;
        var itTitle = (it.title || '') + ' ' + (it.corner || '');
        if (/hindi|dub|multi|dual/i.test(itTitle)) {
            var itClean = cleanTitle(it.title);
            if (itClean.indexOf(cleanTarget) === 0 || cleanTarget.indexOf(itClean.split(' ')[0]) === 0) {
                selected.push(it);
                break;
            }
        }
    }
    return selected;
}

async function fetchNativeStreams(candidate, isTv, season, episode, mediaTitle, releaseYear) {
    if (!candidate) return { streams: [], subtitles: [] };
    var token = await getNativeSessionToken();
    var se = isTv ? (season || 1) : 0;
    var ep = isTv ? (episode || 1) : 0;
    var subjectId = candidate.subjectId;
    var detailPath = candidate.detailPath || '';

    var headers = {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
        'Referer': 'https://' + NATIVE_HOST + '/spa/videoPlayPage/movies/' + (detailPath || 'item') + '?id=' + subjectId + '&type=/movie/detail',
        'Origin': 'https://' + NATIVE_HOST,
        'X-Client-Info': '{"timezone":"Asia/Manila"}',
        'X-Request-Lang': 'en',
        'X-No-High-Risk-Restrict': '0',
        'X-Vip-Restrict': '0'
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var streamHeaders = {
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
        'Referer': 'https://' + NATIVE_HOST + '/'
    };

    var streams = [];
    var subtitles = [];
    var seenUrls = {};

    var epTag = 'S' + (se < 10 ? '0' : '') + se + 'E' + (ep < 10 ? '0' : '') + ep;

    // Detect language badge from title or corner (e.g. [Hindi] or [HIN])
    var audioBadge = '[ENG]';
    var audioCode = 'en';
    if (/hindi|hin\b/i.test(candidate.title || '') || /hindi/i.test(candidate.corner || '')) {
        audioBadge = '[HIN]';
        audioCode = 'hi';
    } else if (/multi|dual/i.test(candidate.title || '')) {
        audioBadge = '[MULTI]';
        audioCode = 'multi';
    }

    // 1. Query /subject/play for primary MP4 CDN streams
    try {
        var playUrl = NATIVE_API_BASE + '/subject/play?subjectId=' + subjectId + '&se=' + se + '&ep=' + ep + (detailPath ? '&detailPath=' + encodeURIComponent(detailPath) : '');
        var pRes = await fetchWithTimeout(playUrl, { headers: headers }, 6500);
        if (pRes.ok) {
            var pData = await pRes.json();
            if (pData && pData.data && Array.isArray(pData.data.streams)) {
                var sortedPlay = pData.data.streams.filter(function(s) { return s && s.url && s.url.indexOf('http') === 0; })
                    .sort(function(a, b) { return (Number(b.resolutions) || 0) - (Number(a.resolutions) || 0); });
                for (var pi = 0; pi < sortedPlay.length; pi++) {
                    var s = sortedPlay[pi];
                    if (!s || !s.url || seenUrls[s.url]) continue;
                    seenUrls[s.url] = true;
                    var qual = s.resolutions ? (s.resolutions + 'p') : '1080p';
                    var streamTitle = isTv
                        ? (mediaTitle + ' ' + epTag + ' ' + audioBadge + ' - Freekz StreamHub Direct [' + qual + ']')
                        : (mediaTitle + ' (' + releaseYear + ') ' + audioBadge + ' - Freekz StreamHub Direct [' + qual + ']');

                    streams.push({
                        name: 'Freekz | StreamHub Direct • ' + audioBadge + ' (' + qual + ')',
                        title: streamTitle,
                        url: s.url,
                        quality: qual,
                        size: s.size ? (Math.round(s.size / (1024 * 1024)) + ' MB') : (isTv ? '750 MB' : '2.0 GB'),
                        type: 'mp4',
                        format: 'mp4',
                        container: 'mp4',
                        isSequential: true,
                        provider: PROVIDER_ID,
                        language: audioCode,
                        headers: streamHeaders,
                        subtitles: []
                    });
                }
            }
        }
    } catch (_) {}

    // 2. Query /subject/download for Fast-DL direct CDN mirrors & captions
    try {
        var dlUrl = NATIVE_API_BASE + '/subject/download?subjectId=' + subjectId + '&se=' + se + '&ep=' + ep + (detailPath ? '&detailPath=' + encodeURIComponent(detailPath) : '');
        var dRes = await fetchWithTimeout(dlUrl, { headers: headers }, 6500);
        if (dRes.ok) {
            var dData = await dRes.json();
            if (dData && dData.data && Array.isArray(dData.data.downloads)) {
                var sortedDl = dData.data.downloads.filter(function(d) { return d && d.url && d.url.indexOf('http') === 0 && !seenUrls[d.url]; })
                    .sort(function(a, b) { return (Number(b.resolution) || 0) - (Number(a.resolution) || 0); });
                for (var di = 0; di < sortedDl.length; di++) {
                    var d = sortedDl[di];
                    if (!d || !d.url || seenUrls[d.url]) continue;
                    seenUrls[d.url] = true;
                    var dQual = d.resolution ? (d.resolution + 'p') : '1080p';
                    var dTitle = isTv
                        ? (mediaTitle + ' ' + epTag + ' ' + audioBadge + ' - Freekz Fast-DL Direct [' + dQual + ']')
                        : (mediaTitle + ' (' + releaseYear + ') ' + audioBadge + ' - Freekz Fast-DL Direct [' + dQual + ']');

                    streams.push({
                        name: 'Freekz | Fast-DL Direct • ' + audioBadge + ' (' + dQual + ')',
                        title: dTitle,
                        url: d.url,
                        quality: dQual,
                        size: d.size ? (Math.round(d.size / (1024 * 1024)) + ' MB') : (isTv ? '750 MB' : '2.0 GB'),
                        type: 'mp4',
                        format: 'mp4',
                        container: 'mp4',
                        isSequential: true,
                        provider: PROVIDER_ID,
                        language: audioCode,
                        headers: streamHeaders,
                        subtitles: []
                    });
                }
            }

            if (dData && dData.data && Array.isArray(dData.data.captions)) {
                for (var cIdx = 0; cIdx < dData.data.captions.length; cIdx++) {
                    var c = dData.data.captions[cIdx];
                    if (c && c.url) {
                        var cLabel = (c.language || 'English').trim();
                        subtitles.push({
                            url: c.url,
                            language: cLabel,
                            lang: cLabel,
                            name: cLabel,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    }
                }
            }
        }
    } catch (_) {}

    return { streams: streams, subtitles: subtitles };
}

/* =========================================================================
   VIDSTUCK 5-SERVER CDN ENGINE
   ========================================================================= */
var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' },
    'eng': { name: 'English', tag: 'ENG' },
    'hi': { name: 'Hindi', tag: 'HIN' },
    'hin': { name: 'Hindi', tag: 'HIN' },
    'es': { name: 'Spanish', tag: 'SPA' },
    'spa': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' },
    'fra': { name: 'French', tag: 'FRA' },
    'de': { name: 'German', tag: 'GER' },
    'ger': { name: 'German', tag: 'GER' },
    'it': { name: 'Italian', tag: 'ITA' },
    'ita': { name: 'Italian', tag: 'ITA' },
    'ja': { name: 'Japanese', tag: 'JPN' },
    'jpn': { name: 'Japanese', tag: 'JPN' },
    'ko': { name: 'Korean', tag: 'KOR' },
    'kor': { name: 'Korean', tag: 'KOR' },
    'pt': { name: 'Portuguese', tag: 'POR' },
    'por': { name: 'Portuguese', tag: 'POR' },
    'ru': { name: 'Russian', tag: 'RUS' },
    'rus': { name: 'Russian', tag: 'RUS' },
    'ta': { name: 'Tamil', tag: 'TAM' },
    'tam': { name: 'Tamil', tag: 'TAM' },
    'te': { name: 'Telugu', tag: 'TEL' },
    'tel': { name: 'Telugu', tag: 'TEL' },
    'ar': { name: 'Arabic', tag: 'ARA' },
    'zh': { name: 'Chinese', tag: 'CHI' },
    'tl': { name: 'Tagalog', tag: 'TGL' },
    'tgl': { name: 'Tagalog', tag: 'TGL' },
    'esla': { name: 'Latin Spanish', tag: 'SPA' },
    'ptbr': { name: 'Brazilian Portuguese', tag: 'POR' }
};

function getLangInfo(codeOrName) {
    if (!codeOrName) return { name: 'English', tag: 'ENG', code: 'en' };
    var lower = String(codeOrName).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) {
        return { name: LANGUAGE_MAP[lower].name, tag: LANGUAGE_MAP[lower].tag, code: lower.slice(0, 2) };
    }
    for (var k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) {
            return { name: LANGUAGE_MAP[k].name, tag: LANGUAGE_MAP[k].tag, code: k.slice(0, 2) };
        }
    }
    var shortTag = lower.slice(0, 3).toUpperCase();
    return { name: String(codeOrName), tag: shortTag, code: lower.slice(0, 2) };
}

var SERVERS = [
    { id: "atlas", name: "Atlas", desc: "HLS CDN", format: "m3u8", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "ursa", name: "Ursa", desc: "Dual-Audio HLS", format: "m3u8", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "daedalus", name: "Daedalus", desc: "CloudFront CDN", format: "m3u8", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "orion", name: "Orion", desc: "DASH / Dubs", format: "mpd", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "andromeda", name: "Andromeda", desc: "MPEG-DASH CDN", format: "mpd", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" }
];

function detectServerAudio(url, server, dubInfo) {
    if (dubInfo && (dubInfo.lanCode || dubInfo.lanName)) {
        return getLangInfo(dubInfo.lanCode || dubInfo.lanName);
    }
    var clean = (url || '').toLowerCase();
    if (clean.indexOf('hindi') >= 0 || clean.indexOf('_hin') >= 0 || clean.indexOf('/hin') >= 0) {
        return getLangInfo('hi');
    }
    if (clean.indexOf('french') >= 0 || clean.indexOf('_fra') >= 0 || clean.indexOf('/fra') >= 0) {
        return getLangInfo('fr');
    }
    if (clean.indexOf('spanish') >= 0 || clean.indexOf('_spa') >= 0 || clean.indexOf('/spa') >= 0) {
        return getLangInfo('es');
    }
    if (clean.indexOf('tamil') >= 0 || clean.indexOf('_tam') >= 0 || clean.indexOf('/tam') >= 0) {
        return getLangInfo('ta');
    }
    if (clean.indexOf('telugu') >= 0 || clean.indexOf('_tel') >= 0 || clean.indexOf('/tel') >= 0) {
        return getLangInfo('te');
    }
    if (clean.indexOf('russian') >= 0 || clean.indexOf('_rus') >= 0 || clean.indexOf('/rus') >= 0) {
        return getLangInfo('ru');
    }
    if (server && server.audioTag && server.audioTag !== 'MULTI') {
        return getLangInfo(server.audioTag);
    }
    return getLangInfo('en');
}

function decryptLink(cipherText) {
    if (!cipherText || typeof cipherText !== 'string') return null;
    var trimmed = cipherText.trim();
    if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0 || trimmed.indexOf('/') === 0) {
        return trimmed;
    }
    // 1. Android QuickJS host runtime CryptoJS (supports global and require('crypto-js'))
    try {
        var cryptoObj = null;
        if (typeof CryptoJS !== 'undefined' && CryptoJS.AES) {
            cryptoObj = CryptoJS;
        } else if (typeof globalThis !== 'undefined' && globalThis.CryptoJS && globalThis.CryptoJS.AES) {
            cryptoObj = globalThis.CryptoJS;
        } else if (typeof require !== 'undefined') {
            try { cryptoObj = require('crypto-js'); } catch (_) {}
        }

        if (cryptoObj && cryptoObj.AES && cryptoObj.enc && cryptoObj.enc.Utf8) {
            var decrypted = cryptoObj.AES.decrypt(trimmed, AES_PASSPHRASE);
            var utf8Str = decrypted.toString(cryptoObj.enc.Utf8);
            if (utf8Str && (utf8Str.indexOf('http://') === 0 || utf8Str.indexOf('https://') === 0 || utf8Str.indexOf('/') === 0)) {
                return utf8Str;
            }
        }
    } catch (_) {}

    // 2. Node.js environment fallback using built-in 'crypto'
    try {
        if (typeof require !== 'undefined') {
            var nodeCrypto = null;
            try { nodeCrypto = require('crypto'); } catch (_) {}
            if (nodeCrypto && typeof nodeCrypto.createDecipheriv === 'function') {
                var raw = Buffer.from(trimmed, 'base64');
                if (raw.subarray(0, 8).toString('utf8') === 'Salted__') {
                    var salt = raw.subarray(8, 16);
                    var ciphertext = raw.subarray(16);
                    var d = Buffer.alloc(0);
                    var dI = Buffer.alloc(0);
                    var passBuf = Buffer.from(AES_PASSPHRASE, 'utf8');
                    while (d.length < 48) {
                        var h = nodeCrypto.createHash('md5');
                        h.update(dI);
                        h.update(passBuf);
                        h.update(salt);
                        dI = h.digest();
                        d = Buffer.concat([d, dI]);
                    }
                    var key = d.subarray(0, 32);
                    var iv = d.subarray(32, 48);
                    var decipher = nodeCrypto.createDecipheriv('aes-256-cbc', key, iv);
                    var dec = decipher.update(ciphertext);
                    dec = Buffer.concat([dec, decipher.final()]);
                    var resStr = dec.toString('utf8');
                    if (resStr && (resStr.indexOf('http://') === 0 || resStr.indexOf('https://') === 0 || resStr.indexOf('/') === 0)) {
                        return resStr;
                    }
                }
            }
        }
    } catch (_) {}
    return null;
}

function normalizeUrl(url) {
    if (!url) return '';
    var clean = String(url).trim();
    if (clean.indexOf('//') === 0) return 'https:' + clean;
    if (clean.indexOf('/') === 0) return BACKEND_URL + clean;
    return clean;
}

function classifyFormat(item, url, defaultFormat) {
    var rawUrl = (url || '').toLowerCase();
    var format = (item && item.format) ? String(item.format).toLowerCase() : '';
    if (rawUrl.indexOf('.m3u8') >= 0 || format === 'm3u8' || format === 'hls') {
        return { type: 'm3u8', format: 'hls' };
    }
    if (rawUrl.indexOf('.mpd') >= 0 || format === 'mpd' || format === 'dash') {
        return { type: 'mpd', format: 'dash' };
    }
    if (rawUrl.indexOf('.mp4') >= 0 || format === 'mp4') {
        return { type: 'mp4', format: 'mp4' };
    }
    return defaultFormat === 'mpd'
        ? { type: 'mpd', format: 'dash' }
        : { type: 'm3u8', format: 'hls' };
}

async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var timer;
    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error('Request timeout (' + timeoutMs + 'ms)'));
        }, timeoutMs);
    });

    try {
        var res = await Promise.race([
            fetch(url, options),
            timeoutPromise
        ]);
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

async function fetchSubtitles(tmdbId, effectiveType, season, episode, title, year, date, latestDate) {
    try {
        var tokenPayload = {
            [KEY_TMDB]: String(tmdbId),
            [KEY_TYPE]: effectiveType,
            [KEY_SERVER]: 'subtitle'
        };
        if (effectiveType === 'tv') {
            tokenPayload[KEY_SEASON] = Number(season);
            tokenPayload[KEY_EPISODE] = Number(episode);
        }

        var tokenRes = await fetchWithTimeout(BACKEND_URL + '/backend/zxc', {
            method: 'POST',
            headers: DEFAULT_HEADERS,
            body: JSON.stringify(tokenPayload)
        }, 5000);

        if (!tokenRes.ok) return [];
        var tokenData = await tokenRes.json();
        if (!tokenData || !tokenData.token || !tokenData.ts) return [];

        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId),
            [KEY_TYPE]: effectiveType,
            [KEY_SERVER]: 'subtitle',
            [KEY_TS]: String(tokenData.ts),
            [KEY_TOKEN]: tokenData.token,
            [KEY_TITLE]: title,
            [KEY_YEAR]: year,
            [KEY_DATE]: date
        });
        if (latestDate) params.set(KEY_LATEST_DATE, latestDate);
        if (effectiveType === 'tv') {
            params.set(KEY_SEASON, String(season));
            params.set(KEY_EPISODE, String(episode));
        }

        var subHeaders = {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': BACKEND_URL + '/',
            'Accept': 'application/json, text/plain, */*'
        };

        var subRes = await fetchWithTimeout(BACKEND_URL + '/backend/subtitle?' + params.toString(), {
            headers: subHeaders
        }, 1500);

        if (!subRes.ok) return [];
        var subData = await subRes.json();
        var captions = (subData && (subData.captions || subData.subtitles)) || [];

        var results = [];
        var seenSubUrls = {};

        for (var i = 0; i < captions.length; i++) {
            var c = captions[i];
            if (!c) continue;
            var rawFile = c.file || c.url || c.link || '';
            var resolvedFile = normalizeUrl(decryptLink(rawFile) || rawFile);
            if (!resolvedFile || seenSubUrls[resolvedFile]) continue;
            seenSubUrls[resolvedFile] = true;

            var label = (c.display || c.label || c.language || c.lang || 'English').trim();
            results.push({
                url: resolvedFile,
                language: label,
                lang: label,
                name: label,
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': BASE_URL + '/'
                }
            });
        }
        return results;
    } catch (_) {
        return [];
    }
}

async function fetchServerStream(serverId, tmdbId, effectiveType, season, episode, title, year, date, latestDate, imdbId, dubCode, dubType, tokenOverride) {
    try {
        var tokenData = tokenOverride;
        if (!tokenData) {
            var tokenPayload = {
                [KEY_TMDB]: String(tmdbId),
                [KEY_TYPE]: effectiveType,
                [KEY_SERVER]: serverId
            };
            if (effectiveType === 'tv') {
                tokenPayload[KEY_SEASON] = Number(season);
                tokenPayload[KEY_EPISODE] = Number(episode);
            }

            var tokenRes = await fetchWithTimeout(BACKEND_URL + '/backend/zxc', {
                method: 'POST',
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(tokenPayload)
            }, 5000);

            if (!tokenRes.ok) return null;
            tokenData = await tokenRes.json();
            if (!tokenData || !tokenData.token || !tokenData.ts) return null;
        }

        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId),
            [KEY_TYPE]: effectiveType,
            [KEY_SERVER]: serverId,
            [KEY_TS]: String(tokenData.ts),
            [KEY_TOKEN]: tokenData.token,
            [KEY_TITLE]: title,
            [KEY_YEAR]: year,
            [KEY_DATE]: date
        });
        if (latestDate) params.set(KEY_LATEST_DATE, latestDate);
        if (effectiveType === 'tv') {
            params.set(KEY_SEASON, String(season));
            params.set(KEY_EPISODE, String(episode));
        }
        if (imdbId) params.set(KEY_IMDB, imdbId);
        if (dubCode) {
            params.set('dubCode', String(dubCode));
            params.set('dubType', String(dubType || 0));
        }

        var dataHeaders = {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': BACKEND_URL + '/',
            'Accept': 'application/json, text/plain, */*'
        };

        var streamRes = await fetchWithTimeout(BACKEND_URL + '/backend/servers/' + serverId + '?' + params.toString(), {
            headers: dataHeaders
        }, 4500);

        if (!streamRes.ok) return null;
        var data = await streamRes.json();
        if (data && (data.links || data.dubs || data.subtitles)) {
            data._tokenData = tokenData;
            return data;
        }
        return null;
    } catch (_) {
        return null;
    }
}

function buildHeadersForStreamUrl(url) {
    var lower = String(url || '').toLowerCase();
    if (lower.indexOf('hakunaymatata.com') >= 0 || lower.indexOf('aoneroom.com') >= 0 || lower.indexOf('mzfi.me') >= 0) {
        return {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': 'https://' + NATIVE_HOST + '/'
        };
    }
    if (lower.indexOf('akamai') >= 0 || lower.indexOf('fastly') >= 0) {
        return {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Origin': 'https://freekz.to',
            'Referer': 'https://freekz.to/'
        };
    }
    if (lower.indexOf('cloudfront') >= 0) {
        return {
            'User-Agent': DEFAULT_HEADERS['User-Agent']
        };
    }
    return {
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
        'Referer': BACKEND_URL + '/',
        'Origin': BACKEND_URL
    };
}

/* =========================================================================
   MAIN GETSTREAMS IMPLEMENTATION
   ========================================================================= */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    try {
        var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
        extraArgs = Object.assign({}, callArgs, extraArgs || {});

        var isMovie = mediaType === 'movie';
        var effectiveType = isMovie ? 'movie' : 'tv';
        var sNum = Number(season) || 1;
        var eNum = Number(episode) || 1;
        var epTag = 'S' + (sNum < 10 ? '0' : '') + sNum + 'E' + (eNum < 10 ? '0' : '') + eNum;

        var cacheKey = String(tmdbId) + ':' + effectiveType + ':' + sNum + ':' + eNum;
        var cached = STREAM_CACHE[cacheKey];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            return cached.streams;
        }

        var mediaTitle = extraArgs.title || extraArgs.name || '';
        var releaseYear = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
        var releaseDate = extraArgs.releaseDate || '';
        var latestDate = extraArgs.lastAirDate || extraArgs.latestDate || '';
        var imdbId = extraArgs.imdbId || '';

        // TMDB Metadata resolution
        if (!mediaTitle || !releaseYear || !releaseDate) {
            try {
                var detailsRes = await fetchWithTimeout(BACKEND_URL + '/backend/tmdb/details/' + effectiveType + '/' + tmdbId + '?language=en-US', {
                    headers: DEFAULT_HEADERS
                }, 4500);
                if (detailsRes.ok) {
                    var details = await detailsRes.json();
                    if (details) {
                        mediaTitle = mediaTitle || details.title || details.name || '';
                        var dStr = details.release_date || details.first_air_date || '';
                        releaseDate = releaseDate || dStr || '2024-01-01';
                        latestDate = latestDate || details.last_air_date || releaseDate;
                        releaseYear = releaseYear || (dStr ? dStr.substring(0, 4) : '2024');
                        imdbId = imdbId || details.imdb_id || (details.external_ids && details.external_ids.imdb_id) || '';
                    }
                }
            } catch (_) {}
        }

        if (!mediaTitle) {
            try {
                var fallbackRes = await fetchWithTimeout(TMDB_PROXY_URL + '/' + effectiveType + '/' + tmdbId, {
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                }, 4000);
                if (fallbackRes.ok) {
                    var fb = await fallbackRes.json();
                    mediaTitle = fb.title || fb.name || '';
                    var fbDate = fb.release_date || fb.first_air_date || '2024-01-01';
                    releaseDate = releaseDate || fbDate;
                    latestDate = latestDate || fb.last_air_date || fbDate;
                    releaseYear = releaseYear || fbDate.substring(0, 4);
                }
            } catch (_) {}
        }

        mediaTitle = mediaTitle || ('Media ' + tmdbId);
        releaseYear = String(releaseYear || '2024');
        releaseDate = releaseDate || (releaseYear + '-01-01');
        latestDate = latestDate || releaseDate;

        console.log('[Freekz] Resolving streams for ' + effectiveType + ': "' + mediaTitle + '" (' + releaseYear + ')' + (!isMovie ? ' ' + epTag : ''));

        // -------------------------------------------------------------
        // CONCURRENT DISPATCH:
        //  1. Native Freekz App Engine (aoneroom.com)
        //  2. Vidstuck Subtitles
        //  3. Vidstuck 5-Server CDN Pipeline
        // -------------------------------------------------------------
        var nativePromise = (async function() {
            try {
                var searchQ = mediaTitle.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                var items = await searchNativeSubjects(searchQ);
                var cands = selectNativeCandidates(items, mediaTitle, releaseYear, !isMovie, sNum);
                if (cands.length === 0 && searchQ.indexOf(' ') >= 0) {
                    var firstWord = searchQ.split(' ')[0];
                    if (firstWord && firstWord.length > 3) {
                        items = await searchNativeSubjects(firstWord);
                        cands = selectNativeCandidates(items, mediaTitle, releaseYear, !isMovie, sNum);
                    }
                }
                var allStreams = [];
                var allSubs = [];
                var seenNativeBaseUrls = {};
                for (var ci = 0; ci < cands.length; ci++) {
                    var nRes = await fetchNativeStreams(cands[ci], !isMovie, sNum, eNum, mediaTitle, releaseYear);
                    if (nRes && Array.isArray(nRes.streams)) {
                        for (var nsi = 0; nsi < nRes.streams.length; nsi++) {
                            var st = nRes.streams[nsi];
                            var baseKey = (st.url || '').split('?')[0];
                            if (!seenNativeBaseUrls[baseKey]) {
                                seenNativeBaseUrls[baseKey] = true;
                                allStreams.push(st);
                            }
                        }
                    }
                    if (nRes && Array.isArray(nRes.subtitles)) allSubs = allSubs.concat(nRes.subtitles);
                }
                return { streams: allStreams, subtitles: allSubs };
            } catch (err) {
                console.error('[Freekz] Native engine error:', err);
            }
            return { streams: [], subtitles: [] };
        })();

        var subtitlesPromise = sleep(100).then(function() {
            return fetchSubtitles(tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate);
        });

        var vidstuckPromise = (async function() {
            try {
                var batch1 = await Promise.all([
                    fetchServerStream('atlas', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId),
                    fetchServerStream('ursa', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId)
                ]);

                await sleep(80);

                var batch2 = await Promise.all([
                    fetchServerStream('daedalus', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId),
                    fetchServerStream('orion', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId),
                    fetchServerStream('andromeda', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId)
                ]);

                var orionData = batch2[1];
                var extraDubs = [];

                if (orionData && Array.isArray(orionData.dubs) && orionData._tokenData) {
                    var prioritizedLangs = ['hi', 'es', 'fr', 'tl', 'ar'];
                    var audioDubs = orionData.dubs.filter(function(d) {
                        return d && d.type === 0 && !d.original;
                    }).sort(function(a, b) {
                        var aIdx = prioritizedLangs.indexOf(a.lanCode);
                        var bIdx = prioritizedLangs.indexOf(b.lanCode);
                        if (aIdx === -1) aIdx = 99;
                        if (bIdx === -1) bIdx = 99;
                        return aIdx - bIdx;
                    }).slice(0, 3);

                    if (audioDubs.length > 0) {
                        var dubFetches = audioDubs.map(function(dub) {
                            return fetchServerStream('orion', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId, dub.lanCode, dub.type, orionData._tokenData)
                                .then(function(res) {
                                    if (res && res.links && res.links[0]) {
                                        return { dub: dub, data: res };
                                    }
                                    return null;
                                }).catch(function() { return null; });
                        });
                        var dubRes = await Promise.all(dubFetches);
                        for (var dr = 0; dr < dubRes.length; dr++) {
                            if (dubRes[dr]) extraDubs.push(dubRes[dr]);
                        }
                    }
                }

                return {
                    servers: [batch1[0], batch1[1], batch2[0], batch2[1], batch2[2]],
                    extraDubs: extraDubs
                };
            } catch (vErr) {
                console.error('[Freekz] Vidstuck pipeline error:', vErr);
                return { servers: [], extraDubs: [] };
            }
        })();

        var nativeRes = await nativePromise;
        var serverSubtitles = await subtitlesPromise;
        var serverResults = await vidstuckPromise;

        var streams = [];
        var seenUrls = {};

        // Merge all subtitles
        var allSubtitles = [];
        var seenSubUrls = {};
        var combinedSubs = (nativeRes.subtitles || []).concat(serverSubtitles || []);
        for (var cs = 0; cs < combinedSubs.length; cs++) {
            var subObj = combinedSubs[cs];
            if (subObj && subObj.url && !seenSubUrls[subObj.url]) {
                seenSubUrls[subObj.url] = true;
                allSubtitles.push(subObj);
            }
        }

        // 1. Add Native Freekz Direct Streams
        if (nativeRes && Array.isArray(nativeRes.streams)) {
            for (var ns = 0; ns < nativeRes.streams.length; ns++) {
                var nStream = nativeRes.streams[ns];
                if (nStream && nStream.url && !seenUrls[nStream.url]) {
                    seenUrls[nStream.url] = true;
                    nStream.subtitles = allSubtitles;
                    streams.push(nStream);
                }
            }
        }

        // 2. Add Vidstuck CDN Server Streams
        var serverList = (serverResults && serverResults.servers) || [];
        var collectedItems = [];
        for (var i = 0; i < SERVERS.length; i++) {
            var server = SERVERS[i];
            var data = serverList[i];
            if (!data) continue;

            var payloadSubs = [];
            var rawServerSubs = data.subtitles || data.captions || [];
            for (var sIdx = 0; sIdx < rawServerSubs.length; sIdx++) {
                var rs = rawServerSubs[sIdx];
                var rsUrl = normalizeUrl(decryptLink(rs.file || rs.url || rs.link || '') || rs.file || rs.url || '');
                if (rsUrl && !seenSubUrls[rsUrl]) {
                    seenSubUrls[rsUrl] = true;
                    var rsLabel = (rs.display || rs.label || rs.language || rs.lang || 'English').trim();
                    payloadSubs.push({
                        url: rsUrl,
                        language: rsLabel,
                        lang: rsLabel,
                        name: rsLabel,
                        headers: {
                            'User-Agent': DEFAULT_HEADERS['User-Agent'],
                            'Referer': BACKEND_URL + '/'
                        }
                    });
                    allSubtitles.push(payloadSubs[payloadSubs.length - 1]);
                }
            }

            var dubEntries = Array.isArray(data.dubs) ? data.dubs : [];
            var dubCodes = [];
            var separateDubStreams = [];

            for (var dIdx = 0; dIdx < dubEntries.length; dIdx++) {
                var dub = dubEntries[dIdx];
                if (!dub) continue;
                var lInfo = getLangInfo(dub.lanCode || dub.language || dub.lang || dub.lanName || 'en');
                if (dubCodes.indexOf(lInfo.tag) === -1) dubCodes.push(lInfo.tag);

                var rawDubCipher = dub.link || dub.url || dub.file || '';
                if (rawDubCipher) {
                    var decDub = normalizeUrl(decryptLink(rawDubCipher));
                    if (decDub && decDub.indexOf('zxcstream.xyz') < 0) {
                        var dubFmt = classifyFormat(dub, decDub, server.format);
                        var dubQual = (dub.resolution && Number(dub.resolution) > 0) ? (dub.resolution + 'p') : server.defaultRes;
                        separateDubStreams.push({
                            serverId: server.id + '-' + lInfo.code,
                            serverName: server.name + ' (' + lInfo.name + ')',
                            url: decDub,
                            quality: dubQual,
                            type: dubFmt.type,
                            format: dubFmt.format,
                            audioTag: lInfo.tag,
                            audioCode: lInfo.code,
                            audioBadge: '[' + lInfo.tag + ']'
                        });
                    }
                }
            }

            var linksArray = Array.isArray(data.links) ? data.links : [];
            for (var j = 0; j < linksArray.length; j++) {
                var linkObj = linksArray[j];
                if (!linkObj || !linkObj.link) continue;
                var rawDecrypted = decryptLink(linkObj.link);
                if (!rawDecrypted || rawDecrypted.indexOf('zxcstream.xyz') >= 0) continue;

                var finalUrl = normalizeUrl(rawDecrypted);
                var fmtInfo = classifyFormat(linkObj, finalUrl, server.format);

                var quality = server.defaultRes || '1080p';
                if (linkObj.resolution && Number(linkObj.resolution) > 0) {
                    quality = linkObj.resolution + 'p';
                } else if (linkObj.quality) {
                    quality = String(linkObj.quality);
                } else if (linksArray.length > 1) {
                    quality = j === 0 ? '1080p' : (j === 1 ? '720p' : '480p');
                }

                var serverDisplayName = server.name;
                if (linksArray.length > 1 && !linkObj.resolution) {
                    serverDisplayName = server.name + ' (' + quality + ')';
                }

                var audioInfo = detectServerAudio(finalUrl, server);
                var mainAudioTag = audioInfo.tag;
                var mainAudioBadge = '[' + audioInfo.tag + ']';

                collectedItems.push({
                    serverId: server.id,
                    serverName: serverDisplayName,
                    url: finalUrl,
                    quality: quality,
                    type: fmtInfo.type,
                    format: fmtInfo.format,
                    audioTag: mainAudioTag,
                    audioCode: audioInfo.code || 'en',
                    audioBadge: mainAudioBadge
                });
            }

            for (var sd = 0; sd < separateDubStreams.length; sd++) {
                collectedItems.push(separateDubStreams[sd]);
            }
        }

        // Add dynamically fetched Orion audio dub streams
        if (serverResults && Array.isArray(serverResults.extraDubs)) {
            for (var edIdx = 0; edIdx < serverResults.extraDubs.length; edIdx++) {
                var edItem = serverResults.extraDubs[edIdx];
                if (!edItem || !edItem.dub || !edItem.data || !edItem.data.links || !edItem.data.links[0]) continue;
                var edDub = edItem.dub;
                var edLink = edItem.data.links[0];
                var rawDec = decryptLink(edLink.link);
                if (!rawDec || rawDec.indexOf('zxcstream.xyz') >= 0) continue;
                var finalUrl = normalizeUrl(rawDec);
                if (seenUrls[finalUrl]) continue;
                seenUrls[finalUrl] = true;

                var lInfo = getLangInfo(edDub.lanCode || edDub.lanName);
                var dubTitle = isMovie
                    ? (mediaTitle + ' (' + releaseYear + ') [' + lInfo.tag + '] - ' + PROVIDER_NAME + ' Orion [' + lInfo.name + ' Dub]')
                    : (mediaTitle + ' ' + epTag + ' [' + lInfo.tag + '] - ' + PROVIDER_NAME + ' Orion [' + lInfo.name + ' Dub]');

                var displayName = PROVIDER_NAME + ' | Orion (' + lInfo.name + ') • [' + lInfo.tag + ']';

                streams.push({
                    name: displayName,
                    title: dubTitle,
                    url: finalUrl,
                    quality: '1080p',
                    size: isMovie ? '2.0 GB' : '750 MB',
                    type: 'mpd',
                    format: 'dash',
                    container: 'dash',
                    isSequential: false,
                    provider: PROVIDER_ID,
                    language: lInfo.code || 'en',
                    headers: buildHeadersForStreamUrl(finalUrl),
                    subtitles: allSubtitles
                });
            }
        }

        for (var idx = 0; idx < collectedItems.length; idx++) {
            var item = collectedItems[idx];
            if (seenUrls[item.url]) continue;
            seenUrls[item.url] = true;

            var streamTitle = isMovie
                ? (mediaTitle + ' (' + releaseYear + ') ' + item.audioBadge + ' - ' + PROVIDER_NAME + ' ' + item.serverName + ' [' + item.quality + ']')
                : (mediaTitle + ' ' + epTag + ' ' + item.audioBadge + ' - ' + PROVIDER_NAME + ' ' + item.serverName + ' [' + item.quality + ']');

            var displayName = PROVIDER_NAME + ' | ' + item.serverName + ' • ' + item.audioBadge + ' (' + item.quality + ')';

            streams.push({
                name: displayName,
                title: streamTitle,
                url: item.url,
                quality: item.quality,
                size: isMovie ? '2.0 GB' : '750 MB',
                type: item.type,
                format: item.format,
                container: item.format === 'mp4' ? 'mp4' : (item.format === 'dash' ? 'dash' : 'hls'),
                isSequential: item.format === 'mp4',
                provider: PROVIDER_ID,
                language: item.audioCode || 'en',
                headers: buildHeadersForStreamUrl(item.url),
                subtitles: allSubtitles
            });
        }

        // 3. Fallback: Headless Browser.resolve if Direct APIs returned 0
        if (streams.length === 0) {
            var fallbackUrl = 'https://vidstuck.cc/embed/' + (isMovie ? 'movie/' + tmdbId : 'tv/' + tmdbId + '/' + sNum + '/' + eNum);
            try {
                var browserApi = (typeof Browser !== 'undefined' && Browser.resolve) ? Browser : ((typeof globalThis !== 'undefined' && globalThis.Browser && globalThis.Browser.resolve) ? globalThis.Browser : null);
                if (browserApi) {
                    var resolveRes = await browserApi.resolve({
                        url: fallbackUrl,
                        timeoutMs: 4000,
                        autoClickServers: true
                    });

                    if (resolveRes) {
                        var sniffedMedia = resolveRes.sniffedMedia || [];
                        var sniffedSubs = resolveRes.sniffedSubtitles || [];

                        for (var si = 0; si < sniffedSubs.length; si++) {
                            var sObj = sniffedSubs[si];
                            var subUrl = typeof sObj === 'string' ? sObj : (sObj && sObj.url);
                            if (subUrl && !allSubtitles.some(function(sub) { return sub.url === subUrl; })) {
                                var sLabel = (typeof sObj === 'object' && (sObj.lang || sObj.name)) || 'English';
                                allSubtitles.push({
                                    url: subUrl,
                                    language: sLabel,
                                    lang: sLabel,
                                    name: sLabel,
                                    headers: {
                                        'User-Agent': DEFAULT_HEADERS['User-Agent'],
                                        'Referer': BASE_URL + '/'
                                    }
                                });
                            }
                        }

                        for (var mi = 0; mi < sniffedMedia.length; mi++) {
                            var m = sniffedMedia[mi];
                            var rawMUrl = typeof m === 'string' ? m : (m && m.url);
                            if (!rawMUrl) continue;
                            var mUrl = normalizeUrl(rawMUrl);
                            if (seenUrls[mUrl] || mUrl.indexOf('zxcstream.xyz') >= 0) continue;
                            seenUrls[mUrl] = true;

                            var mQuality = '1080p';
                            var mLower = mUrl.toLowerCase();
                            if (mLower.indexOf('720') >= 0) mQuality = '720p';
                            else if (mLower.indexOf('480') >= 0) mQuality = '480p';

                            var fbFormat = mLower.indexOf('.mpd') >= 0 ? 'dash' : (mLower.indexOf('.mp4') >= 0 ? 'mp4' : 'hls');

                            streams.push({
                                name: PROVIDER_NAME + ' | Headless Sniffed • [ENG] (' + mQuality + ')',
                                title: isMovie
                                    ? (mediaTitle + ' (' + releaseYear + ') [ENG] - Freekz Browser [' + mQuality + ']')
                                    : (mediaTitle + ' ' + epTag + ' [ENG] - Freekz Browser [' + mQuality + ']'),
                                url: mUrl,
                                quality: mQuality,
                                size: isMovie ? '2.0 GB' : '750 MB',
                                type: fbFormat === 'dash' ? 'mpd' : (fbFormat === 'mp4' ? 'mp4' : 'm3u8'),
                                format: fbFormat,
                                container: fbFormat,
                                isSequential: fbFormat === 'mp4',
                                provider: PROVIDER_ID,
                                language: 'en',
                                headers: buildHeadersForStreamUrl(mUrl),
                                subtitles: allSubtitles
                            });
                        }
                    }
                }
            } catch (fallbackErr) {
                console.error('[Freekz] Browser fallback error:', fallbackErr);
            }
        }

        if (streams.length > 0) {
            STREAM_CACHE[cacheKey] = {
                timestamp: Date.now(),
                streams: streams
            };
        }

        console.log('[Freekz] Returning ' + streams.length + ' stream(s), ' + allSubtitles.length + ' subtitle(s)');
        return streams;
    } catch (fatal) {
        console.error('[Freekz] Fatal error in getStreams:', fatal);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams: getStreams
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
