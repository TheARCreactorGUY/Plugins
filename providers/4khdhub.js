/**
 * 4KHDHub Provider Plugin for Euthopiar / Nuvio
 *
 * Dedicated provider for 4KHDHub (https://4khdhub.one/)
 * Supports Movies, TV Series, Webseries, and Anime.
 *
 * Direct fast streaming engines:
 *  - 4KHDHub | 4K Ultra Server (Videasy 4K Embed)
 *  - 4KHDHub | Fast Direct (Autoembed Player)
 *  - 4KHDHub | Catalog Releases (4khdhub.one content index)
 *
 * Formatted specifically for MatchScorer.kt:
 *  - TV / Series: "Title SxxExx [Audio] [Tag] - Server [Quality]" (+0.25 episode bonus)
 *  - Movies: "Title (Year) [Audio] [Tag] - Server [Quality]" (clean title match)
 */

const BASE_URL = 'https://4khdhub.one';
const TMDB_PROXY_URL = 'https://db.wecollege.net/3';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

const LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' },
    'hi': { name: 'Hindi', tag: 'HIN' },
    'ja': { name: 'Japanese', tag: 'JPN' },
    'es': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' },
    'de': { name: 'German', tag: 'GER' },
    'it': { name: 'Italian', tag: 'ITA' },
    'ko': { name: 'Korean', tag: 'KOR' },
    'ru': { name: 'Russian', tag: 'RUS' },
    'ta': { name: 'Tamil', tag: 'TAM' },
    'te': { name: 'Telugu', tag: 'TEL' },
    'ml': { name: 'Malayalam', tag: 'MAL' },
    'kn': { name: 'Kannada', tag: 'KAN' }
};

function getLanguageInfo(code) {
    if (!code) return { name: 'English', tag: 'ENG' };
    const lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    for (const k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) {
            return LANGUAGE_MAP[k];
        }
    }
    return { name: code.toUpperCase(), tag: code.slice(0, 3).toUpperCase() };
}

function parseAudiosFromText(text) {
    if (!text) return { isMulti: false, primary: 'English', tag: 'ENG', badge: '[ENG]' };
    const upper = text.toUpperCase();
    const langs = [];

    const isMultiCue = /\b(MULTI|DUAL|MULTI-AUDIO|DUAL-AUDIO)\b/i.test(upper) ||
                       (/\b(HINDI|HIN)\b/i.test(upper) && /\b(ENGLISH|ENG)\b/i.test(upper));

    if (/\b(HINDI|HIN)\b/i.test(upper)) langs.push('HIN');
    if (/\b(ENGLISH|ENG)\b/i.test(upper)) langs.push('ENG');
    if (/\b(TAMIL|TAM)\b/i.test(upper)) langs.push('TAM');
    if (/\b(TELUGU|TEL)\b/i.test(upper)) langs.push('TEL');
    if (/\b(JAPANESE|JPN)\b/i.test(upper)) langs.push('JPN');
    if (/\b(SPANISH|SPA)\b/i.test(upper)) langs.push('SPA');
    if (/\b(FRENCH|FRA)\b/i.test(upper)) langs.push('FRA');
    if (/\b(GERMAN|GER)\b/i.test(upper)) langs.push('GER');
    if (/\b(KOREAN|KOR)\b/i.test(upper)) langs.push('KOR');

    const distinct = [...new Set(langs)];
    if (isMultiCue || distinct.length > 1) {
        const langJoin = distinct.length > 0 ? distinct.join(' · ') : 'MULTI';
        return {
            isMulti: true,
            primary: 'Multi',
            tag: 'MULTI',
            badge: '[MULTI] [' + langJoin + ']'
        };
    }

    if (distinct.length === 1) {
        const tag = distinct[0];
        const info = getLanguageInfo(tag.toLowerCase());
        return {
            isMulti: false,
            primary: info.name,
            tag: tag,
            badge: '[' + tag + ']'
        };
    }

    return {
        isMulti: false,
        primary: 'English',
        tag: 'ENG',
        badge: '[ENG]'
    };
}

async function resolveMetadata(tmdbId, mediaType) {
    const extraArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    let title = extraArgs.title || extraArgs.name || '';
    let year = extraArgs.year || (extraArgs.releaseDate ? extraArgs.releaseDate.substring(0, 4) : '');
    let imdbId = extraArgs.imdbId || '';
    let origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title || !year || !origLang) {
        try {
            const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            const res = await fetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, {
                headers: DEFAULT_HEADERS,
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const meta = await res.json();
                title = title || meta.title || meta.name || '';
                const relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? relDate.substring(0, 4) : '');
                imdbId = imdbId || meta.imdb_id || (meta.external_ids ? meta.external_ids.imdb_id : '') || '';
                origLang = origLang || meta.original_language || '';
            }
        } catch (_) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2020',
        imdbId: imdbId || '',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
}

async function search4khdHub(query, isMovie) {
    try {
        const url = BASE_URL + '/?s=' + encodeURIComponent(query);
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) return [];
        const text = await res.text();

        const itemRegex = /href="\/([^"]+(?:-movie-|-series-)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        const results = [];
        let m;
        while ((m = itemRegex.exec(text)) !== null) {
            const slug = m[1].replace(/^\/+|\/+$/g, '');
            const rawTitle = m[2].replace(/<[^>]+>/g, '').trim();
            const linkType = slug.includes('-movie-') ? 'movie' : 'tv';
            results.push({
                url: BASE_URL + '/' + slug + '/',
                slug: slug,
                title: rawTitle || slug,
                type: linkType
            });
        }
        return results;
    } catch (e) {
        return [];
    }
}

async function scrapeDetailPage(pageUrl, targetSeason, targetEpisode, isMovie) {
    try {
        const res = await fetch(pageUrl, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) return { releaseLines: [], streams: [] };
        const text = await res.text();

        const streams = [];

        // Search for direct streamable media or player links on the page
        const linkRegex = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let lMatch;
        while ((lMatch = linkRegex.exec(text)) !== null) {
            const href = lMatch[1].trim();
            const linkText = lMatch[2].replace(/<[^>]+>/g, '').trim();

            if (/\.(?:m3u8|mp4|mkv)\b/i.test(href) || /pixeldrain\.com|fastcloud|hubcloud|gdflix|filemoon/i.test(href)) {
                let quality = '1080p';
                if (/2160p|4k/i.test(linkText + ' ' + href)) quality = '4K 2160p';
                else if (/720p/i.test(linkText + ' ' + href)) quality = '720p';
                else if (/480p/i.test(linkText + ' ' + href)) quality = '480p';

                const audioInfo = parseAudiosFromText(linkText + ' ' + href);
                streams.push({
                    name: '4KHDHub | Direct - ' + linkText.slice(0, 20),
                    url: href,
                    quality: quality,
                    audioInfo: audioInfo
                });
            }
        }

        return { streams };
    } catch (_) {
        return { streams: [] };
    }
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    extraArgs = extraArgs || {};
    const isMovie = mediaType === 'movie';
    const sNum = Number(season) || 1;
    const eNum = Number(episode) || 1;

    console.log('[4KHDHub] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    const meta = await resolveMetadata(tmdbId, mediaType);
    console.log('[4KHDHub] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage);

    const streams = [];

    // Construct season/episode marker strictly for MatchScorer.kt
    const epTag = !isMovie ?
        ('S' + String(sNum).padStart(2, '0') + 'E' + String(eNum).padStart(2, '0')) :
        '';

    const titlePrefix = !isMovie ?
        (meta.title + ' ' + epTag) :
        (meta.title + (meta.year ? ' (' + meta.year + ')' : ''));

    const origLangInfo = getLanguageInfo(meta.originalLanguage);

    // 1. Primary Direct Engine: 4KHDHub Videasy 4K Embed
    const videasyUrl = isMovie ?
        ('https://player.videasy.net/movie/' + tmdbId) :
        ('https://player.videasy.net/tv/' + tmdbId + '/' + sNum + '/' + eNum);

    streams.push({
        name: '4KHDHub | 4K Ultra Server • Multi [MULTI] (4K 2160p)',
        title: titlePrefix + ' [MULTI] - 4KHDHub Videasy [4K 2160p]',
        url: videasyUrl,
        quality: '4K 2160p',
        type: 'embed',
        provider: '4khdhub',
        language: 'multi',
        headers: Object.assign({}, DEFAULT_HEADERS)
    });

    // 2. Secondary Direct Engine: 4KHDHub Autoembed
    const autoembedUrl = isMovie ?
        ('https://player.autoembed.cc/embed/movie/' + tmdbId) :
        ('https://player.autoembed.cc/embed/tv/' + tmdbId + '/' + sNum + '/' + eNum);

    streams.push({
        name: '4KHDHub | Fast Direct • ' + origLangInfo.name + ' [' + origLangInfo.tag + '] (1080p)',
        title: titlePrefix + ' [' + origLangInfo.tag + '] - 4KHDHub Autoembed [1080p]',
        url: autoembedUrl,
        quality: '1080p',
        type: 'embed',
        provider: '4khdhub',
        language: meta.originalLanguage,
        headers: Object.assign({}, DEFAULT_HEADERS)
    });

    // 3. Search 4khdhub.one catalog index for additional releases
    try {
        const searchResults = await search4khdHub(meta.title, isMovie);
        if (searchResults.length > 0) {
            const matching = searchResults.find(r => isMovie ? r.type === 'movie' : r.type === 'tv') || searchResults[0];
            if (matching) {
                console.log('[4KHDHub] Found catalog page:', matching.url);
                const detail = await scrapeDetailPage(matching.url, sNum, eNum, isMovie);

                if (detail.streams && detail.streams.length > 0) {
                    for (const s of detail.streams) {
                        const aInfo = s.audioInfo || origLangInfo;
                        streams.push({
                            name: s.name + ' • ' + (aInfo.badge || '[' + aInfo.tag + ']'),
                            title: titlePrefix + ' ' + (aInfo.badge || '[' + aInfo.tag + ']') + ' - 4KHDHub [' + s.quality + ']',
                            url: s.url,
                            quality: s.quality,
                            type: s.url.includes('.m3u8') ? 'm3u8' : 'mp4',
                            provider: '4khdhub',
                            language: aInfo.tag.toLowerCase(),
                            headers: Object.assign({}, DEFAULT_HEADERS)
                        });
                    }
                }
            }
        }
    } catch (catErr) {
        console.log('[4KHDHub] Catalog search notice:', catErr.message);
    }

    console.log('[4KHDHub] Discovered ' + streams.length + ' stream(s)');
    return streams;
}

module.exports = {
    getStreams,
    resolveMetadata
};
