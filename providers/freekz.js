/**
 * Freekz (StreamHub Native & Vidstuck Multi-Engine) Provider Plugin for Euthopiar
 *
 * Multi-Engine High-Speed Streaming Architecture:
 *  - Engine 1: Freekz StreamHub Native App Engine (Direct MP4 CDN + Fast-DL + Multi-Language Captions)
 *  - Engine 2: Vidstuck Multi-Server CDN Engine (Atlas, Ursa, Daedalus, Orion, Andromeda)
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

var KEY_TMDB = "a7f39c821d604e5b9c1e547b";
var KEY_TS = "61d9a5274c8e3b29f38c291e6";
var KEY_TOKEN = (typeof globalThis !== "undefined" && globalThis.FREEKZ_KEY_TOKEN) || (typeof __get_freekz_key_token === "function" && __get_freekz_key_token()) || "";
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

function pureMd5(str) {
    if (typeof CryptoJS !== 'undefined' && CryptoJS.MD5) {
        return CryptoJS.MD5(str).toString();
    }
    if (typeof globalThis !== 'undefined' && globalThis.CryptoJS && globalThis.CryptoJS.MD5) {
        return globalThis.CryptoJS.MD5(str).toString();
    }
    function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
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
        for (i = 64; i <= s.length; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
        s = s.substring(i - 64);
        var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
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
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    return hex(md51(str));
}

function generateMovieBoxClientToken() {
    var ts = Math.floor(Date.now() / 1000);
    var rev = String(ts).split('').reverse().join('');
    return ts + ',' + pureMd5(rev);
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 3000;
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
        }, 2500);

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
        }, 3000);

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

    var scoredOriginal = [];
    var scoredDubbed = [];

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.subjectId) continue;
        var itemClean = cleanTitle(item.title);
        var itemType = Number(item.subjectType);
        var score = 0;

        if (isTv) {
            if (itemType === 2) score += 400;
            else if (itemType === 1) score -= 500;
            else if (itemType === 6) score -= 800;

            if (season) {
                var sRegex = new RegExp('\\b(s0*' + season + '|season\\s*0*' + season + ')\\b', 'i');
                if (sRegex.test(item.title)) score += 300;
                else if (/\bs\d+\b/i.test(item.title)) score -= 300;
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
        if (score <= 0) continue;

        var dubText = (item.title || '') + ' ' + (item.corner || '');
        if (/hindi|dub|tamil|telugu|multi|dual/i.test(dubText)) {
            scoredDubbed.push({ item: item, score: score });
        } else {
            scoredOriginal.push({ item: item, score: score });
        }
    }

    scoredOriginal.sort(function(a, b) { return b.score - a.score; });
    scoredDubbed.sort(function(a, b) { return b.score - a.score; });

    var selected = [];
    if (scoredOriginal.length > 0) selected.push(scoredOriginal[0].item);
    if (scoredDubbed.length > 0) {
        var dubCand = scoredDubbed[0].item;
        var dubClean = cleanTitle(dubCand.title);
        if (dubClean.indexOf(cleanTarget) === 0 || cleanTarget.indexOf(dubClean.split(' ')[0]) === 0 || selected.length === 0) {
            selected.push(dubCand);
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

    var audioBadge = '[ENG]';
    var audioCode = 'en';
    var audioName = 'English';
    var candMeta = (candidate.title || '') + ' ' + (candidate.corner || '');
    if (/hindi|hin\b/i.test(candMeta)) {
        audioBadge = '[HIN]';
        audioCode = 'hi';
        audioName = 'Hindi';
    } else if (/multi|dual/i.test(candMeta)) {
        audioBadge = '[MULTI]';
        audioCode = 'multi';
        audioName = 'Multi';
    }

    var playUrl = NATIVE_API_BASE + '/subject/play?subjectId=' + subjectId + '&se=' + se + '&ep=' + ep + (detailPath ? '&detailPath=' + encodeURIComponent(detailPath) : '');
    var dlUrl = NATIVE_API_BASE + '/subject/download?subjectId=' + subjectId + '&se=' + se + '&ep=' + ep + (detailPath ? '&detailPath=' + encodeURIComponent(detailPath) : '');

    var nativeCalls = await Promise.allSettled([
        fetchWithTimeout(playUrl, { headers: headers }, 3000),
        fetchWithTimeout(dlUrl, { headers: headers }, 3000)
    ]);

    if (nativeCalls[0].status === 'fulfilled' && nativeCalls[0].value.ok) {
        try {
            var pData = await nativeCalls[0].value.json();
            if (pData && pData.data && Array.isArray(pData.data.streams)) {
                var sortedPlay = pData.data.streams.filter(function(s) { return s && s.url && s.url.indexOf('http') === 0; })
                    .sort(function(a, b) { return (Number(b.resolutions) || 0) - (Number(a.resolutions) || 0); });
                for (var pi = 0; pi < sortedPlay.length; pi++) {
                    var s = sortedPlay[pi];
                    if (!s || !s.url || seenUrls[s.url]) continue;
                    seenUrls[s.url] = true;
                    var qual = s.resolutions ? (s.resolutions + 'p') : '1080p';
                    var sizeStr = s.size ? (Math.round(s.size / (1024 * 1024)) + ' MB') : (isTv ? '750 MB' : '2.0 GB');
                    var streamTitle = isTv
                        ? (mediaTitle + ' ' + epTag + ' ' + audioBadge + ' - Freekz StreamHub Direct [' + qual + ']')
                        : (mediaTitle + ' (' + releaseYear + ') ' + audioBadge + ' - Freekz StreamHub Direct [' + qual + ']');

                    streams.push({
                        name: 'Freekz | StreamHub › Direct MP4 • ' + audioBadge + ' (' + qual + ')',
                        title: streamTitle,
                        rawTitle: candidate.title || streamTitle,
                        description: ['Direct MP4', qual, sizeStr, audioName].join(' • '),
                        url: s.url,
                        quality: qual,
                        isAdaptive: false,
                        streamType: 'Direct MP4',
                        size: sizeStr,
                        type: 'mp4',
                        format: 'mp4',
                        container: 'mp4',
                        isSequential: true,
                        provider: PROVIDER_ID,
                        server: 'StreamHub',
                        subServer: 'Direct MP4',
                        language: audioCode,
                        audio: { isMulti: audioCode === 'multi', primary: audioName, tag: audioBadge.replace(/[\[\]]/g, ''), badge: audioBadge },
                        headers: streamHeaders,
                        subtitles: []
                    });
                }
            }
        } catch (_) {}
    }

    if (nativeCalls[1].status === 'fulfilled' && nativeCalls[1].value.ok) {
        try {
            var dData = await nativeCalls[1].value.json();
            if (dData && dData.data && Array.isArray(dData.data.downloads)) {
                var sortedDl = dData.data.downloads.filter(function(d) { return d && d.url && d.url.indexOf('http') === 0 && !seenUrls[d.url]; })
                    .sort(function(a, b) { return (Number(b.resolution) || 0) - (Number(a.resolution) || 0); });
                for (var di = 0; di < sortedDl.length; di++) {
                    var d = sortedDl[di];
                    if (!d || !d.url || seenUrls[d.url]) continue;
                    seenUrls[d.url] = true;
                    var dQual = d.resolution ? (d.resolution + 'p') : '1080p';
                    var dSize = d.size ? (Math.round(d.size / (1024 * 1024)) + ' MB') : (isTv ? '750 MB' : '2.0 GB');
                    var dTitle = isTv
                        ? (mediaTitle + ' ' + epTag + ' ' + audioBadge + ' - Freekz Fast-DL Direct [' + dQual + ']')
                        : (mediaTitle + ' (' + releaseYear + ') ' + audioBadge + ' - Freekz Fast-DL Direct [' + dQual + ']');

                    streams.push({
                        name: 'Freekz | Fast-DL › Direct MP4 • ' + audioBadge + ' (' + dQual + ')',
                        title: dTitle,
                        rawTitle: candidate.title || dTitle,
                        description: ['Direct MP4', dQual, dSize, audioName].join(' • '),
                        url: d.url,
                        quality: dQual,
                        isAdaptive: false,
                        streamType: 'Direct MP4',
                        size: dSize,
                        type: 'mp4',
                        format: 'mp4',
                        container: 'mp4',
                        isSequential: true,
                        provider: PROVIDER_ID,
                        server: 'Fast-DL',
                        subServer: 'Direct MP4',
                        language: audioCode,
                        audio: { isMulti: audioCode === 'multi', primary: audioName, tag: audioBadge.replace(/[\[\]]/g, ''), badge: audioBadge },
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
        } catch (_) {}
    }

    return { streams: streams, subtitles: subtitles };
}

var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' }, 'eng': { name: 'English', tag: 'ENG' },
    'hi': { name: 'Hindi', tag: 'HIN' }, 'hin': { name: 'Hindi', tag: 'HIN' },
    'es': { name: 'Spanish', tag: 'SPA' }, 'spa': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' }, 'fra': { name: 'French', tag: 'FRA' },
    'de': { name: 'German', tag: 'GER' }, 'ger': { name: 'German', tag: 'GER' },
    'it': { name: 'Italian', tag: 'ITA' }, 'ita': { name: 'Italian', tag: 'ITA' },
    'ja': { name: 'Japanese', tag: 'JPN' }, 'jpn': { name: 'Japanese', tag: 'JPN' },
    'ko': { name: 'Korean', tag: 'KOR' }, 'kor': { name: 'Korean', tag: 'KOR' },
    'pt': { name: 'Portuguese', tag: 'POR' }, 'por': { name: 'Portuguese', tag: 'POR' },
    'ru': { name: 'Russian', tag: 'RUS' }, 'rus': { name: 'Russian', tag: 'RUS' },
    'ta': { name: 'Tamil', tag: 'TAM' }, 'tam': { name: 'Tamil', tag: 'TAM' },
    'te': { name: 'Telugu', tag: 'TEL' }, 'tel': { name: 'Telugu', tag: 'TEL' },
    'ar': { name: 'Arabic', tag: 'ARA' }, 'zh': { name: 'Chinese', tag: 'CHI' },
    'tl': { name: 'Tagalog', tag: 'TGL' }, 'tgl': { name: 'Tagalog', tag: 'TGL' },
    'esla': { name: 'Latin Spanish', tag: 'SPA' }, 'ptbr': { name: 'Brazilian Portuguese', tag: 'POR' }
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
    return { name: String(codeOrName), tag: lower.slice(0, 3).toUpperCase(), code: lower.slice(0, 2) };
}

var SERVERS = [
    { id: "atlas", name: "Atlas", format: "m3u8", defaultRes: "1080p", audioTag: "ENG" },
    { id: "ursa", name: "Ursa", format: "m3u8", defaultRes: "1080p", audioTag: "ENG" },
    { id: "daedalus", name: "Daedalus", format: "m3u8", defaultRes: "1080p", audioTag: "ENG" },
    { id: "orion", name: "Orion", format: "mpd", defaultRes: "1080p", audioTag: "ENG" },
    { id: "andromeda", name: "Andromeda", format: "mpd", defaultRes: "1080p", audioTag: "ENG" }
];

function detectServerAudio(url, server, dubInfo) {
    if (dubInfo && (dubInfo.lanCode || dubInfo.lanName)) {
        return getLangInfo(dubInfo.lanCode || dubInfo.lanName);
    }
    var clean = (url || '').toLowerCase();
    if (clean.indexOf('hindi') >= 0 || clean.indexOf('_hin') >= 0 || clean.indexOf('/hin') >= 0) return getLangInfo('hi');
    if (clean.indexOf('french') >= 0 || clean.indexOf('_fra') >= 0 || clean.indexOf('/fra') >= 0) return getLangInfo('fr');
    if (clean.indexOf('spanish') >= 0 || clean.indexOf('_spa') >= 0 || clean.indexOf('/spa') >= 0) return getLangInfo('es');
    if (clean.indexOf('tamil') >= 0 || clean.indexOf('_tam') >= 0 || clean.indexOf('/tam') >= 0) return getLangInfo('ta');
    if (clean.indexOf('telugu') >= 0 || clean.indexOf('_tel') >= 0 || clean.indexOf('/tel') >= 0) return getLangInfo('te');
    if (clean.indexOf('russian') >= 0 || clean.indexOf('_rus') >= 0 || clean.indexOf('/rus') >= 0) return getLangInfo('ru');
    if (server && server.audioTag && server.audioTag !== 'MULTI') return getLangInfo(server.audioTag);
    return getLangInfo('en');
}

function decryptLink(cipherText) {
    if (!cipherText || typeof cipherText !== 'string') return null;
    var trimmed = cipherText.trim();
    if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0 || trimmed.indexOf('/') === 0) {
        return trimmed;
    }
    try {
        var cryptoObj = (typeof CryptoJS !== 'undefined' && CryptoJS.AES) ? CryptoJS : ((typeof globalThis !== 'undefined' && globalThis.CryptoJS && globalThis.CryptoJS.AES) ? globalThis.CryptoJS : null);
        if (cryptoObj && cryptoObj.AES && cryptoObj.enc && cryptoObj.enc.Utf8) {
            var utf8Str = cryptoObj.AES.decrypt(trimmed, AES_PASSPHRASE).toString(cryptoObj.enc.Utf8);
            if (utf8Str && (utf8Str.indexOf('http://') === 0 || utf8Str.indexOf('https://') === 0 || utf8Str.indexOf('/') === 0)) {
                return utf8Str;
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
    if (rawUrl.indexOf('.m3u8') >= 0 || format === 'm3u8' || format === 'hls') return { type: 'm3u8', format: 'hls' };
    if (rawUrl.indexOf('.mpd') >= 0 || format === 'mpd' || format === 'dash') return { type: 'mpd', format: 'dash' };
    if (rawUrl.indexOf('.mp4') >= 0 || format === 'mp4') return { type: 'mp4', format: 'mp4' };
    return defaultFormat === 'mpd' ? { type: 'mpd', format: 'dash' } : { type: 'm3u8', format: 'hls' };
}

function buildHeadersForStreamUrl(url) {
    var lower = String(url || '').toLowerCase();
    if (lower.indexOf('hakunaymatata.com') >= 0 || lower.indexOf('aoneroom.com') >= 0 || lower.indexOf(NATIVE_HOST) >= 0) {
        return { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': 'https://' + NATIVE_HOST + '/' };
    }
    if (lower.indexOf('akamai') >= 0 || lower.indexOf('fastly') >= 0) {
        return { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Origin': BASE_URL, 'Referer': BASE_URL + '/' };
    }
    if (lower.indexOf('cloudfront') >= 0) {
        return { 'User-Agent': DEFAULT_HEADERS['User-Agent'] };
    }
    return { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': BACKEND_URL + '/', 'Origin': BACKEND_URL };
}

async function fetchSubtitles(tmdbId, effectiveType, season, episode, title, year, date, latestDate) {
    if (!KEY_TOKEN) return [];
    try {
        var tokenPayload = { [KEY_TMDB]: String(tmdbId), [KEY_TYPE]: effectiveType, [KEY_SERVER]: 'subtitle' };
        if (effectiveType === 'tv') {
            tokenPayload[KEY_SEASON] = Number(season);
            tokenPayload[KEY_EPISODE] = Number(episode);
        }
        var tokenRes = await fetchWithTimeout(BACKEND_URL + '/backend/zxc', {
            method: 'POST',
            headers: DEFAULT_HEADERS,
            body: JSON.stringify(tokenPayload)
        }, 2200);
        if (!tokenRes.ok) return [];
        var tokenData = await tokenRes.json();
        if (!tokenData || !tokenData.token || !tokenData.ts) return [];

        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId), [KEY_TYPE]: effectiveType, [KEY_SERVER]: 'subtitle',
            [KEY_TS]: String(tokenData.ts), [KEY_TOKEN]: tokenData.token,
            [KEY_TITLE]: title, [KEY_YEAR]: year, [KEY_DATE]: date
        });
        if (latestDate) params.set(KEY_LATEST_DATE, latestDate);
        if (effectiveType === 'tv') {
            params.set(KEY_SEASON, String(season));
            params.set(KEY_EPISODE, String(episode));
        }
        var subRes = await fetchWithTimeout(BACKEND_URL + '/backend/subtitle?' + params.toString(), {
            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': BACKEND_URL + '/', 'Accept': 'application/json' }
        }, 1800);
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
                url: resolvedFile, language: label, lang: label, name: label,
                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': BASE_URL + '/' }
            });
        }
        return results;
    } catch (_) {
        return [];
    }
}

async function fetchServerStream(serverId, tmdbId, effectiveType, season, episode, title, year, date, latestDate, imdbId, dubCode, dubType, tokenOverride) {
    if (!KEY_TOKEN) return null;
    try {
        var tokenData = tokenOverride;
        if (!tokenData) {
            var tokenPayload = { [KEY_TMDB]: String(tmdbId), [KEY_TYPE]: effectiveType, [KEY_SERVER]: serverId };
            if (effectiveType === 'tv') {
                tokenPayload[KEY_SEASON] = Number(season);
                tokenPayload[KEY_EPISODE] = Number(episode);
            }
            var tokenRes = await fetchWithTimeout(BACKEND_URL + '/backend/zxc', {
                method: 'POST', headers: DEFAULT_HEADERS, body: JSON.stringify(tokenPayload)
            }, 2200);
            if (!tokenRes.ok) return null;
            tokenData = await tokenRes.json();
            if (!tokenData || !tokenData.token || !tokenData.ts) return null;
        }

        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId), [KEY_TYPE]: effectiveType, [KEY_SERVER]: serverId,
            [KEY_TS]: String(tokenData.ts), [KEY_TOKEN]: tokenData.token,
            [KEY_TITLE]: title, [KEY_YEAR]: year, [KEY_DATE]: date
        });
        if (latestDate) params.set(KEY_LATEST_DATE, latestDate);
        if (effectiveType === 'tv') { params.set(KEY_SEASON, String(season)); params.set(KEY_EPISODE, String(episode)); }
        if (imdbId) params.set(KEY_IMDB, imdbId);
        if (dubCode) { params.set('dubCode', String(dubCode)); params.set('dubType', String(dubType || 0)); }

        var streamRes = await fetchWithTimeout(BACKEND_URL + '/backend/servers/' + serverId + '?' + params.toString(), {
            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': BACKEND_URL + '/', 'Accept': 'application/json' }
        }, 2500);
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

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    try {
        var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
        extraArgs = Object.assign({}, callArgs, extraArgs || {});

        if (!tmdbId) return [];

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

        if (!mediaTitle) {
            try {
                var fbRes = await fetchWithTimeout(TMDB_PROXY_URL + '/' + effectiveType + '/' + tmdbId, {
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                }, 2500);
                if (fbRes.ok) {
                    var fb = await fbRes.json();
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
                var candResults = await Promise.all(cands.map(function(c) {
                    return fetchNativeStreams(c, !isMovie, sNum, eNum, mediaTitle, releaseYear);
                }));
                var allStreams = [];
                var allSubs = [];
                var seenNativeBaseUrls = {};
                for (var cr = 0; cr < candResults.length; cr++) {
                    var nRes = candResults[cr];
                    if (nRes && Array.isArray(nRes.streams)) {
                        for (var nsi = 0; nsi < nRes.streams.length; nsi++) {
                            var st = nRes.streams[nsi];
                            var baseKey = (st.url || '').split('?')[0] + '|' + st.language;
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
                return { streams: [], subtitles: [] };
            }
        })();

        var subtitlesPromise = KEY_TOKEN
            ? fetchSubtitles(tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate)
            : Promise.resolve([]);

        var vidstuckPromise = KEY_TOKEN ? (async function() {
            try {
                var serverResults = await Promise.all(SERVERS.map(function(srv) {
                    return fetchServerStream(srv.id, tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId);
                }));
                return { servers: serverResults };
            } catch (_) {
                return { servers: [] };
            }
        })() : Promise.resolve({ servers: [] });

        var settled = await Promise.all([nativePromise, subtitlesPromise, vidstuckPromise]);
        var nativeRes = settled[0];
        var serverSubtitles = settled[1];
        var serverResults = settled[2];

        var streams = [];
        var seenUrls = {};
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

        var serverList = (serverResults && serverResults.servers) || [];
        for (var i = 0; i < SERVERS.length; i++) {
            var server = SERVERS[i];
            var data = serverList[i];
            if (!data) continue;

            var linksArray = Array.isArray(data.links) ? data.links : [];
            for (var j = 0; j < linksArray.length; j++) {
                var linkObj = linksArray[j];
                if (!linkObj || !linkObj.link) continue;
                var rawDecrypted = decryptLink(linkObj.link);
                if (!rawDecrypted || rawDecrypted.indexOf('zxcstream.xyz') >= 0) continue;

                var finalUrl = normalizeUrl(rawDecrypted);
                if (seenUrls[finalUrl]) continue;
                seenUrls[finalUrl] = true;

                var fmtInfo = classifyFormat(linkObj, finalUrl, server.format);
                var quality = linkObj.resolution ? (linkObj.resolution + 'p') : (linkObj.quality || server.defaultRes);
                var audioInfo = detectServerAudio(finalUrl, server);
                var isAdapt = fmtInfo.format === 'hls' || fmtInfo.format === 'dash';
                var stLabel = fmtInfo.format === 'dash' ? 'Adaptive DASH' : (isAdapt ? 'Adaptive HLS' : 'Direct MP4');

                var streamTitle = isMovie
                    ? (mediaTitle + ' (' + releaseYear + ') [' + audioInfo.tag + '] - ' + PROVIDER_NAME + ' ' + server.name + ' [' + quality + ']')
                    : (mediaTitle + ' ' + epTag + ' [' + audioInfo.tag + '] - ' + PROVIDER_NAME + ' ' + server.name + ' [' + quality + ']');

                streams.push({
                    name: PROVIDER_NAME + ' | Vidstuck › ' + server.name + ' • [' + audioInfo.tag + '] (' + quality + ')',
                    title: streamTitle,
                    rawTitle: streamTitle,
                    description: [stLabel, quality, audioInfo.name].join(' • '),
                    url: finalUrl,
                    quality: quality,
                    isAdaptive: isAdapt,
                    streamType: stLabel,
                    size: isMovie ? '2.0 GB' : '750 MB',
                    type: fmtInfo.type,
                    format: fmtInfo.format,
                    container: fmtInfo.format === 'mp4' ? 'mp4' : (fmtInfo.format === 'dash' ? 'dash' : 'hls'),
                    isSequential: fmtInfo.format === 'mp4',
                    provider: PROVIDER_ID,
                    server: 'Vidstuck',
                    subServer: server.name,
                    language: audioInfo.code || 'en',
                    audio: { isMulti: false, primary: audioInfo.name, tag: audioInfo.tag, badge: '[' + audioInfo.tag + ']' },
                    headers: buildHeadersForStreamUrl(finalUrl),
                    subtitles: allSubtitles
                });
            }
        }

        if (streams.length > 0) {
            STREAM_CACHE[cacheKey] = { timestamp: Date.now(), streams: streams };
        }

        console.log('[Freekz] Returning ' + streams.length + ' stream(s), ' + allSubtitles.length + ' subtitle(s)');
        return streams;
    } catch (fatal) {
        console.error('[Freekz] Fatal error in getStreams:', fatal);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
