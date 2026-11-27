/**
 * 7Movies Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * High-speed parallel aggregator for 7movies.ws combining direct multi-GB
 * Google CDN download endpoints (/api/downloads) with parallel adaptive HLS
 * backends (Vidbolt & Cinezo/Punkflix) and multi-language WebVTT subtitles.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://7movies.ws';
var DOWNLOADS_API = BASE_URL + '/api/downloads';
var VIDBOLT_BASE = 'https://vidbolt.xyz';
var PUNKFLIX_BASE = 'https://punkflix.net';
var CINEZO_REFERER = 'https://player.cinezo.live/';
var SUB_VDRK_URL = 'https://sub.vdrk.site/v2';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL
};

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
    'ml': { name: 'Malayalam', tag: 'MAL', code: 'ml' },
    'malayalam': { name: 'Malayalam', tag: 'MAL', code: 'ml' },
    'kn': { name: 'Kannada', tag: 'KAN', code: 'kn' },
    'kannada': { name: 'Kannada', tag: 'KAN', code: 'kn' },
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

function getLanguageInfo(code) {
    if (!code) return { name: 'English', tag: 'ENG', code: 'en' };
    var lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    var clean = lower.charAt(0).toUpperCase() + lower.slice(1);
    return {
        name: clean,
        tag: lower.slice(0, 3).toUpperCase(),
        code: lower.slice(0, 2)
    };
}

function resolveRowLanguage(languages, fileText, fallbackLang) {
    var list = [];
    if (Array.isArray(languages)) {
        list = languages.map(function(x) { return String(x || '').trim(); }).filter(Boolean);
    } else if (typeof languages === 'string' && languages.trim()) {
        list = languages.split(/[,+/|]+/).map(function(x) { return x.trim(); }).filter(Boolean);
    }
    if (list.length > 1) {
        var mapped = list.map(function(l) { return getLanguageInfo(l); });
        var tags = mapped.map(function(m) { return m.tag; });
        var names = mapped.map(function(m) { return m.name; });
        return {
            isMulti: true,
            name: names.join(' + '),
            tag: tags.join(' + '),
            code: mapped[0].code
        };
    }
    if (list.length === 1) {
        var info = getLanguageInfo(list[0]);
        return { isMulti: info.code === 'multi', name: info.name, tag: info.tag, code: info.code };
    }
    var txt = String(fileText || '').toLowerCase();
    if (/\bmulti\b|\bdual[- ]audio\b/i.test(txt)) {
        return { isMulti: true, name: 'Multi Audio', tag: 'MULTI', code: 'multi' };
    }
    if (/\bhindi\b/i.test(txt)) {
        return { isMulti: false, name: 'Hindi', tag: 'HIN', code: 'hi' };
    }
    var fb = getLanguageInfo(fallbackLang || 'en');
    return { isMulti: false, name: fb.name, tag: fb.tag, code: fb.code };
}

function normalizeQualityLabel(raw) {
    var q = String(raw || '').trim();
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

function qualityScore(label) {
    if (label === '4K 2160p') return 2160;
    if (label === '1440p') return 1440;
    if (label === '1080p') return 1080;
    if (label === '720p') return 720;
    if (label === '480p') return 480;
    if (label === '360p') return 360;
    return 0;
}

function extractMediaTags(text, explicitTags) {
    var combined = String(text || '') + ' ' + (Array.isArray(explicitTags) ? explicitTags.join(' ') : '');
    var upper = combined.toUpperCase();

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
    else if (/\b(?:DTS-?HD\s*MA|DTS-?HD)\b/.test(upper)) audioFormat = has71 ? 'DTS-HD 7.1' : (has51 ? 'DTS-HD 5.1' : 'DTS-HD');
    else if (/\b(?:DDP|DD\+|EAC3|E-AC-3)\b/.test(upper)) audioFormat = has51 ? 'DDP 5.1' : 'DDP';
    else if (/\bDTS\b/.test(upper)) audioFormat = has51 ? 'DTS 5.1' : 'DTS';
    else if (/\b(?:AC3|DD)\b/.test(upper)) audioFormat = has51 ? 'DD 5.1' : 'AC3';
    else if (/\bAAC\b/.test(upper)) audioFormat = 'AAC';

    var tags = [];
    if (sourceType) tags.push(sourceType);
    if (hdrType) tags.push(hdrType);
    if (codec) tags.push(codec);
    if (bitDepth) tags.push(bitDepth);
    if (audioFormat) tags.push(audioFormat);
    return { sourceType: sourceType, hdrType: hdrType, codec: codec, bitDepth: bitDepth, audioFormat: audioFormat, tags: tags };
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

async function query7MoviesDownloads(tmdbId, mediaType, season, episode, meta) {
    var streams = [];
    try {
        var qUrl = mediaType === 'movie'
            ? (DOWNLOADS_API + '?type=movie&id=' + encodeURIComponent(tmdbId))
            : (DOWNLOADS_API + '?type=tv&id=' + encodeURIComponent(tmdbId) + '&season=' + (season || 1) + '&episode=' + (episode || 1));

        var res = await fetchWithTimeout(qUrl, { headers: DEFAULT_HEADERS }, 2500);
        if (!res.ok) return streams;
        var data = await res.json();
        var rows = Array.isArray(data && data.rows) ? data.rows : [];
        if (rows.length === 0) return streams;

        var camRegex = /\b(?:cam|hdcam|hdts|telesync|telecine|screener|camrip)\b/i;
        var nonCamRows = rows.filter(function(r) {
            return r && r.token && !camRegex.test(String(r.file || '') + ' ' + String(r.quality || ''));
        });
        var candidateRows = nonCamRows.length > 0 ? nonCamRows : rows.filter(function(r) { return r && r.token; });

        // Rank distinct quality tiers cleanly so resolution completes well under 3.5s
        var tierMap = new Map();
        for (var i = 0; i < candidateRows.length; i++) {
            var row = candidateRows[i];
            var qLabel = normalizeQualityLabel(row.quality || row.file);
            var tech = extractMediaTags(row.file, row.tags);
            var langResolved = resolveRowLanguage(row.languages, row.file, meta.originalLanguage);
            var tierKey = qLabel + '|' + (langResolved.isMulti ? 'multi' : langResolved.code);

            var score = qualityScore(qLabel) * 10 + tech.tags.length * 15 + (tech.sourceType === 'REMUX' ? 20 : (tech.sourceType === 'BluRay' ? 12 : 5));
            var existing = tierMap.get(tierKey);
            if (!existing || score > existing.score) {
                tierMap.set(tierKey, { row: row, qLabel: qLabel, tech: tech, lang: langResolved, score: score });
            }
        }

        var selected = Array.from(tierMap.values()).sort(function(a, b) {
            return b.score - a.score;
        }).slice(0, 4);

        var titlePrefix = buildTitlePrefix(mediaType, meta, season, episode);
        var resolvePromises = selected.map(async function(item) {
            try {
                var fileRes = await fetchWithTimeout(BASE_URL + '/api/downloads/file?t=' + encodeURIComponent(item.row.token), {
                    headers: DEFAULT_HEADERS,
                    redirect: 'manual'
                }, 2400);

                var directUrl = null;
                if (fileRes.status === 301 || fileRes.status === 302 || fileRes.status === 307 || fileRes.status === 308) {
                    directUrl = fileRes.headers.get('location');
                } else if (fileRes.ok) {
                    var ct = (fileRes.headers.get('content-type') || '').toLowerCase();
                    if (ct.indexOf('json') >= 0) {
                        var fj = await fileRes.json();
                        directUrl = fj && (fj.url || fj.downloadUrl || fj.link);
                    }
                }
                if (!directUrl || typeof directUrl !== 'string' || directUrl.indexOf('http') !== 0) return null;

                var fileStr = String(item.row.file || '');
                var isMkv = /\.mkv(?:\?|$)/i.test(fileStr) || /\.mkv(?:\?|$)/i.test(directUrl);
                var containerFmt = isMkv ? 'mkv' : 'mp4';
                var streamTypeLabel = isMkv ? 'Direct MKV' : 'Direct MP4';
                var subSrv = item.row.source ? String(item.row.source) : 'Google CDN';
                var techSuffix = item.tech.tags.length > 0 ? (' [' + item.tech.tags.join(' · ') + ']') : '';
                var sizeStr = item.row.size ? String(item.row.size) : '';

                return {
                    name: '7Movies | Cloud › ' + subSrv + ' • ' + item.lang.name + ' [' + item.lang.tag + '] (' + item.qLabel + ')' + techSuffix,
                    title: titlePrefix + ' [' + item.lang.tag + '] - 7Movies Cloud (' + subSrv + ') [' + item.qLabel + ']' + techSuffix + (sizeStr ? ' (' + sizeStr + ')' : ''),
                    rawTitle: fileStr || (titlePrefix + ' ' + item.qLabel),
                    description: [streamTypeLabel, item.qLabel, sizeStr, item.lang.name].concat(item.tech.tags).filter(Boolean).join(' • '),
                    url: directUrl,
                    quality: item.qLabel,
                    isAdaptive: false,
                    streamType: streamTypeLabel,
                    size: sizeStr || (mediaType === 'movie' ? '2.5 GB' : '850 MB'),
                    type: containerFmt,
                    format: containerFmt,
                    container: containerFmt,
                    provider: '7movies',
                    server: '7Movies Cloud',
                    subServer: subSrv,
                    language: item.lang.code,
                    audio: {
                        isMulti: item.lang.isMulti,
                        primary: item.lang.name,
                        tag: item.lang.tag,
                        badge: '[' + item.lang.tag + ']'
                    },
                    hdrType: item.tech.hdrType,
                    codec: item.tech.codec,
                    audioFormat: item.tech.audioFormat,
                    sourceType: item.tech.sourceType,
                    tags: item.tech.tags,
                    // Direct Google CDN links fail with Referer/Origin headers on some nodes
                    headers: { 'User-Agent': USER_AGENT }
                };
            } catch (err) {
                return null;
            }
        });

        var resolved = await Promise.all(resolvePromises);
        for (var r = 0; r < resolved.length; r++) {
            if (resolved[r]) streams.push(resolved[r]);
        }
    } catch (e) {}
    return streams;
}

async function queryVidbolt(tmdbId, mediaType, season, episode, meta) {
    var streams = [];
    var subtitles = [];
    var headers = { 'User-Agent': USER_AGENT, 'Referer': VIDBOLT_BASE + '/' };

    var queryPath = 'id=' + encodeURIComponent(tmdbId);
    if (mediaType === 'movie') {
        queryPath = 'type=movie&' + queryPath;
    } else if (mediaType === 'anime') {
        queryPath = 'type=anime&' + queryPath + '&episode=' + (episode || 1);
    } else {
        queryPath = 'type=tv&' + queryPath + '&season=' + (season || 1) + '&episode=' + (episode || 1);
    }

    var titlePrefix = buildTitlePrefix(mediaType, meta, season, episode);
    var servers = ['orion', 'callisto', 'vega', 'zephyr'];
    var seenUrls = new Set();

    var jobs = servers.map(async function(srv) {
        try {
            var res = await fetchWithTimeout(VIDBOLT_BASE + '/api/resolve?' + queryPath + '&only=' + srv, {
                headers: headers
            }, 2300);
            if (!res.ok) return;
            var data = await res.json();
            var streamObj = data && data.stream;
            if (!streamObj || !Array.isArray(streamObj.sources)) return;

            var serverName = streamObj.server
                ? (streamObj.server.charAt(0).toUpperCase() + streamObj.server.slice(1))
                : (srv.charAt(0).toUpperCase() + srv.slice(1));

            if (Array.isArray(streamObj.subtitles)) {
                for (var sIdx = 0; sIdx < streamObj.subtitles.length; sIdx++) {
                    var sub = streamObj.subtitles[sIdx];
                    if (sub && sub.url) {
                        var sLabel = sub.label || sub.lang || 'English';
                        subtitles.push({ url: sub.url, language: sLabel, lang: sLabel, name: sLabel, headers: headers });
                    }
                }
            }

            var detectedLangs = new Set();
            for (var dIdx = 0; dIdx < streamObj.sources.length; dIdx++) {
                if (streamObj.sources[dIdx] && streamObj.sources[dIdx].language) {
                    detectedLangs.add(String(streamObj.sources[dIdx].language).toLowerCase());
                }
            }

            for (var i = 0; i < streamObj.sources.length; i++) {
                var src = streamObj.sources[i];
                if (!src || !src.url || seenUrls.has(src.url)) continue;
                seenUrls.add(src.url);

                var isMulti = !src.language && detectedLangs.size > 1;
                var langInfo = src.language
                    ? getLanguageInfo(src.language)
                    : (isMulti ? { name: 'Multi', tag: 'MULTI', code: 'multi' } : getLanguageInfo(meta.originalLanguage));

                var qualityLabel = normalizeQualityLabel(src.quality || '1080p');
                var isHls = src.kind === 'hls' || src.url.indexOf('.m3u8') >= 0;
                var isAdaptive = isHls && (qualityLabel === 'Auto' || src.url.toLowerCase().indexOf('master') >= 0);
                var streamTypeLabel = isAdaptive ? 'Adaptive HLS' : (isHls ? 'HLS' : 'Direct MP4');
                var tech = extractMediaTags([src.quality, src.title, src.label, src.url].filter(Boolean).join(' '));
                var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

                streams.push({
                    name: '7Movies | Vidbolt › ' + serverName + ' • ' + langInfo.name + ' [' + langInfo.tag + '] (' + qualityLabel + ')' + techSuffix,
                    title: titlePrefix + ' [' + langInfo.tag + '] - 7Movies Vidbolt ' + serverName + ' [' + qualityLabel + ']' + techSuffix,
                    rawTitle: titlePrefix + ' ' + qualityLabel + ' [' + langInfo.tag + ']',
                    description: [streamTypeLabel, qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                    url: src.url,
                    quality: qualityLabel,
                    isAdaptive: isAdaptive,
                    streamType: streamTypeLabel,
                    size: mediaType === 'movie' ? '2.0 GB' : '750 MB',
                    type: isHls ? 'm3u8' : 'mp4',
                    format: isHls ? 'hls' : 'mp4',
                    container: isHls ? 'hls' : 'mp4',
                    provider: '7movies',
                    server: 'Vidbolt',
                    subServer: serverName,
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
                    headers: headers
                });
            }
        } catch (err) {}
    });

    await Promise.allSettled(jobs);
    return { streams: streams, subtitles: subtitles };
}

async function queryPunkflix(tmdbId, mediaType, season, episode, meta) {
    var streams = [];
    var subtitles = [];
    try {
        var headers = { 'User-Agent': USER_AGENT, 'Referer': CINEZO_REFERER };
        var url = mediaType === 'movie'
            ? (PUNKFLIX_BASE + '/movie/' + tmdbId + '.json')
            : (PUNKFLIX_BASE + '/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1) + '.json');

        var res = await fetchWithTimeout(url, { headers: headers }, 2300);
        if (!res.ok) return { streams: streams, subtitles: subtitles };
        var data = await res.json();
        if (!data) return { streams: streams, subtitles: subtitles };

        if (Array.isArray(data.subtitles)) {
            for (var j = 0; j < data.subtitles.length; j++) {
                var sub = data.subtitles[j];
                if (sub && sub.url) {
                    var sLabel = sub.label || sub.lang || 'English';
                    subtitles.push({ url: sub.url, language: sLabel, lang: sLabel, name: sLabel, headers: headers });
                }
            }
        }

        var list = Array.isArray(data.streams) ? data.streams : (Array.isArray(data.sources) ? data.sources : []);
        var titlePrefix = buildTitlePrefix(mediaType, meta, season, episode);
        var seen = new Set();

        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item || !item.url || seen.has(item.url)) continue;
            seen.add(item.url);

            var langInfo = item.language ? getLanguageInfo(item.language) : getLanguageInfo(meta.originalLanguage);
            var qualityLabel = normalizeQualityLabel(item.quality || item.resolution || '1080p');
            var srv = item.server || item.label || 'Cinezo';
            var subServerLabel = String(srv);
            var isHls = item.type === 'hls' || item.url.indexOf('.m3u8') >= 0;
            var isAdaptive = isHls && (qualityLabel === 'Auto' || item.url.toLowerCase().indexOf('master') >= 0);
            var streamTypeLabel = isAdaptive ? 'Adaptive HLS' : (isHls ? 'HLS' : 'Direct MP4');
            var tech = extractMediaTags([item.quality, item.label, item.title, item.url].filter(Boolean).join(' '));
            var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

            streams.push({
                name: '7Movies | Cinezo › ' + subServerLabel + ' • ' + langInfo.name + ' [' + langInfo.tag + '] (' + qualityLabel + ')' + techSuffix,
                title: titlePrefix + ' [' + langInfo.tag + '] - 7Movies Cinezo ' + subServerLabel + ' [' + qualityLabel + ']' + techSuffix,
                rawTitle: titlePrefix + ' ' + qualityLabel + ' [' + langInfo.tag + ']',
                description: [streamTypeLabel, qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                url: item.url,
                quality: qualityLabel,
                isAdaptive: isAdaptive,
                streamType: streamTypeLabel,
                size: item.size || (mediaType === 'movie' ? '1.8 GB' : '650 MB'),
                type: isHls ? 'm3u8' : 'mp4',
                format: isHls ? 'hls' : 'mp4',
                container: isHls ? 'hls' : 'mp4',
                provider: '7movies',
                server: 'Cinezo',
                subServer: subServerLabel,
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
                headers: headers
            });
        }
    } catch (e) {}
    return { streams: streams, subtitles: subtitles };
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

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});

    if (!tmdbId) return [];

    try {
        var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);

        var results = await Promise.allSettled([
            query7MoviesDownloads(tmdbId, mediaType, season, episode, meta),
            queryVidbolt(tmdbId, mediaType, season, episode, meta),
            queryPunkflix(tmdbId, mediaType, season, episode, meta),
            queryVdrkSubtitles(tmdbId, mediaType, season, episode)
        ]);

        var allStreams = [];
        var seenStreamUrls = new Set();
        var masterSubsMap = new Map();

        function pushStream(st) {
            if (st && st.url && !seenStreamUrls.has(st.url)) {
                seenStreamUrls.add(st.url);
                allStreams.push(st);
            }
        }
        function pushSub(sub) {
            if (sub && sub.url && !masterSubsMap.has(sub.language + '|' + sub.url)) {
                masterSubsMap.set(sub.language + '|' + sub.url, sub);
            }
        }

        if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
            results[0].value.forEach(pushStream);
        }
        for (var i = 1; i <= 2; i++) {
            var r = results[i];
            if (r.status === 'fulfilled' && r.value) {
                (r.value.streams || []).forEach(pushStream);
                (r.value.subtitles || []).forEach(pushSub);
            }
        }
        if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
            results[3].value.forEach(pushSub);
        }

        var aggregatedSubs = Array.from(masterSubsMap.values());
        if (aggregatedSubs.length > 0) {
            for (var idx = 0; idx < allStreams.length; idx++) {
                allStreams[idx].subtitles = aggregatedSubs;
            }
        }

        console.log('[7Movies] Total streams discovered: ' + allStreams.length + ', subtitles: ' + aggregatedSubs.length);
        return allStreams;
    } catch (globalErr) {
        console.error('[7Movies] Unexpected plugin error: ' + globalErr.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
