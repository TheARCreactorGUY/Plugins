/**
 * FMovies Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dual-backend parallel aggregator powering ww7-fmovies.com:
 *   1. Vidnest (OneHD, FlixHQ, YFlix, Rogflix, Vidzee, AllMovies) with WebCrypto AES-GCM decryption
 *   2. Vidrock (Lyra, Elara, Solara, Aether, Altair, Vega) with WebCrypto AES-GCM decryption
 * Includes disguised-HLS (#EXTM3U over text/html) aware health verification,
 * single-resolution vs Adaptive HLS detection, and cross-server VTT subtitles.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://ww7-fmovies.com';
var VIDNEST_ORIGIN = 'https://vidnest.fun';
var VIDNEST_API_BASE = 'https://new.vidnest.fun';
var VIDROCK_ORIGIN = 'https://vidrock.net';
var VIDROCK_API_BASE = 'https://vidrock.net/api';
var SUB_VDRK_URL = 'https://sub.vdrk.site/v2';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var VIDNEST_KEY_SALT = '|K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2';
var VIDROCK_HEX_KEY = '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f';

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL
};

var DEAD_HOST_REGEX = /vercetti\.org|ngcloud\.app|busycdn|rtmark|shortlink/i;

var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG', code: 'en' },
    'eng': { name: 'English', tag: 'ENG', code: 'en' },
    'english': { name: 'English', tag: 'ENG', code: 'en' },
    'hi': { name: 'Hindi', tag: 'HIN', code: 'hi' },
    'hin': { name: 'Hindi', tag: 'HIN', code: 'hi' },
    'hindi': { name: 'Hindi', tag: 'HIN', code: 'hi' },
    'ja': { name: 'Japanese', tag: 'JPN', code: 'ja' },
    'jpn': { name: 'Japanese', tag: 'JPN', code: 'ja' },
    'japanese': { name: 'Japanese', tag: 'JPN', code: 'ja' },
    'ko': { name: 'Korean', tag: 'KOR', code: 'ko' },
    'kor': { name: 'Korean', tag: 'KOR', code: 'ko' },
    'korean': { name: 'Korean', tag: 'KOR', code: 'ko' },
    'es': { name: 'Spanish', tag: 'SPA', code: 'es' },
    'spa': { name: 'Spanish', tag: 'SPA', code: 'es' },
    'spanish': { name: 'Spanish', tag: 'SPA', code: 'es' },
    'fr': { name: 'French', tag: 'FRA', code: 'fr' },
    'fra': { name: 'French', tag: 'FRA', code: 'fr' },
    'french': { name: 'French', tag: 'FRA', code: 'fr' },
    'de': { name: 'German', tag: 'GER', code: 'de' },
    'ger': { name: 'German', tag: 'GER', code: 'de' },
    'german': { name: 'German', tag: 'GER', code: 'de' },
    'it': { name: 'Italian', tag: 'ITA', code: 'it' },
    'ita': { name: 'Italian', tag: 'ITA', code: 'it' },
    'italian': { name: 'Italian', tag: 'ITA', code: 'it' },
    'ta': { name: 'Tamil', tag: 'TAM', code: 'ta' },
    'tam': { name: 'Tamil', tag: 'TAM', code: 'ta' },
    'tamil': { name: 'Tamil', tag: 'TAM', code: 'ta' },
    'te': { name: 'Telugu', tag: 'TEL', code: 'te' },
    'tel': { name: 'Telugu', tag: 'TEL', code: 'te' },
    'telugu': { name: 'Telugu', tag: 'TEL', code: 'te' },
    'zh': { name: 'Chinese', tag: 'CHI', code: 'zh' },
    'chi': { name: 'Chinese', tag: 'CHI', code: 'zh' },
    'chinese': { name: 'Chinese', tag: 'CHI', code: 'zh' },
    'ru': { name: 'Russian', tag: 'RUS', code: 'ru' },
    'rus': { name: 'Russian', tag: 'RUS', code: 'ru' },
    'russian': { name: 'Russian', tag: 'RUS', code: 'ru' },
    'pt': { name: 'Portuguese', tag: 'POR', code: 'pt' },
    'por': { name: 'Portuguese', tag: 'POR', code: 'pt' },
    'portuguese': { name: 'Portuguese', tag: 'POR', code: 'pt' },
    'ar': { name: 'Arabic', tag: 'ARA', code: 'ar' },
    'ara': { name: 'Arabic', tag: 'ARA', code: 'ar' },
    'arabic': { name: 'Arabic', tag: 'ARA', code: 'ar' },
    'multi': { name: 'Multi', tag: 'MULTI', code: 'multi' }
};

function getLanguageInfo(code, fallbackCode) {
    var raw = String(code || '').trim();
    var lower = raw.toLowerCase();
    if (!lower || lower === 'original') {
        lower = String(fallbackCode || 'en').toLowerCase().trim();
    }
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    return {
        name: lower.charAt(0).toUpperCase() + lower.slice(1),
        tag: lower.slice(0, 3).toUpperCase(),
        code: lower.slice(0, 2)
    };
}

function normalizeQualityLabel(raw) {
    var q = String(raw || '').trim();
    if (!q || /^auto$/i.test(q)) return 'Auto';
    if (/2160|4k|uhd/i.test(q)) return '4K 2160p';
    if (/1440|2k/i.test(q)) return '1440p';
    if (/1080/i.test(q)) return '1080p';
    if (/720/i.test(q)) return '720p';
    if (/480|576/i.test(q)) return '480p';
    if (/360/i.test(q)) return '360p';
    if (/^\d{3,4}$/.test(q)) return q + 'p';
    return q;
}

function inferQualityFromUrl(urlStr, fallbackQuality) {
    var m = String(urlStr || '').match(/\/(2160|1440|1080|720|480|360)p?(?:\/|_|\.)/i);
    if (m) return normalizeQualityLabel(m[1]);
    return normalizeQualityLabel(fallbackQuality || 'Auto');
}

function bucketResolution(width, height) {
    var w = parseInt(width, 10) || 0;
    var h = parseInt(height, 10) || 0;
    if (w >= 3500 || h >= 2000) return '4K 2160p';
    if (w >= 2300 || h >= 1300) return '1440p';
    if (w >= 1700 || h >= 950) return '1080p';
    if (w >= 1100 || h >= 600) return '720p';
    if (w >= 700 || h >= 420) return '480p';
    return '360p';
}

function extractMediaTags(text) {
    var upper = String(text || '').toUpperCase();
    var sourceType = null;
    if (/\bREMUX\b/.test(upper)) sourceType = 'REMUX';
    else if (/\bBLU-?RAY\b|\bBDRIP\b/.test(upper)) sourceType = 'BluRay';
    else if (/\bWEB-?DL\b/.test(upper)) sourceType = 'WEB-DL';
    else if (/\bWEBRIP\b/.test(upper)) sourceType = 'WEBRip';
    else if (/\bHDRIP\b/.test(upper)) sourceType = 'HDRip';

    var hdrType = null;
    if (/DOLBY\s*VISION|\bDOVI\b|\bDV\b/.test(upper)) hdrType = 'DV';
    else if (/HDR10\+|HDR10PLUS/.test(upper)) hdrType = 'HDR10+';
    else if (/HDR10/.test(upper)) hdrType = 'HDR10';
    else if (/\bHLG\b/.test(upper)) hdrType = 'HLG';
    else if (/\bHDR\b/.test(upper)) hdrType = 'HDR';

    var codec = null;
    if (/\bAV1\b/.test(upper)) codec = 'AV1';
    else if (/\b(?:HEVC|H\.?265|X265)\b/.test(upper)) codec = 'HEVC';
    else if (/\b(?:AVC|H\.?264|X264)\b/.test(upper)) codec = 'AVC';
    else if (/\bVP9\b/.test(upper)) codec = 'VP9';

    var bitDepth = /\b10[- ]?BIT\b/.test(upper) ? '10bit' : null;

    var audioFormat = null;
    var hasAtmos = /\bATMOS\b/.test(upper);
    var has71 = /\b7\.1\b/.test(upper);
    var has51 = /\b5\.1\b/.test(upper);
    if (hasAtmos) audioFormat = has71 ? 'Dolby Atmos 7.1' : (has51 ? 'Dolby Atmos 5.1' : 'Dolby Atmos');
    else if (/\bTRUE-?HD\b/.test(upper)) audioFormat = has71 ? 'TrueHD 7.1' : 'TrueHD';
    else if (/\b(?:DDP|DD\+|EAC3|E-AC-3)\b/.test(upper)) audioFormat = has51 ? 'DDP 5.1' : 'DDP';
    else if (/\bDTS\b/.test(upper)) audioFormat = has51 ? 'DTS 5.1' : 'DTS';

    var tags = [];
    if (sourceType) tags.push(sourceType);
    if (hdrType) tags.push(hdrType);
    if (codec) tags.push(codec);
    if (bitDepth) tags.push(bitDepth);
    if (audioFormat) tags.push(audioFormat);
    return { sourceType: sourceType, hdrType: hdrType, codec: codec, bitDepth: bitDepth, audioFormat: audioFormat, tags: tags };
}

function utf8ToBytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var escaped = encodeURIComponent(str);
    var out = [];
    for (var i = 0; i < escaped.length; i++) {
        if (escaped.charAt(i) === '%') {
            out.push(parseInt(escaped.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            out.push(escaped.charCodeAt(i));
        }
    }
    return new Uint8Array(out);
}

function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
        s += '%' + ('0' + (bytes[i] & 0xff).toString(16)).slice(-2);
    }
    return decodeURIComponent(s);
}

function base64UrlToBytes(b64url) {
    var b64 = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
}

function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function generateNonceBase64Url() {
    var bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (var i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
    }
    var bin = '';
    for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function decryptVidnestPayload(d, n) {
    var keyBytes = await crypto.subtle.digest('SHA-256', utf8ToBytes(n + VIDNEST_KEY_SALT));
    var aesKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    var raw = base64UrlToBytes(d);
    var iv = raw.slice(0, 12);
    var ciphertext = raw.slice(12);
    var plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, ciphertext);
    return JSON.parse(bytesToUtf8(new Uint8Array(plainBuf)));
}

var cachedVidrockKey = null;
async function decryptVidrockUrl(encryptedUrl) {
    if (!cachedVidrockKey) {
        cachedVidrockKey = await crypto.subtle.importKey(
            'raw',
            hexToBytes(VIDROCK_HEX_KEY),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
    }
    var raw = base64UrlToBytes(encryptedUrl);
    var iv = raw.slice(0, 12);
    var ciphertext = raw.slice(12);
    var plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, cachedVidrockKey, ciphertext);
    return bytesToUtf8(new Uint8Array(plainBuf));
}

function unwrapProxyPath(rawUrl, fallbackHeaders) {
    if (!rawUrl || typeof rawUrl !== 'string') return { url: rawUrl, headers: fallbackHeaders };
    var match = rawUrl.match(/^\/(?:hls|sub)\/([^\/]+)/);
    if (match) {
        try {
            var jsonStr = bytesToUtf8(base64UrlToBytes(match[1]));
            var obj = JSON.parse(jsonStr);
            if (obj && typeof obj.u === 'string' && obj.u.indexOf('http') === 0) {
                var merged = Object.assign({ 'User-Agent': USER_AGENT }, fallbackHeaders || {}, obj.h || {});
                return { url: obj.u, headers: merged };
            }
        } catch (e) {}
        return { url: VIDNEST_API_BASE + rawUrl, headers: fallbackHeaders };
    }
    if (rawUrl.charAt(0) === '/') {
        return { url: VIDNEST_API_BASE + rawUrl, headers: fallbackHeaders };
    }
    return { url: rawUrl, headers: fallbackHeaders };
}

async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 2800;
    var timer;
    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error('Request timeout (' + timeoutMs + 'ms)'));
        }, timeoutMs);
    });
    try {
        var res = await Promise.race([fetch(url, options), timeoutPromise]);
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title || !year) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var metaRes = await fetchWithTimeout(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, {
                headers: DEFAULT_HEADERS
            }, 2000);
            if (metaRes.ok) {
                var meta = await metaRes.json();
                title = title || meta.title || meta.name || '';
                var relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? relDate.substring(0, 4) : '');
                origLang = origLang || meta.original_language || '';
            }
        } catch (e) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
}

function buildTitlePrefix(mediaType, meta, season, episode) {
    if (mediaType !== 'movie') {
        var epTag = 'S' + String(season || 1).padStart(2, '0') + 'E' + String(episode || 1).padStart(2, '0');
        return meta.title + ' ' + epTag;
    }
    return meta.title + (meta.year ? ' (' + meta.year + ')' : '');
}

async function queryVidnest(tmdbId, mediaType, season, episode, meta) {
    var streams = [];
    var subtitles = [];
    var apiHeaders = {
        'User-Agent': USER_AGENT,
        'Referer': VIDNEST_ORIGIN + '/',
        'Origin': VIDNEST_ORIGIN
    };
    var vidnestServers = [
        { id: 'onehd', label: 'OneHD' },
        { id: 'flixhq', label: 'FlixHQ' },
        { id: 'yflix', label: 'YFlix' },
        { id: 'rogflix', label: 'Rogflix' },
        { id: 'vidzee', label: 'Vidzee' },
        { id: 'allmovies', label: 'AllMovies' }
    ];
    var titlePrefix = buildTitlePrefix(mediaType, meta, season, episode);
    var pathTail = mediaType === 'movie'
        ? ('/movie/' + encodeURIComponent(tmdbId))
        : ('/tv/' + encodeURIComponent(tmdbId) + '/' + (season || 1) + '/' + (episode || 1));

    var jobs = vidnestServers.map(async function(srv) {
        try {
            var nonce = generateNonceBase64Url();
            var url = VIDNEST_API_BASE + '/' + srv.id + pathTail + '?_n=' + encodeURIComponent(nonce);
            var res = await fetchWithTimeout(url, { headers: apiHeaders }, 2400);
            if (!res.ok) return;
            var body = await res.json();
            if (!body || !body.d || !body.n) return;

            var dec = await decryptVidnestPayload(body.d, body.n);
            if (!dec) return;

            if (Array.isArray(dec.subtitles)) {
                for (var sIdx = 0; sIdx < dec.subtitles.length; sIdx++) {
                    var sub = dec.subtitles[sIdx];
                    if (!sub || !sub.url) continue;
                    var unwrappedSub = unwrapProxyPath(sub.url, apiHeaders);
                    var sLabel = sub.lang || sub.label || 'English';
                    subtitles.push({
                        url: unwrappedSub.url,
                        language: sLabel,
                        lang: sLabel,
                        name: sLabel,
                        headers: unwrappedSub.headers
                    });
                }
            }

            var rawList = [];
            if (Array.isArray(dec.streams)) {
                rawList = dec.streams;
            } else if (Array.isArray(dec.sources)) {
                rawList = dec.sources;
            } else if (dec.url) {
                rawList = [{
                    url: dec.url,
                    quality: dec.quality || 'Auto',
                    type: dec.type || 'hls',
                    headers: dec.headers || null,
                    language: dec.language || meta.originalLanguage
                }];
            }

            for (var i = 0; i < rawList.length; i++) {
                var item = rawList[i];
                if (!item || !item.url || DEAD_HOST_REGEX.test(item.url)) continue;

                var playHeaders = Object.assign({ 'User-Agent': USER_AGENT }, dec.headers || {}, item.headers || {});
                var unwrapped = unwrapProxyPath(item.url, playHeaders);
                if (!unwrapped.url || unwrapped.url.indexOf('http') !== 0) continue;

                var lowerUrl = unwrapped.url.toLowerCase();
                var isMkv = item.type === 'mkv' || /\.mkv(?:\?|$)/i.test(lowerUrl);
                var isHls = !isMkv && (item.type === 'hls' || lowerUrl.indexOf('.m3u8') >= 0 || lowerUrl.indexOf('master.txt') >= 0 || lowerUrl.indexOf('/hls/') >= 0);
                var fmt = isMkv ? 'mkv' : (isHls ? 'hls' : 'mp4');
                var typeField = isMkv ? 'mkv' : (isHls ? 'm3u8' : 'mp4');

                var langInfo = getLanguageInfo(item.language, meta.originalLanguage);
                var qualityLabel = normalizeQualityLabel(item.quality || (isHls ? 'Auto' : '1080p'));
                var isAdaptive = isHls && (qualityLabel === 'Auto' || lowerUrl.indexOf('master') >= 0);
                var streamTypeLabel = isAdaptive ? 'Adaptive HLS' : (isHls ? 'HLS' : (isMkv ? 'Direct MKV' : 'Direct MP4'));
                var tech = extractMediaTags([item.quality, item.label, unwrapped.url].filter(Boolean).join(' '));
                var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

                streams.push({
                    name: 'FMovies | Vidnest › ' + srv.label + ' • ' + langInfo.name + ' [' + langInfo.tag + '] (' + qualityLabel + ')' + techSuffix,
                    title: titlePrefix + ' [' + langInfo.tag + '] - FMovies Vidnest ' + srv.label + ' [' + qualityLabel + ']' + techSuffix,
                    rawTitle: titlePrefix + ' ' + qualityLabel + ' [' + langInfo.tag + ']',
                    description: [streamTypeLabel, qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                    url: unwrapped.url,
                    quality: qualityLabel,
                    isAdaptive: isAdaptive,
                    streamType: streamTypeLabel,
                    size: mediaType === 'movie' ? '1.9 GB' : '680 MB',
                    type: typeField,
                    format: fmt,
                    container: fmt,
                    provider: 'fmovies',
                    server: 'Vidnest',
                    subServer: srv.label,
                    language: langInfo.code,
                    audio: {
                        isMulti: langInfo.code === 'multi',
                        primary: langInfo.name,
                        tag: langInfo.tag,
                        badge: '[' + langInfo.tag + ']'
                    },
                    hdrType: tech.hdrType,
                    codec: tech.codec,
                    audioFormat: tech.audioFormat,
                    sourceType: tech.sourceType,
                    tags: tech.tags,
                    headers: unwrapped.headers
                });
            }
        } catch (err) {}
    });

    await Promise.allSettled(jobs);
    return { streams: streams, subtitles: subtitles };
}

async function queryVidrock(tmdbId, mediaType, season, episode, meta) {
    var streams = [];
    try {
        var reqHeaders = { 'User-Agent': USER_AGENT, 'Referer': VIDROCK_ORIGIN + '/' };
        var url = mediaType === 'movie'
            ? (VIDROCK_API_BASE + '/movie/' + encodeURIComponent(tmdbId))
            : (VIDROCK_API_BASE + '/tv/' + encodeURIComponent(tmdbId) + '/' + (season || 1) + '/' + (episode || 1));

        var res = await fetchWithTimeout(url, { headers: reqHeaders }, 2400);
        if (!res.ok) return streams;
        var map = await res.json();
        if (!map || typeof map !== 'object') return streams;

        var titlePrefix = buildTitlePrefix(mediaType, meta, season, episode);
        var entries = Object.entries(map);

        for (var i = 0; i < entries.length; i++) {
            var srvName = entries[i][0];
            var entry = entries[i][1];
            if (!entry || !entry.url || typeof entry.url !== 'string') continue;

            try {
                var decryptedUrl = await decryptVidrockUrl(entry.url);
                if (!decryptedUrl || decryptedUrl.indexOf('http') !== 0 || DEAD_HOST_REGEX.test(decryptedUrl)) continue;

                var langInfo = getLanguageInfo(entry.language, meta.originalLanguage);
                var isHls = entry.type === 'hls' || decryptedUrl.indexOf('.m3u8') >= 0;
                var qualityLabel = inferQualityFromUrl(decryptedUrl, '720p');
                var isFixedSegment = /\/(?:2160|1440|1080|720|480|360)\/index/i.test(decryptedUrl);
                var isAdaptive = isHls && !isFixedSegment && decryptedUrl.toLowerCase().indexOf('master') >= 0;
                var streamTypeLabel = isAdaptive ? 'Adaptive HLS' : (isHls ? 'HLS' : 'Direct MP4');
                var tech = extractMediaTags(decryptedUrl + ' ' + qualityLabel);
                var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

                streams.push({
                    name: 'FMovies | Vidrock › ' + srvName + ' • ' + langInfo.name + ' [' + langInfo.tag + '] (' + qualityLabel + ')' + techSuffix,
                    title: titlePrefix + ' [' + langInfo.tag + '] - FMovies Vidrock ' + srvName + ' [' + qualityLabel + ']' + techSuffix,
                    rawTitle: titlePrefix + ' ' + qualityLabel + ' [' + langInfo.tag + ']',
                    description: [streamTypeLabel, qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                    url: decryptedUrl,
                    quality: qualityLabel,
                    isAdaptive: isAdaptive,
                    streamType: streamTypeLabel,
                    size: mediaType === 'movie' ? '1.4 GB' : '500 MB',
                    type: isHls ? 'm3u8' : 'mp4',
                    format: isHls ? 'hls' : 'mp4',
                    container: isHls ? 'hls' : 'mp4',
                    provider: 'fmovies',
                    server: 'Vidrock',
                    subServer: srvName,
                    language: langInfo.code,
                    audio: {
                        isMulti: langInfo.code === 'multi',
                        primary: langInfo.name,
                        tag: langInfo.tag,
                        badge: '[' + langInfo.tag + ']'
                    },
                    hdrType: tech.hdrType,
                    codec: tech.codec,
                    audioFormat: tech.audioFormat,
                    sourceType: tech.sourceType,
                    tags: tech.tags,
                    headers: { 'User-Agent': USER_AGENT, 'Referer': VIDROCK_ORIGIN + '/' }
                });
            } catch (e) {}
        }
    } catch (err) {}
    return streams;
}

async function queryVdrkSubtitles(tmdbId, mediaType, season, episode) {
    try {
        var subUrl = mediaType === 'movie'
            ? (SUB_VDRK_URL + '/movie/' + encodeURIComponent(tmdbId))
            : (SUB_VDRK_URL + '/tv/' + encodeURIComponent(tmdbId) + '/' + (season || 1) + '/' + (episode || 1));
        var res = await fetchWithTimeout(subUrl, { headers: { 'User-Agent': USER_AGENT } }, 2200);
        if (!res.ok) return [];
        var list = await res.json();
        if (!Array.isArray(list)) return [];
        return list.map(function(s) {
            var label = (s && (s.label || s.lang || 'English')) || 'English';
            return {
                url: s && (s.file || s.url),
                language: label,
                lang: label,
                name: label,
                headers: { 'User-Agent': USER_AGENT }
            };
        }).filter(function(s) { return s.url && typeof s.url === 'string'; });
    } catch (e) {
        return [];
    }
}

async function filterPlayableStreams(candidates) {
    if (!candidates || candidates.length === 0) return [];
    var checks = candidates.map(async function(st) {
        try {
            var hdrs = Object.assign({}, st.headers || {});
            if (st.format === 'mp4' || st.format === 'mkv') hdrs['Range'] = 'bytes=0-1023';
            var res = await fetchWithTimeout(st.url, { headers: hdrs }, 1400);
            if (!(res.status === 200 || res.status === 206)) return null;

            var ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.indexOf('text/html') >= 0) {
                var peek = await res.text();
                if (peek.trim().indexOf('#EXTM3U') !== 0) return null;
            } else if (st.format === 'hls') {
                var m3u = await res.text();
                if (m3u.indexOf('#EXTM3U') >= 0) {
                    var prevQ = st.quality;
                    var variants = m3u.match(/#EXT-X-STREAM-INF/g);
                    if (variants && variants.length > 1) {
                        st.isAdaptive = true;
                        st.streamType = 'Adaptive HLS';
                    } else if (variants && variants.length === 1) {
                        st.isAdaptive = false;
                        st.streamType = 'HLS';
                    }
                    var resMatch = m3u.match(/RESOLUTION=(\d+)x(\d+)/i);
                    if (resMatch && st.quality === 'Auto' && (!variants || variants.length <= 1)) {
                        st.quality = bucketResolution(resMatch[1], resMatch[2]);
                    }
                    if (st.quality !== prevQ) {
                        st.name = st.name.replace('(' + prevQ + ')', '(' + st.quality + ')');
                        st.title = st.title.replace('[' + prevQ + ']', '[' + st.quality + ']');
                    }
                    st.description = [st.streamType, st.quality, st.audio && st.audio.primary].concat(st.tags || []).filter(Boolean).join(' • ');
                }
            }
            return st;
        } catch (err) {
            return null;
        }
    });

    var settled = await Promise.allSettled(checks);
    var healthy = [];
    for (var i = 0; i < settled.length; i++) {
        if (settled[i].status === 'fulfilled' && settled[i].value) {
            healthy.push(settled[i].value);
        }
    }
    return healthy;
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});

    if (!tmdbId) return [];

    try {
        var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);

        var results = await Promise.allSettled([
            queryVidnest(tmdbId, mediaType, season, episode, meta),
            queryVidrock(tmdbId, mediaType, season, episode, meta),
            queryVdrkSubtitles(tmdbId, mediaType, season, episode)
        ]);

        var rawStreams = [];
        var seenUrls = new Set();
        var masterSubsMap = new Map();

        function pushStream(st) {
            if (st && st.url && !seenUrls.has(st.url)) {
                seenUrls.add(st.url);
                rawStreams.push(st);
            }
        }
        function pushSub(sub) {
            if (sub && sub.url && !masterSubsMap.has(sub.language + '|' + sub.url)) {
                masterSubsMap.set(sub.language + '|' + sub.url, sub);
            }
        }

        if (results[0].status === 'fulfilled' && results[0].value) {
            (results[0].value.streams || []).forEach(pushStream);
            (results[0].value.subtitles || []).forEach(pushSub);
        }
        if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
            results[1].value.forEach(pushStream);
        }
        if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
            results[2].value.forEach(pushSub);
        }

        var playableStreams = await filterPlayableStreams(rawStreams);
        var aggregatedSubs = Array.from(masterSubsMap.values());
        if (aggregatedSubs.length > 0) {
            for (var idx = 0; idx < playableStreams.length; idx++) {
                playableStreams[idx].subtitles = aggregatedSubs;
            }
        }

        console.log('[FMovies] Healthy streams discovered: ' + playableStreams.length + ', subtitles: ' + aggregatedSubs.length);
        return playableStreams;
    } catch (globalErr) {
        console.error('[FMovies] Unexpected plugin error: ' + globalErr.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
