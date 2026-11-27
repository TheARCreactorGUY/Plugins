/**
 * Bingr Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * High-speed parallel aggregator across active Bingr streaming backends
 * (Vidbolt: Orion, Callisto, Vega, Zephyr; Cinezo/Punkflix: Jennifer, Direct)
 * with dynamic multi-audio tagging, Adaptive/Direct stream classification,
 * and cross-server VTT subtitle aggregation.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://bingr.one';
var VIDBOLT_BASE = 'https://vidbolt.xyz';
var PUNKFLIX_BASE = 'https://punkflix.net';
var CINEZO_REFERER = 'https://player.cinezo.live/';
var SUB_VDRK_URL = 'https://sub.vdrk.site/v2';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL
};

var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG', code: 'en' },
    'eng': { name: 'English', tag: 'ENG', code: 'en' },
    'ja': { name: 'Japanese', tag: 'JPN', code: 'ja' },
    'jpn': { name: 'Japanese', tag: 'JPN', code: 'ja' },
    'ko': { name: 'Korean', tag: 'KOR', code: 'ko' },
    'kor': { name: 'Korean', tag: 'KOR', code: 'ko' },
    'es': { name: 'Spanish', tag: 'SPA', code: 'es' },
    'spa': { name: 'Spanish', tag: 'SPA', code: 'es' },
    'fr': { name: 'French', tag: 'FRA', code: 'fr' },
    'fra': { name: 'French', tag: 'FRA', code: 'fr' },
    'de': { name: 'German', tag: 'GER', code: 'de' },
    'ger': { name: 'German', tag: 'GER', code: 'de' },
    'it': { name: 'Italian', tag: 'ITA', code: 'it' },
    'ita': { name: 'Italian', tag: 'ITA', code: 'it' },
    'hi': { name: 'Hindi', tag: 'HIN', code: 'hi' },
    'hin': { name: 'Hindi', tag: 'HIN', code: 'hi' },
    'ta': { name: 'Tamil', tag: 'TAM', code: 'ta' },
    'tam': { name: 'Tamil', tag: 'TAM', code: 'ta' },
    'te': { name: 'Telugu', tag: 'TEL', code: 'te' },
    'tel': { name: 'Telugu', tag: 'TEL', code: 'te' },
    'zh': { name: 'Chinese', tag: 'CHI', code: 'zh' },
    'chi': { name: 'Chinese', tag: 'CHI', code: 'zh' },
    'ru': { name: 'Russian', tag: 'RUS', code: 'ru' },
    'rus': { name: 'Russian', tag: 'RUS', code: 'ru' },
    'pt': { name: 'Portuguese', tag: 'POR', code: 'pt' },
    'por': { name: 'Portuguese', tag: 'POR', code: 'pt' },
    'ar': { name: 'Arabic', tag: 'ARA', code: 'ar' },
    'ara': { name: 'Arabic', tag: 'ARA', code: 'ar' },
    'multi': { name: 'Multi', tag: 'MULTI', code: 'multi' }
};

function getLanguageInfo(code) {
    if (!code) return { name: 'English', tag: 'ENG', code: 'en' };
    var lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    for (var k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) {
            return LANGUAGE_MAP[k];
        }
    }
    return {
        name: lower.charAt(0).toUpperCase() + lower.slice(1),
        tag: lower.slice(0, 3).toUpperCase(),
        code: lower.slice(0, 2)
    };
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

async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 2600;
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

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title || !year || !origLang) {
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
                origLang = origLang || meta.original_language || '';
            }
        } catch (e) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2020',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
}

async function queryVidbolt(tmdbId, mediaType, season, episode, meta, timeoutMs) {
    var streams = [];
    var subtitles = [];
    var headers = {
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
        'Referer': VIDBOLT_BASE + '/'
    };

    var queryPath = 'id=' + encodeURIComponent(tmdbId);
    if (mediaType === 'movie') {
        queryPath = 'type=movie&' + queryPath;
    } else if (mediaType === 'anime') {
        queryPath = 'type=anime&' + queryPath + '&episode=' + (episode || 1);
    } else {
        queryPath = 'type=tv&' + queryPath + '&season=' + (season || 1) + '&episode=' + (episode || 1);
    }

    var vidboltServers = ['orion', 'callisto', 'vega', 'zephyr'];
    var seenUrls = new Set();

    var serverPromises = vidboltServers.map(async function(srv) {
        try {
            var res = await fetchWithTimeout(VIDBOLT_BASE + '/api/resolve?' + queryPath + '&only=' + srv, {
                headers: headers
            }, timeoutMs || 2600);

            if (!res.ok) return;
            var data = await res.json();
            var streamObj = data && data.stream;
            if (!streamObj || !Array.isArray(streamObj.sources)) return;

            var serverName = streamObj.server
                ? (streamObj.server.charAt(0).toUpperCase() + streamObj.server.slice(1))
                : (srv.charAt(0).toUpperCase() + srv.slice(1));

            if (Array.isArray(streamObj.subtitles)) {
                for (var sIdx = 0; sIdx < streamObj.subtitles.length; sIdx++) {
                    var s = streamObj.subtitles[sIdx];
                    if (s && s.url) {
                        var sLabel = s.label || s.lang || 'English';
                        subtitles.push({
                            url: s.url,
                            language: sLabel,
                            lang: sLabel,
                            name: sLabel,
                            headers: headers
                        });
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

                var isMovie = mediaType === 'movie';
                var epTag = !isMovie ? ('S' + String(season || 1).padStart(2, '0') + 'E' + String(episode || 1).padStart(2, '0')) : '';
                var titlePrefix = !isMovie ? (meta.title + ' ' + epTag) : (meta.title + (meta.year ? ' (' + meta.year + ')' : ''));

                streams.push({
                    name: 'Bingr | Vidbolt › ' + serverName + ' • ' + langInfo.name + ' [' + langInfo.tag + '] (' + qualityLabel + ')' + techSuffix,
                    title: titlePrefix + ' [' + langInfo.tag + '] - Bingr Vidbolt ' + serverName + ' [' + qualityLabel + ']' + techSuffix,
                    rawTitle: titlePrefix + ' ' + qualityLabel + ' [' + langInfo.tag + ']',
                    description: [streamTypeLabel, qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                    url: src.url,
                    quality: qualityLabel,
                    isAdaptive: isAdaptive,
                    streamType: streamTypeLabel,
                    size: isMovie ? '2.0 GB' : '750 MB',
                    type: isHls ? 'm3u8' : 'mp4',
                    format: isHls ? 'hls' : 'mp4',
                    container: isHls ? 'hls' : 'mp4',
                    provider: 'bingr',
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

    await Promise.allSettled(serverPromises);
    return { streams: streams, subtitles: subtitles };
}

async function queryPunkflix(tmdbId, mediaType, season, episode, meta, timeoutMs) {
    var streams = [];
    var subtitles = [];

    try {
        var headers = {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': CINEZO_REFERER
        };

        var url = mediaType === 'movie'
            ? (PUNKFLIX_BASE + '/movie/' + tmdbId + '.json')
            : (PUNKFLIX_BASE + '/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1) + '.json');

        var res = await fetchWithTimeout(url, { headers: headers }, timeoutMs || 2600);
        if (!res.ok) return { streams: streams, subtitles: subtitles };

        var data = await res.json();
        if (!data) return { streams: streams, subtitles: subtitles };

        if (Array.isArray(data.subtitles)) {
            for (var sIdx = 0; sIdx < data.subtitles.length; sIdx++) {
                var sub = data.subtitles[sIdx];
                if (sub && sub.url) {
                    var sInfo = getLanguageInfo(sub.language || 'en');
                    var subName = sub.title ? (sInfo.name + ' (' + sub.title + ')') : sInfo.name;
                    subtitles.push({
                        url: sub.url,
                        language: sInfo.name,
                        lang: sInfo.name,
                        name: subName,
                        headers: headers
                    });
                }
            }
        }

        var isMulti = false;
        var audioLang = null;
        var multiTokens = [];

        if (Array.isArray(data.audio) && data.audio.length > 1) {
            isMulti = true;
            var distinctSet = new Set();
            for (var aIdx = 0; aIdx < data.audio.length; aIdx++) {
                var l = data.audio[aIdx] && data.audio[aIdx].language;
                if (l && l !== 'und') distinctSet.add(getLanguageInfo(l).tag);
            }
            multiTokens = Array.from(distinctSet);
        } else if (Array.isArray(data.audio) && data.audio.length === 1) {
            var aud = data.audio[0];
            if (aud && aud.language && aud.language !== 'und') audioLang = aud.language;
        }

        var langInfo, tagString;
        if (isMulti) {
            langInfo = { name: 'Multi', tag: 'MULTI', code: 'multi' };
            tagString = multiTokens.length > 0 ? ('[MULTI] [' + multiTokens.join(' · ') + ']') : '[MULTI]';
        } else if (audioLang) {
            langInfo = getLanguageInfo(audioLang);
            tagString = '[' + langInfo.tag + ']';
        } else {
            langInfo = getLanguageInfo(meta.originalLanguage);
            tagString = '[' + langInfo.tag + ']';
        }

        var rawQuality = (data.quality && data.quality.resolution) ? data.quality.resolution : '1080p';
        var qualityLabel = normalizeQualityLabel(rawQuality);
        var techText = [
            data.filename,
            data.title,
            data.quality && data.quality.source,
            data.video && data.video.codec,
            data.video && data.video.hdr
        ].filter(Boolean).join(' ');
        var tech = extractMediaTags(techText);
        var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

        var isMovie = mediaType === 'movie';
        var epTag = !isMovie ? ('S' + String(season || 1).padStart(2, '0') + 'E' + String(episode || 1).padStart(2, '0')) : '';
        var titlePrefix = !isMovie ? (meta.title + ' ' + epTag) : (meta.title + (meta.year ? ' (' + meta.year + ')' : ''));

        if (data.stream && data.stream.hls) {
            streams.push({
                name: 'Bingr | Cinezo › Jennifer • ' + langInfo.name + ' ' + tagString + ' (' + qualityLabel + ')' + techSuffix,
                title: titlePrefix + ' ' + tagString + ' - Bingr Cinezo Jennifer [' + qualityLabel + ']' + techSuffix,
                rawTitle: data.filename || (titlePrefix + ' ' + qualityLabel + ' ' + tagString),
                description: ['Adaptive HLS', qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                url: data.stream.hls,
                quality: qualityLabel,
                isAdaptive: true,
                streamType: 'Adaptive HLS',
                size: isMovie ? '2.0 GB' : '750 MB',
                type: 'm3u8',
                format: 'hls',
                container: 'hls',
                provider: 'bingr',
                server: 'Cinezo',
                subServer: 'Jennifer',
                language: langInfo.code,
                audio: {
                    isMulti: isMulti,
                    primary: langInfo.name,
                    tag: langInfo.tag,
                    badge: tagString
                },
                hdrType: tech.hdrType,
                codec: tech.codec,
                audioFormat: tech.audioFormat,
                sourceType: tech.sourceType,
                tags: tech.tags,
                headers: headers
            });
        }

        if (data.stream && (data.stream.remux || data.stream.original)) {
            var fileUrl = data.stream.remux || data.stream.original;
            var isMkv = fileUrl.toLowerCase().indexOf('.mkv') >= 0;
            streams.push({
                name: 'Bingr | Cinezo › Direct • ' + langInfo.name + ' ' + tagString + ' (' + qualityLabel + ')' + techSuffix,
                title: titlePrefix + ' ' + tagString + ' - Bingr Cinezo Direct [' + qualityLabel + ']' + techSuffix,
                rawTitle: data.filename || (titlePrefix + ' ' + qualityLabel + ' ' + tagString),
                description: [isMkv ? 'Direct MKV' : 'Direct MP4', qualityLabel, langInfo.name].concat(tech.tags).join(' • '),
                url: fileUrl,
                quality: qualityLabel,
                isAdaptive: false,
                streamType: isMkv ? 'Direct MKV' : 'Direct MP4',
                size: isMovie ? '2.2 GB' : '850 MB',
                type: 'mp4',
                format: isMkv ? 'mkv' : 'mp4',
                container: isMkv ? 'mkv' : 'mp4',
                provider: 'bingr',
                server: 'Cinezo',
                subServer: 'Direct',
                language: langInfo.code,
                audio: {
                    isMulti: isMulti,
                    primary: langInfo.name,
                    tag: langInfo.tag,
                    badge: tagString
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

    return { streams: streams, subtitles: subtitles };
}

async function queryVdrkSubtitles(tmdbId, mediaType, season, episode) {
    try {
        var subUrl = mediaType === 'movie'
            ? (SUB_VDRK_URL + '/movie/' + encodeURIComponent(tmdbId))
            : (SUB_VDRK_URL + '/tv/' + encodeURIComponent(tmdbId) + '/' + (season || 1) + '/' + (episode || 1));
        var res = await fetchWithTimeout(subUrl, { headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] } }, 2200);
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
                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
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

        var queryResults = await Promise.allSettled([
            queryVidbolt(tmdbId, mediaType, season, episode, meta, 2600),
            queryPunkflix(tmdbId, mediaType, season, episode, meta, 2600),
            queryVdrkSubtitles(tmdbId, mediaType, season, episode)
        ]);

        var allStreams = [];
        var masterSubsMap = new Map();

        for (var i = 0; i < 2; i++) {
            var res = queryResults[i];
            if (res.status === 'fulfilled' && res.value) {
                var streams = res.value.streams || [];
                var subs = res.value.subtitles || [];
                for (var s = 0; s < streams.length; s++) allStreams.push(streams[s]);
                for (var k = 0; k < subs.length; k++) {
                    var sub = subs[k];
                    if (sub && sub.url && !masterSubsMap.has(sub.language + '|' + sub.url)) {
                        masterSubsMap.set(sub.language + '|' + sub.url, sub);
                    }
                }
            }
        }

        if (queryResults[2].status === 'fulfilled' && Array.isArray(queryResults[2].value)) {
            var extraSubs = queryResults[2].value;
            for (var eIdx = 0; eIdx < extraSubs.length; eIdx++) {
                var eSub = extraSubs[eIdx];
                if (eSub && eSub.url && !masterSubsMap.has(eSub.language + '|' + eSub.url)) {
                    masterSubsMap.set(eSub.language + '|' + eSub.url, eSub);
                }
            }
        }

        var aggregatedSubtitles = Array.from(masterSubsMap.values());
        if (aggregatedSubtitles.length > 0) {
            for (var idx = 0; idx < allStreams.length; idx++) {
                allStreams[idx].subtitles = aggregatedSubtitles;
            }
        }

        console.log('[Bingr] Total streams discovered: ' + allStreams.length + ', subtitles: ' + aggregatedSubtitles.length);
        return allStreams;
    } catch (globalErr) {
        console.error('[Bingr] Unexpected plugin error: ' + globalErr.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
