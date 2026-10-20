/**
 * Movy.sx Provider Plugin for Nuvio / Universal Streaming Architecture
 *
 * Implements high-speed parallel scraping across Movy.sx CDN servers
 * (Miami, Boise, Atlanta, Phoenix, Vegas, Reno, Oakland, Seattle, Dallas, Berlin, Paris)
 * with proprietary stream cipher reverse-engineered from Next.js bundles.
 *
 * Audio language is dynamically determined in real-time from media metadata,
 * stream properties, and server capability (e.g. Japanese for anime, English for US films,
 * German/French for dedicated dubs, and Multi whenever multiple audio tracks are available).
 */

const BASE_URL = 'https://www.movy.sx';
const STREAM_API_URL = 'https://api.wecollege.net';
const TMDB_PROXY_URL = 'https://db.wecollege.net/3';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL
};

// Stream Cipher constants and helpers
const CIPHER_CONSTANTS = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174
];
const MAGIC_HEADER = [109, 118, 109, 49]; // "mvm1"

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

/**
 * Decrypts custom-encrypted response from Movy stream endpoints.
 */
function decryptPayload(cipherText, seed, tmdbId) {
    if (!cipherText || typeof cipherText !== 'string') {
        throw new Error('Invalid cipherText input');
    }

    const b64 = cipherText.replace(/-/g, '+').replace(/_/g, '/').padEnd(4 * Math.ceil(cipherText.length / 4), '=');
    const binaryStr = typeof atob === 'function' ? atob(b64) : '';
    const totalLen = binaryStr.length;
    const encryptedBytes = new Uint8Array(totalLen);
    for (let i = 0; i < totalLen; i++) {
        encryptedBytes[i] = binaryStr.charCodeAt(i);
    }

    // Initialize cipher state
    let fnvHash = 0x811c9dc5;
    for (let k = 0; k < seed.length; k++) {
        fnvHash = Math.imul(fnvHash ^ seed.charCodeAt(k), 0x1000193) >>> 0;
    }

    let n = mixMurmur(mixMurmur(fnvHash) ^ mixMurmur((Number(tmdbId) >>> 0) ^ 0x9e3779b9)) >>> 0;
    const stateVector = new Array(61);

    for (let e = 0; e < 8; e++) {
        const a = n % 61;
        n = rotateLeft((n + 0x9e3779b9) >>> 0, 7 + (7 & e));
        stateVector[a] = (n ^ mixMurmur(n)) >>> 0;
        n = mixMurmur((n + a) >>> 0);
    }

    const state = {
        S: stateVector,
        acc: mixMurmur(0xa5a5a5a5 ^ n) >>> 0
    };

    // Generate keystream and XOR
    const keystream = new Uint8Array(totalLen);
    let step = 0;
    for (let e = 0; e < totalLen; ) {
        const word = (function(st, d) {
            let t, s;
            const sArr = st.S;
            let acc = st.acc;
            const lIdx = acc % 61;
            const inN = 0 - Number(lIdx in sArr);
            const rVal = sArr[lIdx] >>> 0;
            const cVal = Math.imul(0x9e3779b9, d + 1) >>> 0;
            let bVal = (((t = acc) ^ (s = (rVal ^ cVal) >>> 0)) >>> 0 | (t & s & inN) >>> 0) >>> 0;
            acc = mixMurmur(((bVal = (rotateLeft((bVal + acc) >>> 0, 31 & lIdx) ^ rotateLeft(acc, 31 & Math.imul(lIdx, 7))) >>> 0) + 0x9e3779b9) >>> 0);
            sArr[lIdx] = acc >>> 0;
            st.acc = acc;
            return acc >>> 0;
        })(state, step++);

        keystream[e++] = word & 255;
        if (e < totalLen) keystream[e++] = (word >>> 8) & 255;
        if (e < totalLen) keystream[e++] = (word >>> 16) & 255;
        if (e < totalLen) keystream[e++] = (word >>> 24) & 255;
    }

    for (let e = 0; e < totalLen; e++) {
        encryptedBytes[e] ^= keystream[e];
    }

    // Verify magic header
    for (let e = 0; e < MAGIC_HEADER.length; e++) {
        if (encryptedBytes[e] !== MAGIC_HEADER[e]) {
            throw new Error('decrypt failed: bad seed or tampered payload');
        }
    }

    const payload = encryptedBytes.subarray(MAGIC_HEADER.length);
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(payload);
    }
    let str = '';
    for (let i = 0; i < payload.length; i++) {
        str += String.fromCharCode(payload[i]);
    }
    return decodeURIComponent(escape(str));
}

// Global seed cache
const seedCache = new Map();

async function fetchSeed(tmdbId, forceRefresh = false) {
    const now = Date.now();
    const cached = seedCache.get(tmdbId);
    if (!forceRefresh && cached && cached.expiresAt - 5000 > now) {
        return cached.seed;
    }

    const clientIp = '104.28.19.' + (Math.abs(Number(tmdbId) || 1) % 250 + 1);
    const headers = Object.assign({}, DEFAULT_HEADERS, {
        'X-Forwarded-For': clientIp
    });

    const res = await fetch(STREAM_API_URL + '/seed?mediaId=' + encodeURIComponent(tmdbId), { headers });
    if (!res.ok) {
        throw new Error('Failed to obtain seed: HTTP ' + res.status);
    }
    const data = await res.json();
    if (!data || !data.seed) {
        throw new Error('Empty seed returned from endpoint');
    }

    seedCache.set(tmdbId, {
        seed: data.seed,
        expiresAt: now + (data.ttlMs || 30000)
    });
    return data.seed;
}

// Dynamic language lookup dictionary
const LANGUAGE_MAP = {
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
    const lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    // Check by name match
    for (const k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) {
            return LANGUAGE_MAP[k];
        }
    }
    return { name: lower.charAt(0).toUpperCase() + lower.slice(1), tag: lower.slice(0, 3).toUpperCase() };
}

// Metadata resolution helper
async function resolveMetadata(tmdbId, mediaType) {
    const extraArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    let title = extraArgs.title || extraArgs.name || '';
    let year = extraArgs.year || (extraArgs.releaseDate ? extraArgs.releaseDate.substring(0, 4) : '');
    let imdbId = extraArgs.imdbId || '';
    let totalSeasons = extraArgs.totalSeasons || '';
    let origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title || !year || !origLang) {
        try {
            const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            const metaRes = await fetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, {
                headers: DEFAULT_HEADERS
            });
            if (metaRes.ok) {
                const meta = await metaRes.json();
                title = title || meta.title || meta.name || '';
                const relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? relDate.substring(0, 4) : '');
                imdbId = imdbId || meta.imdb_id || (meta.external_ids ? meta.external_ids.imdb_id : '') || '';
                totalSeasons = totalSeasons || meta.number_of_seasons || '';
                origLang = origLang || meta.original_language || '';
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

// Server definitions: servers marked as null dubbedLanguage dynamically inherit the media's real-time originalLanguage
const SERVERS = [
    { name: 'Miami', endpoint: 'miami', dubbedLanguage: null },
    { name: 'Boise', endpoint: 'boise', dubbedLanguage: null },
    { name: 'Atlanta', endpoint: 'atlanta', dubbedLanguage: null },
    { name: 'Phoenix', endpoint: 'phoenix', dubbedLanguage: null },
    { name: 'Vegas', endpoint: 'vegas', dubbedLanguage: null },
    { name: 'Reno', endpoint: 'reno', dubbedLanguage: null },
    { name: 'Oakland', endpoint: 'oakland', dubbedLanguage: null },
    { name: 'Seattle', endpoint: 'seattle', dubbedLanguage: null },
    { name: 'Dallas', endpoint: 'dallas', dubbedLanguage: null },
    { name: 'Berlin', endpoint: 'berlin', dubbedLanguage: 'de' },
    { name: 'Paris', endpoint: 'paris', dubbedLanguage: 'fr' }
];

async function queryServer(server, params, tmdbId, seed, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;
    if (controller) {
        timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    }

    try {
        const sp = new URLSearchParams();
        for (const k in params) {
            if (params.hasOwnProperty(k)) {
                const val = params[k];
                if (val !== undefined && val !== null && val !== '') {
                    sp.set(k, String(val));
                }
            }
        }
        sp.set('enc', '2');
        sp.set('seed', seed);

        const url = STREAM_API_URL + '/' + server.endpoint + '/sources?' + sp.toString();
        const clientIp = '104.28.19.' + (Math.abs(Number(tmdbId) || 1) % 250 + 1);
        const headers = Object.assign({}, DEFAULT_HEADERS, {
            'X-Forwarded-For': clientIp
        });

        const fetchOptions = { headers };
        if (controller) fetchOptions.signal = controller.signal;

        let res = await fetch(url, fetchOptions);

        // 401 triggers seed refresh and single retry
        if (res.status === 401) {
            console.log('[Movy] 401 on server ' + server.name + ', refreshing seed...');
            const freshSeed = await fetchSeed(tmdbId, true);
            sp.set('seed', freshSeed);
            const retryUrl = STREAM_API_URL + '/' + server.endpoint + '/sources?' + sp.toString();
            res = await fetch(retryUrl, fetchOptions);
            seed = freshSeed;
        }

        if (!res.ok) {
            const errBody = await res.text();
            console.log('[Movy] Server ' + server.name + ' returned HTTP ' + res.status + ': ' + errBody.slice(0, 80));
            return { streams: [], subtitles: [] };
        }

        const rawText = await res.text();
        if (!rawText) return { streams: [], subtitles: [] };

        let decryptedJson;
        try {
            decryptedJson = decryptPayload(rawText, seed, tmdbId);
        } catch (decErr) {
            console.error('[Movy] Decrypt failed for ' + server.name + ': ' + decErr.message);
            return { streams: [], subtitles: [] };
        }

        let parsed;
        try {
            parsed = JSON.parse(decryptedJson);
        } catch (pErr) {
            console.error('[Movy] JSON parse failed for ' + server.name + ': ' + pErr.message);
            return { streams: [], subtitles: [] };
        }

        const rawSources = parsed.sources || [];
        const rawSubs = parsed.subtitles || [];

        const mappedSubs = rawSubs.map(s => ({
            url: s.url,
            language: s.language || s.lang || 'English',
            name: s.language || s.lang || 'English',
            headers: Object.assign({}, DEFAULT_HEADERS)
        })).filter(s => s.url && typeof s.url === 'string');

        // Dynamically detect multi-audio or audio language from real-time payload
        let isMulti = false;
        let detectedLang = null;

        if (parsed.audios && Array.isArray(parsed.audios) && parsed.audios.length > 1) {
            isMulti = true;
        } else if (parsed.audio && Array.isArray(parsed.audio) && parsed.audio.length > 1) {
            isMulti = true;
        } else if (typeof parsed.audio === 'string' && parsed.audio.toLowerCase().includes('multi')) {
            isMulti = true;
        } else if (parsed.audio && typeof parsed.audio === 'string') {
            detectedLang = parsed.audio;
        } else if (parsed.language && typeof parsed.language === 'string') {
            detectedLang = parsed.language;
        }

        let baseAudio;
        let baseTag;
        let baseCode;

        if (isMulti) {
            baseAudio = 'Multi';
            baseTag = 'MULTI';
            baseCode = 'multi';
        } else if (detectedLang) {
            const info = getLanguageInfo(detectedLang);
            baseAudio = info.name;
            baseTag = info.tag;
            baseCode = detectedLang.toLowerCase();
        } else if (server.dubbedLanguage) {
            const info = getLanguageInfo(server.dubbedLanguage);
            baseAudio = info.name;
            baseTag = info.tag;
            baseCode = server.dubbedLanguage;
        } else {
            // Dynamically assign media's real-time original language
            const origInfo = getLanguageInfo(params.originalLanguage);
            baseAudio = origInfo.name;
            baseTag = origInfo.tag;
            baseCode = params.originalLanguage || 'en';
        }

        const streams = [];
        for (let i = 0; i < rawSources.length; i++) {
            const src = rawSources[i];
            if (!src || !src.url || typeof src.url !== 'string') continue;
            const srcUrl = src.url.trim();
            if (!srcUrl.startsWith('http')) continue;

            let itemAudio = baseAudio;
            let itemTag = baseTag;
            let itemCode = baseCode;

            // Check if individual source specifies an audio or multi cue
            if (src.audio && typeof src.audio === 'string') {
                if (src.audio.toLowerCase().includes('multi')) {
                    itemAudio = 'Multi';
                    itemTag = 'MULTI';
                    itemCode = 'multi';
                } else {
                    const info = getLanguageInfo(src.audio);
                    itemAudio = info.name;
                    itemTag = info.tag;
                    itemCode = src.audio.toLowerCase();
                }
            } else if (srcUrl.toLowerCase().includes('multi') || srcUrl.toLowerCase().includes('dual')) {
                itemAudio = 'Multi';
                itemTag = 'MULTI';
                itemCode = 'multi';
            }

            const qualityLabel = src.quality ? String(src.quality) : 'Auto';
            const isHls = srcUrl.toLowerCase().indexOf('.m3u8') >= 0 || srcUrl.toLowerCase().indexOf('hls') >= 0;

            streams.push({
                name: 'Movy | ' + server.name + ' • ' + itemAudio + ' (' + qualityLabel + ')',
                title: (params.title || 'Video') + ' [' + itemAudio + '] [' + itemTag + '] - ' + server.name + ' [' + qualityLabel + ']',
                url: srcUrl,
                quality: qualityLabel,
                type: isHls ? 'm3u8' : 'mp4',
                provider: 'movy',
                language: itemCode,
                headers: Object.assign({}, DEFAULT_HEADERS),
                subtitles: mappedSubs
            });
        }

        console.log('[Movy] Server ' + server.name + ' (' + baseAudio + ') returned ' + streams.length + ' stream(s), ' + mappedSubs.length + ' sub(s)');
        return { streams, subtitles: mappedSubs };
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('[Movy] Server ' + server.name + ' timed out (8s)');
        } else {
            console.error('[Movy] Server ' + server.name + ' error: ' + err.message);
        }
        return { streams: [], subtitles: [] };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Main entry point for Nuvio Plugin Runtime.
 *
 * @param {string} tmdbId - TMDB ID (numeric)
 * @param {string} mediaType - 'movie', 'tv', or 'anime'
 * @param {number} [season] - Season number for episodic content
 * @param {number} [episode] - Episode number for episodic content
 * @returns {Promise<Array<Object>>}
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[Movy] Fetching streams for ' + mediaType + ' ID: ' + tmdbId + ' (S:' + season + ' E:' + episode + ')');

    if (!tmdbId) {
        console.error('[Movy] No tmdbId provided');
        return [];
    }

    try {
        const isMovie = mediaType === 'movie';
        const meta = await resolveMetadata(tmdbId, mediaType);
        console.log('[Movy] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Original Language: ' + meta.originalLanguage);

        const params = {
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
        }

        let seed;
        try {
            seed = await fetchSeed(tmdbId);
        } catch (seedErr) {
            console.error('[Movy] Seed acquisition error: ' + seedErr.message);
            return [];
        }

        // Query all servers in parallel with 8s individual timeout
        const serverPromises = SERVERS.map(srv => queryServer(srv, params, tmdbId, seed, 8000));
        const serverResults = await Promise.all(serverPromises);

        const allStreams = [];
        const masterSubsMap = new Map();

        for (let i = 0; i < serverResults.length; i++) {
            const res = serverResults[i];
            if (!res) continue;
            const streamsList = res.streams || (Array.isArray(res) ? res : []);
            const subsList = res.subtitles || [];

            for (let j = 0; j < streamsList.length; j++) {
                allStreams.push(streamsList[j]);
            }
            for (let k = 0; k < subsList.length; k++) {
                const sub = subsList[k];
                if (sub && sub.url && !masterSubsMap.has(sub.language)) {
                    masterSubsMap.set(sub.language, sub);
                }
            }
        }

        const aggregatedSubtitles = Array.from(masterSubsMap.values());
        if (aggregatedSubtitles.length > 0) {
            console.log('[Movy] Cross-server subtitles aggregated: ' + aggregatedSubtitles.length + ' tracks attached to all streams');
            for (let i = 0; i < allStreams.length; i++) {
                allStreams[i].subtitles = aggregatedSubtitles;
            }
        }

        console.log('[Movy] Total streams discovered: ' + allStreams.length);
        return allStreams;
    } catch (globalErr) {
        console.error('[Movy] Unexpected plugin error: ' + globalErr.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    globalThis.getStreams = getStreams;
}
