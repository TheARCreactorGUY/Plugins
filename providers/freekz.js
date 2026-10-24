/**
 * Freekz (freekz.to / Vidstuck) Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Implements high-speed multi-server streaming across all 5 CDN architectures:
 *  - Atlas: Dual-stream HLS VOD (1080p, 720p) via Cloudflare Edge Workers
 *  - Ursa: High-speed Dual/Multi-Audio HLS stream (1080p)
 *  - Daedalus: Adaptive Multi-Quality HLS (1080p, 720p, 480p) via AWS CloudFront CDN
 *  - Orion: Multi-Audio & Dubs with MPEG-DASH / MP4 manifests (1080p) + full data.dubs extraction
 *  - Andromeda: High-speed MPEG-DASH streaming (1080p)
 *
 * Features:
 *  - Zero-dependency native CryptoJS.AES decryption (No embedded MiniAes bloat).
 *  - High-speed 2-step token handshake with intelligent server batching & staggering.
 *  - Comprehensive multi-audio dubbing & language tagging compliant with MatchScorer.
 *  - Direct subtitle integration across 19+ languages via /backend/subtitle.
 *  - Automatic Browser.resolve fallback with multi-server switcher auto-clicking.
 *  - In-memory 5-minute stream cache for rapid replays and server switching.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Referer': BACKEND_URL + '/',
    'Origin': BACKEND_URL,
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
};

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
    'zh': { name: 'Chinese', tag: 'CHI' }
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
    { id: "ursa", name: "Ursa", desc: "Dual Audio HLS", format: "m3u8", defaultRes: "1080p", audioTag: "MULTI", audioBadge: "[MULTI] [DUAL-AUDIO]" },
    { id: "daedalus", name: "Daedalus", desc: "Adaptive HLS", format: "m3u8", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "orion", name: "Orion", desc: "Multi Audio DASH", format: "mpd", defaultRes: "1080p", audioTag: "MULTI", audioBadge: "[MULTI]" },
    { id: "andromeda", name: "Andromeda", desc: "Fast DASH", format: "mpd", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" }
];

var STREAM_CACHE = {};
var CACHE_TTL_MS = 5 * 60 * 1000;

function getCryptoJS() {
    if (typeof globalThis !== 'undefined' && globalThis.CryptoJS) return globalThis.CryptoJS;
    if (typeof CryptoJS !== 'undefined') return CryptoJS;
    if (typeof require !== 'undefined') {
        try { return require('crypto-js'); } catch (_) {}
    }
    return null;
}

/**
 * Decrypts OpenSSL Salted__ AES-256-CBC ciphertext using native JVM CryptoJS.
 * If input is already a plain URL/path, returns it directly.
 */
function decryptLink(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'string') return '';
    var trimmed = ciphertext.trim();
    if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0 || trimmed.indexOf('/') === 0) {
        return trimmed;
    }
    try {
        var crypto = getCryptoJS();
        if (crypto && crypto.AES && typeof crypto.AES.decrypt === 'function') {
            var nativeDec = crypto.AES.decrypt(trimmed, AES_PASSPHRASE)
                .toString(crypto.enc.Utf8);
            if (nativeDec && nativeDec.trim()) return nativeDec.trim();
        }
    } catch (_) {}
    return '';
}

function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    var u = rawUrl.trim();
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('/') === 0) return BACKEND_URL + u;
    return u;
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

/**
 * Direct Subtitle Fetcher (/backend/subtitle) across 19+ languages.
 * Decrypts encrypted subtitle links if needed, resolves relative paths, and sets both `language` and `lang`.
 */
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
        if (latestDate) {
            params.set(KEY_LATEST_DATE, latestDate);
        }
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
        }, 10000);

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
                    'Referer': BACKEND_URL + '/'
                }
            });
        }
        return results;
    } catch (e) {
        console.warn('[Freekz] Subtitle fetch error:', e && e.message ? e.message : e);
        return [];
    }
}

/**
 * Performs 2-step token handshake with /backend/zxc and queries /backend/servers/{serverId}.
 */
async function fetchServerStream(serverId, tmdbId, effectiveType, season, episode, title, year, date, latestDate, imdbId) {
    try {
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
        var tokenData = await tokenRes.json();
        if (!tokenData || !tokenData.token || !tokenData.ts) return null;

        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId),
            [KEY_SERVER]: serverId,
            [KEY_TYPE]: effectiveType,
            [KEY_TS]: String(tokenData.ts),
            [KEY_TOKEN]: tokenData.token,
            [KEY_TITLE]: title,
            [KEY_YEAR]: year,
            [KEY_DATE]: date
        });
        if (latestDate) {
            params.set(KEY_LATEST_DATE, latestDate);
        }
        if (effectiveType === 'tv') {
            params.set(KEY_SEASON, String(season));
            params.set(KEY_EPISODE, String(episode));
        }
        if (imdbId) {
            params.set(KEY_IMDB, imdbId);
        }

        var srvRes = await fetchWithTimeout(BACKEND_URL + '/backend/servers/' + serverId + '?' + params.toString(), {
            headers: DEFAULT_HEADERS
        }, 6500);

        if (!srvRes.ok) return null;
        return await srvRes.json();
    } catch (e) {
        return null;
    }
}

function classifyFormat(linkObj, finalUrl, defaultFormat) {
    var explicit = String((linkObj && (linkObj.type || linkObj.format)) || '').toLowerCase();
    var lowerUrl = (finalUrl || '').toLowerCase();
    if (explicit === 'dash' || explicit === 'mpd' || lowerUrl.indexOf('/database/andromeda') >= 0 || lowerUrl.indexOf('/database/orion') >= 0 || lowerUrl.indexOf('.mpd') >= 0) {
        return { type: 'mpd', format: 'dash' };
    }
    if (explicit === 'hls' || explicit === 'm3u8' || lowerUrl.indexOf('.m3u8') >= 0 || lowerUrl.indexOf('hls') >= 0) {
        return { type: 'm3u8', format: 'hls' };
    }
    if (explicit === 'mp4' || lowerUrl.indexOf('.mp4') >= 0) {
        return { type: 'mp4', format: 'mp4' };
    }
    var def = defaultFormat || 'm3u8';
    return {
        type: def,
        format: def === 'mpd' ? 'dash' : (def === 'm3u8' ? 'hls' : 'mp4')
    };
}

function buildHeadersForStreamUrl(finalUrl) {
    var lower = (finalUrl || '').toLowerCase();
    // Pre-signed AWS CloudFront / S3 / R2 URLs reject foreign Origin headers
    var isSignedCloud = lower.indexOf('cloudfront.net') >= 0 ||
                        lower.indexOf('amazonaws.com') >= 0 ||
                        lower.indexOf('r2.cloudflarestorage.com') >= 0 ||
                        lower.indexOf('x-amz-signature') >= 0 ||
                        lower.indexOf('policy=') >= 0;
    if (isSignedCloud) {
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

/* --- Main getStreams Entry Point --- */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    try {
        var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
        extraArgs = Object.assign({}, callArgs, extraArgs || {});

        var isMovie = mediaType === 'movie';
        // Normalize anime/series -> 'tv' so vidstuck backend receives season & episode properly
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

        // 1. Fetch subtitles concurrently (staggered slightly to avoid /backend/zxc token stampede)
        var subtitlesPromise = sleep(120).then(function() {
            return fetchSubtitles(tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate);
        });

        // 2. Query servers in 2 staggered batches to avoid HTTP 429 rate limits
        var batch1 = await Promise.all([
            fetchServerStream('atlas', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId),
            fetchServerStream('ursa', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId)
        ]);

        await sleep(150);

        var batch2 = await Promise.all([
            fetchServerStream('daedalus', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId),
            fetchServerStream('orion', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId),
            fetchServerStream('andromeda', tmdbId, effectiveType, sNum, eNum, mediaTitle, releaseYear, releaseDate, latestDate, imdbId)
        ]);

        var serverResults = [
            batch1[0], // atlas
            batch1[1], // ursa
            batch2[0], // daedalus
            batch2[1], // orion
            batch2[2]  // andromeda
        ];

        var serverSubtitles = await subtitlesPromise;
        var collectedItems = [];

        for (var i = 0; i < SERVERS.length; i++) {
            var server = SERVERS[i];
            var data = serverResults[i];
            if (!data) continue;

            // Extract any server-specific subtitles returned inside the server payload
            var payloadSubs = [];
            var rawServerSubs = data.subtitles || data.captions || [];
            for (var sIdx = 0; sIdx < rawServerSubs.length; sIdx++) {
                var rs = rawServerSubs[sIdx];
                var rsUrl = normalizeUrl(decryptLink(rs.file || rs.url || rs.link || '') || rs.file || rs.url || '');
                if (rsUrl) {
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
                }
            }

            // Inspect data.dubs (Orion / Ursa multi-audio & dubbed streams)
            var dubEntries = Array.isArray(data.dubs) ? data.dubs : [];
            var dubCodes = [];
            var separateDubStreams = [];

            for (var dIdx = 0; dIdx < dubEntries.length; dIdx++) {
                var dub = dubEntries[dIdx];
                if (!dub) continue;
                var lInfo = getLangInfo(dub.lanCode || dub.language || dub.lang || dub.lanName || 'en');
                if (dubCodes.indexOf(lInfo.tag) === -1) {
                    dubCodes.push(lInfo.tag);
                }

                // If the dub entry contains its own encrypted stream link, decrypt and expose it!
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
                            audioBadge: '[' + lInfo.tag + ']',
                            extraSubs: payloadSubs
                        });
                    }
                }
            }

            var mainAudioTag = server.audioTag;
            var mainAudioBadge = server.audioBadge;
            if (dubCodes.length > 1) {
                mainAudioTag = 'MULTI';
                mainAudioBadge = '[MULTI] [' + dubCodes.slice(0, 6).join(' · ') + ']';
            } else if (dubCodes.length === 1) {
                mainAudioTag = dubCodes[0];
                mainAudioBadge = '[' + dubCodes[0] + ']';
            }

            // Process primary data.links
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

                collectedItems.push({
                    serverId: server.id,
                    serverName: serverDisplayName,
                    url: finalUrl,
                    quality: quality,
                    type: fmtInfo.type,
                    format: fmtInfo.format,
                    audioTag: mainAudioTag,
                    audioCode: mainAudioTag === 'MULTI' ? 'multi' : mainAudioTag.toLowerCase().slice(0, 2),
                    audioBadge: mainAudioBadge,
                    extraSubs: payloadSubs
                });
            }

            // Append any distinct decrypted dub streams from data.dubs
            for (var sd = 0; sd < separateDubStreams.length; sd++) {
                collectedItems.push(separateDubStreams[sd]);
            }
        }

        // Merge global /backend/subtitle tracks with any server-level subtitle tracks
        var streams = [];
        var seenUrls = {};

        for (var idx = 0; idx < collectedItems.length; idx++) {
            var item = collectedItems[idx];
            if (seenUrls[item.url]) continue;
            seenUrls[item.url] = true;

            var mergedSubs = [];
            var seenSubCheck = {};
            var combinedSubList = (item.extraSubs || []).concat(serverSubtitles || []);
            for (var mIdx = 0; mIdx < combinedSubList.length; mIdx++) {
                var sItem = combinedSubList[mIdx];
                if (sItem && sItem.url && !seenSubCheck[sItem.url]) {
                    seenSubCheck[sItem.url] = true;
                    mergedSubs.push(sItem);
                }
            }

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
                provider: PROVIDER_ID,
                language: item.audioCode || 'en',
                headers: buildHeadersForStreamUrl(item.url),
                subtitles: mergedSubs
            });
        }

        // Fallback: If Direct API returned 0 streams (e.g., if vidstuck.cc ever rotates AES_PASSPHRASE or KEY_TOKEN),
        // automatically fall back to Headless Browser.resolve with auto-clicking server switcher tabs
        if (streams.length === 0) {
            var fallbackUrl = 'https://vidstuck.cc/embed/' + (isMovie ? 'movie/' + tmdbId : 'tv/' + tmdbId + '/' + sNum + '/' + eNum);
            try {
                var browserApi = (typeof Browser !== 'undefined' && Browser.resolve) ? Browser : ((typeof globalThis !== 'undefined' && globalThis.Browser && globalThis.Browser.resolve) ? globalThis.Browser : null);
                if (browserApi) {
                    var resolveRes = await browserApi.resolve({
                        url: fallbackUrl,
                        timeoutMs: 10000,
                        autoClickServers: true
                    });

                    if (resolveRes) {
                        var sniffedMedia = resolveRes.sniffedMedia || [];
                        var sniffedSubs = resolveRes.sniffedSubtitles || [];
                        var fallbackSubtitles = (serverSubtitles && serverSubtitles.length > 0) ? serverSubtitles.slice() : [];

                        for (var si = 0; si < sniffedSubs.length; si++) {
                            var sObj = sniffedSubs[si];
                            var subUrl = typeof sObj === 'string' ? sObj : (sObj && sObj.url);
                            if (subUrl && !fallbackSubtitles.some(function(sub) { return sub.url === subUrl; })) {
                                var sLabel = (typeof sObj === 'object' && (sObj.lang || sObj.name)) || 'English';
                                fallbackSubtitles.push({
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

                        var fallbackItems = [];
                        for (var mi = 0; mi < sniffedMedia.length; mi++) {
                            var m = sniffedMedia[mi];
                            var rawMUrl = typeof m === 'string' ? m : (m && m.url);
                            if (!rawMUrl) continue;
                            if (typeof m === 'object' && m.isSubtitles) {
                                if (!fallbackSubtitles.some(function(sub) { return sub.url === rawMUrl; })) {
                                    fallbackSubtitles.push({
                                        url: rawMUrl,
                                        language: 'Unknown',
                                        lang: 'Unknown',
                                        name: 'Unknown',
                                        headers: {
                                            'User-Agent': DEFAULT_HEADERS['User-Agent'],
                                            'Referer': BASE_URL + '/'
                                        }
                                    });
                                }
                                continue;
                            }

                            var mUrl = normalizeUrl(rawMUrl);
                            if (mUrl.indexOf('zxcstream.xyz') >= 0) continue;

                            var mServer = null;
                            var mUrlLower = mUrl.toLowerCase();
                            for (var sIdx = 0; sIdx < SERVERS.length; sIdx++) {
                                if (mUrlLower.indexOf(SERVERS[sIdx].id) >= 0) {
                                    mServer = SERVERS[sIdx];
                                    break;
                                }
                            }
                            if (!mServer) {
                                mServer = {
                                    id: 'server' + (mi + 1),
                                    name: 'Server ' + (mi + 1),
                                    desc: 'Stream',
                                    format: mUrlLower.indexOf('.mpd') >= 0 ? 'mpd' : 'm3u8',
                                    defaultRes: '1080p',
                                    audioTag: 'ENG',
                                    audioBadge: '[ENG]'
                                };
                            }

                            var fmtInfo = classifyFormat(m, mUrl, mServer.format);

                            var quality = mServer.defaultRes || '1080p';
                            if (mUrlLower.indexOf('1080') >= 0) quality = '1080p';
                            else if (mUrlLower.indexOf('720') >= 0) quality = '720p';
                            else if (mUrlLower.indexOf('480') >= 0) quality = '480p';
                            else if (mUrlLower.indexOf('2160') >= 0 || mUrlLower.indexOf('4k') >= 0) quality = '4K';

                            fallbackItems.push({
                                serverId: mServer.id,
                                serverName: mServer.name,
                                url: mUrl,
                                quality: quality,
                                type: fmtInfo.type,
                                format: fmtInfo.format,
                                audioTag: mServer.audioTag,
                                audioCode: mServer.audioTag === 'MULTI' ? 'multi' : 'en',
                                audioBadge: mServer.audioBadge,
                                headers: m.headers || {}
                            });
                        }

                        if (fallbackItems.length === 0 && resolveRes.sniffedUrls && resolveRes.sniffedUrls.length > 0) {
                            for (var ui = 0; ui < resolveRes.sniffedUrls.length; ui++) {
                                var u = normalizeUrl(resolveRes.sniffedUrls[ui]);
                                var uLower = u.toLowerCase();
                                var isSubFile = uLower.indexOf('.vtt') >= 0 || uLower.indexOf('.srt') >= 0 || uLower.indexOf('.ass') >= 0;
                                if (isSubFile) {
                                    if (!fallbackSubtitles.some(function(sub) { return sub.url === u; })) {
                                        fallbackSubtitles.push({
                                            url: u,
                                            language: 'Unknown',
                                            lang: 'Unknown',
                                            name: 'Unknown',
                                            headers: {
                                                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                                                'Referer': BASE_URL + '/'
                                            }
                                        });
                                    }
                                } else if (uLower.indexOf('.m3u8') >= 0 || uLower.indexOf('.mpd') >= 0 || uLower.indexOf('.mp4') >= 0 || uLower.indexOf('/database/') >= 0) {
                                    var fTypeU = uLower.indexOf('.mpd') >= 0 ? 'mpd' : 'm3u8';
                                    fallbackItems.push({
                                        serverId: 'cdn',
                                        serverName: 'CDN Stream ' + (fallbackItems.length + 1),
                                        url: u,
                                        quality: '1080p',
                                        type: fTypeU,
                                        format: fTypeU === 'mpd' ? 'dash' : 'hls',
                                        audioTag: 'ENG',
                                        audioCode: 'en',
                                        audioBadge: '[ENG]',
                                        headers: {}
                                    });
                                }
                            }
                        }

                        for (var fi = 0; fi < fallbackItems.length; fi++) {
                            var fbItem = fallbackItems[fi];
                            if (seenUrls[fbItem.url]) continue;
                            seenUrls[fbItem.url] = true;

                            var fbStreamTitle = isMovie
                                ? (mediaTitle + ' (' + releaseYear + ') ' + fbItem.audioBadge + ' - ' + PROVIDER_NAME + ' ' + fbItem.serverName + ' [' + fbItem.quality + ']')
                                : (mediaTitle + ' ' + epTag + ' ' + fbItem.audioBadge + ' - ' + PROVIDER_NAME + ' ' + fbItem.serverName + ' [' + fbItem.quality + ']');

                            var fbDisplayName = PROVIDER_NAME + ' | ' + fbItem.serverName + ' • ' + fbItem.audioBadge + ' (' + fbItem.quality + ')';

                            var streamHeaders = Object.assign(buildHeadersForStreamUrl(fbItem.url), fbItem.headers || {});

                            streams.push({
                                name: fbDisplayName,
                                title: fbStreamTitle,
                                url: fbItem.url,
                                quality: fbItem.quality,
                                size: isMovie ? '2.0 GB' : '750 MB',
                                type: fbItem.type,
                                format: fbItem.format,
                                provider: PROVIDER_ID,
                                language: fbItem.audioCode || 'en',
                                headers: streamHeaders,
                                subtitles: fallbackSubtitles
                            });
                        }
                    }
                }
            } catch (fallbackErr) {
                console.error('[Freekz] Browser.resolve fallback error:', fallbackErr);
            }
        }

        if (streams.length > 0) {
            STREAM_CACHE[cacheKey] = {
                timestamp: Date.now(),
                streams: streams
            };
        }

        return streams;
    } catch (fatal) {
        console.error('[Freekz] Error in getStreams:', fatal);
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
