/**
 * Movy.sx Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Implements high-speed parallel scraping across active Movy CDN servers
 * with stream cipher decryption, dynamic multi-audio tagging, Adaptive/Direct
 * stream classification, and cross-server subtitle aggregation.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://www.movy.sx';
var STREAM_API_URL = 'https://api.wecollege.net';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL
};

var MAGIC_HEADER = [109, 118, 109, 49]; // "mvm1"

async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 2800;
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

function mixMurmur(e) {
    e >>>= 0;
    e ^= e >>> 16;
    e = Math.imul(e, 0x85ebca6b) >>> 0;
    e ^= e >>> 13;
    e = Math.imul(e, 0xc2b2ae35) >>> 0;
    return (e ^= e >>> 16) >>> 0;
}

function rotateLeft(e, a) {
    e >>>= 0;
    a &= 31;
    return a === 0 ? (e >>> 0) : ((e << a | e >>> (32 - a)) >>> 0);
}

function decryptPayload(cipherText, seed, tmdbId) {
    if (!cipherText || typeof cipherText !== 'string') {
        throw new Error('Invalid cipherText input');
    }

    var b64 = cipherText.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var binaryStr = typeof atob === 'function' ? atob(b64) : '';
    var totalLen = binaryStr.length;
    var encryptedBytes = new Uint8Array(totalLen);
    for (var i = 0; i < totalLen; i++) {
        encryptedBytes[i] = binaryStr.charCodeAt(i);
    }

    var fnvHash = 0x811c9dc5;
    for (var k = 0; k < seed.length; k++) {
        fnvHash = Math.imul(fnvHash ^ seed.charCodeAt(k), 0x1000193) >>> 0;
    }

    var n = mixMurmur(mixMurmur(fnvHash) ^ mixMurmur((Number(tmdbId) >>> 0) ^ 0x9e3779b9)) >>> 0;
    var stateVector = new Array(61);

    for (var e = 0; e < 8; e++) {
        var a = n % 61;
        n = rotateLeft((n + 0x9e3779b9) >>> 0, 7 + (7 & e));
        stateVector[a] = (n ^ mixMurmur(n)) >>> 0;
        n = mixMurmur((n + a) >>> 0);
    }

    var state = {
        S: stateVector,
        acc: mixMurmur(0xa5a5a5a5 ^ n) >>> 0
    };

    var keystream = new Uint8Array(totalLen);
    var step = 0;
    for (var pos = 0; pos < totalLen;) {
        var word = (function(st, d) {
            var t, s;
            var sArr = st.S;
            var acc = st.acc;
            var lIdx = acc % 61;
            var inN = 0 - Number(lIdx in sArr);
            var rVal = sArr[lIdx] >>> 0;
            var cVal = Math.imul(0x9e3779b9, d + 1) >>> 0;
            var bVal = (((t = acc) ^ (s = (rVal ^ cVal) >>> 0)) >>> 0 | (t & s & inN) >>> 0) >>> 0;
            acc = mixMurmur(((bVal = (rotateLeft((bVal + acc) >>> 0, 31 & lIdx) ^ rotateLeft(acc, 31 & Math.imul(lIdx, 7))) >>> 0) + 0x9e3779b9) >>> 0);
            sArr[lIdx] = acc >>> 0;
            st.acc = acc;
            return acc >>> 0;
        })(state, step++);

        keystream[pos++] = word & 255;
        if (pos < totalLen) keystream[pos++] = (word >>> 8) & 255;
        if (pos < totalLen) keystream[pos++] = (word >>> 16) & 255;
        if (pos < totalLen) keystream[pos++] = (word >>> 24) & 255;
    }

    for (var idx = 0; idx < totalLen; idx++) {
        encryptedBytes[idx] ^= keystream[idx];
    }

    for (var m = 0; m < MAGIC_HEADER.length; m++) {
        if (encryptedBytes[m] !== MAGIC_HEADER[m]) {
            throw new Error('decrypt failed: bad seed or tampered payload');
        }
    }

    var payload = encryptedBytes.subarray(MAGIC_HEADER.length);
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(payload);
    }
    var str = '';
    for (var j = 0; j < payload.length; j++) {
        str += String.fromCharCode(payload[j]);
    }
    return decodeURIComponent(escape(str));
}

var seedCache = new Map();
var inFlightSeedRequests = new Map();

async function fetchSeed(tmdbId, forceRefresh) {
    var now = Date.now();
    var cached = seedCache.get(tmdbId);
    if (!forceRefresh && cached && cached.expiresAt - 5000 > now) {
        return cached.seed;
    }

    if (inFlightSeedRequests.has(tmdbId)) {
        return inFlightSeedRequests.get(tmdbId);
    }

    var promise = (async function() {
        try {
            var clientIp = '104.28.19.' + (Math.abs(Number(tmdbId) || 1) % 250 + 1);
            var headers = Object.assign({}, DEFAULT_HEADERS, {
                'X-Forwarded-For': clientIp
            });
            var res = await fetchWithTimeout(STREAM_API_URL + '/seed?mediaId=' + encodeURIComponent(tmdbId), {
                headers: headers
            }, 2800);
            if (!res.ok) {
                throw new Error('Failed to obtain seed: HTTP ' + res.status);
            }
            var data = await res.json();
            if (!data || !data.seed) {
                throw new Error('Empty seed returned from endpoint');
            }

            seedCache.set(tmdbId, {
                seed: data.seed,
                expiresAt: Date.now() + (data.ttlMs || 30000)
            });
            return data.seed;
        } finally {
            inFlightSeedRequests.delete(tmdbId);
        }
    })();

    inFlightSeedRequests.set(tmdbId, promise);
    return promise;
}

var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' },
    'ja': { name: 'Japanese', tag: 'JPN' },
    'ko': { name: 'Korean', tag: 'KOR' },
    'es': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' },
    'de': { name: 'German', tag: 'GER' },
    'it': { name: 'Italian', tag: 'ITA' },
    'hi': { name: 'Hindi', tag: 'HIN' },
    'zh': { name: 'Chinese', tag: 'CHI' },
    'ru': { name: 'Russian', tag: 'RUS' },
    'pt': { name: 'Portuguese', tag: 'POR' },
    'ar': { name: 'Arabic', tag: 'ARA' }
};

function getLanguageInfo(code) {
    if (!code) return { name: 'English', tag: 'ENG' };
    var lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    for (var k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) {
            return LANGUAGE_MAP[k];
        }
    }
    return { name: lower.charAt(0).toUpperCase() + lower.slice(1), tag: lower.slice(0, 3).toUpperCase() };
}

function normalizeQualityLabel(rawQuality) {
    var q = String(rawQuality || '').trim();
    if (!q) return 'Auto';
    if (/2160|4k|uhd/i.test(q)) return '4K 2160p';
    if (/1440|2k/i.test(q)) return '1440p';
    if (/1080/i.test(q)) return '1080p';
    if (/720/i.test(q)) return '720p';
    if (/480|576/i.test(q)) return '480p';
    if (/360/i.test(q)) return '360p';
    if (/^\d{3,4}$/.test(q)) return q + 'p';
    return q;
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
    else if (/\bDTS-?HD\b/.test(upper)) audioFormat = 'DTS-HD';
    else if (/\bDTS\b/.test(upper)) audioFormat = has51 ? 'DTS 5.1' : 'DTS';

    var tags = [];
    if (sourceType) tags.push(sourceType);
    if (hdrType) tags.push(hdrType);
    if (codec) tags.push(codec);
    if (bitDepth) tags.push(bitDepth);
    if (audioFormat) tags.push(audioFormat);
    return { sourceType: sourceType, hdrType: hdrType, codec: codec, bitDepth: bitDepth, audioFormat: audioFormat, tags: tags };
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var imdbId = extraArgs.imdbId || '';
    var totalSeasons = extraArgs.totalSeasons || '';
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title || !year || !origLang || (!imdbId && mediaType !== 'movie')) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var metaRes = await fetchWithTimeout(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, {
                headers: DEFAULT_HEADERS
            }, 2500);
            if (metaRes.ok) {
                var meta = await metaRes.json();
                title = title || meta.title || meta.name || '';
                var relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? relDate.substring(0, 4) : '');
                imdbId = imdbId || meta.imdb_id || (meta.external_ids ? meta.external_ids.imdb_id : '') || '';
                totalSeasons = totalSeasons || meta.number_of_seasons || '';
                origLang = origLang || meta.original_language || '';
            }
            if (!imdbId && tmdbType === 'tv') {
                var extRes = await fetchWithTimeout(TMDB_PROXY_URL + '/tv/' + tmdbId + '/external_ids', {
                    headers: DEFAULT_HEADERS
                }, 2000);
                if (extRes.ok) {
                    var extMeta = await extRes.json();
                    if (extMeta && extMeta.imdb_id) imdbId = extMeta.imdb_id;
                }
            }
        } catch (e) {
            console.log('[Movy] Metadata fallback lookup failed: ' + e.message);
        }
    }

    return {
        title: title || ('Title ' + tmdbId),
        year: year ? String(year) : '2020',
        imdbId: imdbId || '',
        totalSeasons: totalSeasons ? String(totalSeasons) : '1',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
}

// Active Movy CDN servers (permanently dead 404/500 nodes removed)
var SERVERS = [
    { name: 'Miami', endpoint: 'miami', dubbedLanguage: null },
    { name: 'Boise', endpoint: 'boise', dubbedLanguage: null },
    { name: 'Atlanta', endpoint: 'atlanta', dubbedLanguage: null },
    { name: 'Phoenix', endpoint: 'phoenix', dubbedLanguage: null },
    { name: 'Vegas', endpoint: 'vegas', dubbedLanguage: null },
    { name: 'Reno', endpoint: 'reno', dubbedLanguage: null },
    { name: 'Oakland', endpoint: 'oakland', dubbedLanguage: null },
    { name: 'Seattle', endpoint: 'seattle', dubbedLanguage: null },
    { name: 'Portland', endpoint: 'portland', dubbedLanguage: null },
    { name: 'Austin', endpoint: 'austin', dubbedLanguage: null },
    { name: 'Munich', endpoint: 'munich', dubbedLanguage: 'de', extraParams: { language: 'german' } },
    { name: 'Paris', endpoint: 'paris', dubbedLanguage: 'fr' },
    { name: 'Delhi', endpoint: 'delhi', dubbedLanguage: 'hi' },
    { name: 'Cancun', endpoint: 'cancun', dubbedLanguage: 'es' }
];

async function queryServer(server, params, tmdbId, seed, timeoutMs) {
    try {
        var sp = new URLSearchParams();
        for (var k in params) {
            if (Object.prototype.hasOwnProperty.call(params, k)) {
                var val = params[k];
                if (val !== undefined && val !== null && val !== '') {
                    sp.set(k, String(val));
                }
            }
        }
        if (server.extraParams) {
            for (var ek in server.extraParams) {
                if (Object.prototype.hasOwnProperty.call(server.extraParams, ek)) {
                    sp.set(ek, String(server.extraParams[ek]));
                }
            }
        }
        sp.set('enc', '2');
        sp.set('seed', seed);

        var url = STREAM_API_URL + '/' + server.endpoint + '/sources?' + sp.toString();
        var fetchOptions = { headers: Object.assign({}, DEFAULT_HEADERS) };

        var res = await fetchWithTimeout(url, fetchOptions, timeoutMs || 2500);

        if (res.status === 401) {
            var freshSeed = await fetchSeed(tmdbId, true);
            sp.set('seed', freshSeed);
            var retryUrl = STREAM_API_URL + '/' + server.endpoint + '/sources?' + sp.toString();
            res = await fetchWithTimeout(retryUrl, fetchOptions, 2200);
            seed = freshSeed;
        }

        if (!res.ok) {
            return { streams: [], subtitles: [] };
        }

        var rawText = await res.text();
        if (!rawText) return { streams: [], subtitles: [] };

        var parsed;
        try {
            var decryptedJson = decryptPayload(rawText, seed, tmdbId);
            parsed = JSON.parse(decryptedJson);
        } catch (err) {
            return { streams: [], subtitles: [] };
        }

        var rawSources = parsed.sources || [];
        var rawSubs = parsed.subtitles || [];

        var mappedSubs = rawSubs.map(function(s) {
            var langName = (s && (s.language || s.lang)) || 'English';
            return {
                url: s && s.url,
                language: langName,
                lang: langName,
                name: langName,
                headers: Object.assign({}, DEFAULT_HEADERS)
            };
        }).filter(function(s) { return s.url && typeof s.url === 'string'; });

        var isMulti = false;
        var detectedLang = null;

        if (parsed.audios && Array.isArray(parsed.audios) && parsed.audios.length > 1) {
            isMulti = true;
        } else if (parsed.audio && Array.isArray(parsed.audio) && parsed.audio.length > 1) {
            isMulti = true;
        } else if (typeof parsed.audio === 'string' && parsed.audio.toLowerCase().indexOf('multi') >= 0) {
            isMulti = true;
        } else if (parsed.audio && typeof parsed.audio === 'string') {
            detectedLang = parsed.audio;
        } else if (parsed.language && typeof parsed.language === 'string') {
            detectedLang = parsed.language;
        }

        var baseAudio, baseTag, baseCode;
        if (isMulti) {
            baseAudio = 'Multi';
            baseTag = 'MULTI';
            baseCode = 'multi';
        } else if (detectedLang) {
            var info = getLanguageInfo(detectedLang);
            baseAudio = info.name;
            baseTag = info.tag;
            baseCode = detectedLang.toLowerCase();
        } else if (server.dubbedLanguage) {
            var dInfo = getLanguageInfo(server.dubbedLanguage);
            baseAudio = dInfo.name;
            baseTag = dInfo.tag;
            baseCode = server.dubbedLanguage;
        } else {
            var origInfo = getLanguageInfo(params.originalLanguage);
            baseAudio = origInfo.name;
            baseTag = origInfo.tag;
            baseCode = params.originalLanguage || 'en';
        }

        var streams = [];
        for (var i = 0; i < rawSources.length; i++) {
            var src = rawSources[i];
            if (!src || !src.url || typeof src.url !== 'string') continue;
            var srcUrl = src.url.trim();
            if (!srcUrl.startsWith('http')) continue;

            var itemAudio = baseAudio;
            var itemTag = baseTag;
            var itemCode = baseCode;

            if (src.audio && typeof src.audio === 'string') {
                if (src.audio.toLowerCase().indexOf('multi') >= 0) {
                    itemAudio = 'Multi';
                    itemTag = 'MULTI';
                    itemCode = 'multi';
                } else {
                    var sInfo = getLanguageInfo(src.audio);
                    itemAudio = sInfo.name;
                    itemTag = sInfo.tag;
                    itemCode = src.audio.toLowerCase();
                }
            } else if (srcUrl.toLowerCase().indexOf('multi') >= 0 || srcUrl.toLowerCase().indexOf('dual') >= 0) {
                itemAudio = 'Multi';
                itemTag = 'MULTI';
                itemCode = 'multi';
            }

            var qualityLabel = normalizeQualityLabel(src.quality);
            var isHls = srcUrl.toLowerCase().indexOf('.m3u8') >= 0 || srcUrl.toLowerCase().indexOf('hls') >= 0;
            var isAdaptive = isHls && (qualityLabel === 'Auto' || srcUrl.toLowerCase().indexOf('master') >= 0 || rawSources.length === 1);
            var streamTypeLabel = isAdaptive ? 'Adaptive HLS' : (isHls ? 'HLS' : 'Direct MP4');
            var subServerLabel = isAdaptive ? 'Adaptive HLS' : (isHls ? 'HLS' : 'Direct MP4');

            var tech = extractMediaTags([src.quality, src.title, src.label, srcUrl].filter(Boolean).join(' '));
            var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

            var isMovie = params.mediaType === 'movie';
            var epTag = !isMovie ? ('S' + String(params.season || 1).padStart(2, '0') + 'E' + String(params.episode || 1).padStart(2, '0')) : '';
            var titlePrefix = !isMovie
                ? ((params.title || 'Video') + ' ' + epTag)
                : ((params.title || 'Video') + (params.year ? ' (' + params.year + ')' : ''));

            var displayTag = itemAudio === 'Multi' ? '[MULTI]' : ('[' + itemTag + ']');
            var descParts = [streamTypeLabel, qualityLabel, itemAudio].concat(tech.tags);

            streams.push({
                name: 'Movy | ' + server.name + ' › ' + subServerLabel + ' • ' + itemAudio + ' ' + displayTag + ' (' + qualityLabel + ')' + techSuffix,
                title: titlePrefix + ' ' + displayTag + ' - Movy ' + server.name + ' [' + qualityLabel + ']' + techSuffix,
                rawTitle: titlePrefix + ' ' + qualityLabel + ' ' + displayTag,
                description: descParts.join(' • '),
                url: srcUrl,
                quality: qualityLabel,
                isAdaptive: isAdaptive,
                streamType: streamTypeLabel,
                size: isMovie ? '2.0 GB' : '750 MB',
                type: isHls ? 'm3u8' : 'mp4',
                format: isHls ? 'hls' : 'mp4',
                container: isHls ? 'hls' : 'mp4',
                provider: 'movy',
                server: server.name,
                subServer: subServerLabel,
                language: itemCode,
                audio: {
                    isMulti: itemAudio === 'Multi',
                    primary: itemAudio,
                    tag: itemTag,
                    badge: displayTag
                },
                hdrType: tech.hdrType,
                codec: tech.codec,
                audioFormat: tech.audioFormat,
                sourceType: tech.sourceType,
                tags: tech.tags,
                headers: Object.assign({}, DEFAULT_HEADERS),
                subtitles: mappedSubs
            });
        }

        return { streams: streams, subtitles: mappedSubs };
    } catch (err) {
        return { streams: [], subtitles: [] };
    }
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});

    if (!tmdbId) return [];

    try {
        var isMovie = mediaType === 'movie';
        var results = await Promise.all([
            resolveMetadata(tmdbId, mediaType, extraArgs),
            fetchSeed(tmdbId, false)
        ]);
        var meta = results[0];
        var seed = results[1];
        if (!seed) return [];

        var params = {
            title: meta.title,
            mediaType: isMovie ? 'movie' : 'tv',
            year: meta.year,
            tmdbId: String(tmdbId),
            imdbId: meta.imdbId,
            originalLanguage: meta.originalLanguage
        };

        if (!isMovie) {
            params.totalSeasons = meta.totalSeasons;
            params.seasonId = season != null ? String(season) : '1';
            params.episodeId = episode != null ? String(episode) : '1';
            params.season = season != null ? Number(season) : 1;
            params.episode = episode != null ? Number(episode) : 1;
        }

        var serverResults = await Promise.all(
            SERVERS.map(function(srv) { return queryServer(srv, params, tmdbId, seed, 2500); })
        );

        var allStreams = [];
        var seenUrls = {};
        var masterSubsMap = new Map();

        for (var i = 0; i < serverResults.length; i++) {
            var res = serverResults[i];
            if (!res) continue;
            var streamsList = res.streams || [];
            var subsList = res.subtitles || [];

            for (var j = 0; j < streamsList.length; j++) {
                var st = streamsList[j];
                var key = st.url + '|' + st.quality;
                if (seenUrls[key]) continue;
                seenUrls[key] = true;
                allStreams.push(st);
            }
            for (var k = 0; k < subsList.length; k++) {
                var sub = subsList[k];
                if (sub && sub.url && !masterSubsMap.has(sub.language + '|' + sub.url)) {
                    masterSubsMap.set(sub.language + '|' + sub.url, sub);
                }
            }
        }

        var aggregatedSubtitles = Array.from(masterSubsMap.values());
        if (aggregatedSubtitles.length > 0) {
            for (var sIdx = 0; sIdx < allStreams.length; sIdx++) {
                allStreams[sIdx].subtitles = aggregatedSubtitles;
            }
        }

        console.log('[Movy] Total streams discovered: ' + allStreams.length + ', subtitles: ' + aggregatedSubtitles.length);
        return allStreams;
    } catch (globalErr) {
        console.error('[Movy] Unexpected plugin error: ' + globalErr.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
