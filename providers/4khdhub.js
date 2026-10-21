/**
 * 4KHDHub Provider Plugin for Euthopiar / Nuvio
 *
 * Dedicated provider for 4KHDHub (https://4khdhub.one/)
 * Supports Movies, TV Series, Webseries, and Anime.
 *
 * Native Direct High-Speed Engines:
 *  - FSL R2 Server (Direct Cloudflare R2 Presigned Streaming)
 *  - Server : 10Gbps (Pixel Cloud / Google User Content)
 *  - ZipDisk Server (Cloudflare Edge Direct Stream)
 *  - Pixeldrain Server (Direct Stream CDN)
 *  - FSL Direct / Buzz Server (High-Speed Direct Stream)
 *
 * Formatted specifically for MatchScorer.kt:
 *  - TV / Series / Anime: "Title SxxExx [Audio] - Server [Quality]" (+0.25 episode bonus)
 *  - Movies: "Title (Year) [Audio] - Server [Quality]" (clean movie match)
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
    if (/\b(KOREAN|KOR)\b/i.test(upper)) langs.push('KOR');
    if (/\b(JAPANESE|JPN)\b/i.test(upper)) langs.push('JPN');
    if (/\b(SPANISH|SPA)\b/i.test(upper)) langs.push('SPA');
    if (/\b(FRENCH|FRA)\b/i.test(upper)) langs.push('FRA');
    if (/\b(GERMAN|GER)\b/i.test(upper)) langs.push('GER');
    if (/\b(RUSSIAN|RUS)\b/i.test(upper)) langs.push('RUS');
    if (/\b(MALAYALAM|MAL)\b/i.test(upper)) langs.push('MAL');
    if (/\b(KANNADA|KAN)\b/i.test(upper)) langs.push('KAN');

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

function parseQualityFromText(text) {
    if (!text) return '1080p';
    if (/2160p|4k\b|uhd\b/i.test(text)) return '4K 2160p';
    if (/1080p|fhd\b/i.test(text)) return '1080p';
    if (/720p|hd\b/i.test(text)) return '720p';
    if (/480p|sd\b/i.test(text)) return '480p';
    return '1080p';
}

function rot13(str) {
    return str.replace(/[a-zA-Z]/g, function(c) {
        var base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
}

function decodeGreenmotorsPayload(encoded) {
    try {
        let s1 = Buffer.from(encoded, 'base64').toString('utf8');
        let s2 = Buffer.from(s1, 'base64').toString('utf8');
        let s3 = rot13(s2);
        let s4 = Buffer.from(s3, 'base64').toString('utf8');
        let parsed = JSON.parse(s4);
        return Buffer.from(parsed.o, 'base64').toString('utf8');
    } catch(e) {
        return null;
    }
}

async function resolveGreenmotorsUrl(gmUrl) {
    try {
        const res = await fetch(gmUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(6000)
        });
        const text = await res.text();
        const m = text.match(/s\('o',\s*'([^']+)'/);
        if (!m) return null;
        return decodeGreenmotorsPayload(m[1]);
    } catch(e) {
        return null;
    }
}

async function resolveHubCloud(hubUrl) {
    try {
        const res = await fetch(hubUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://greenmotors.cc/'
            },
            signal: AbortSignal.timeout(6000)
        });
        const text = await res.text();

        // Follow nested hubdrive redirects if needed
        if (hubUrl.includes('hubdrive.')) {
            const m = text.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (m) return resolveHubCloud(m[0]);
        }

        const gx = text.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        if (!gx) return [];

        const gRes = await fetch(gx[0], {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': hubUrl
            },
            signal: AbortSignal.timeout(6000)
        });
        const gText = await gRes.text();

        const servers = [];
        const seenUrls = new Set();
        const aRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = aRegex.exec(gText)) !== null) {
            const href = match[1];
            const label = match[2].replace(/<[^>]+>/g, '').trim();
            if (seenUrls.has(href)) continue;
            seenUrls.add(href);

            if (label.includes('FSL Server') || href.includes('r2.cloudflarestorage.com')) {
                servers.push({
                    serverName: 'FSL R2',
                    displayName: 'FSL R2 Server',
                    url: href
                });
            } else if (label.includes('10Gbps') || href.includes('pixel.hubcloud.ist')) {
                servers.push({
                    serverName: 'Pixel Cloud',
                    displayName: 'Server : 10Gbps (Pixel Cloud)',
                    url: href
                });
            } else if (label.includes('PixelServer') || href.includes('pixeldrain')) {
                servers.push({
                    serverName: 'Pixeldrain',
                    displayName: 'Pixeldrain Server',
                    url: href
                });
            } else if (label.includes('ZipDisk') || href.includes('workers.dev')) {
                servers.push({
                    serverName: 'ZipDisk',
                    displayName: 'ZipDisk Server',
                    url: href
                });
            } else if (label.includes('Buzz Server') || href.includes('fuckingfast')) {
                servers.push({
                    serverName: 'FSL Direct / Buzz',
                    displayName: 'FSL Direct / Buzz Server',
                    url: href
                });
            }
        }
        return servers;
    } catch(e) {
        return [];
    }
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    let title = extraArgs.title || extraArgs.name || '';
    let year = extraArgs.year || (extraArgs.releaseDate ? extraArgs.releaseDate.substring(0, 4) : '');
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
                origLang = origLang || meta.original_language || '';
            }
        } catch (_) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2020',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
}

async function search4khdHub(query, isMovie) {
    try {
        const url = BASE_URL + '/?s=' + encodeURIComponent(query);
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(7000)
        });
        if (!res.ok) return [];
        const text = await res.text();

        const results = [];
        const cardRegex = /<a[^>]+href="([^"]*(?:-movie-|-series-)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = cardRegex.exec(text)) !== null) {
            const href = m[1];
            const raw = m[2];
            const titleMatch = raw.match(/alt="([^"]+)"/i) || raw.match(/aria-label="([^"]+)"/i);
            const title = titleMatch ? titleMatch[1].replace(/ details$/i, '').trim() : '';
            const fullUrl = href.startsWith('http') ? href : (BASE_URL + (href.startsWith('/') ? '' : '/') + href);
            const isMov = fullUrl.includes('-movie-');
            results.push({
                url: fullUrl,
                title: title,
                type: isMov ? 'movie' : 'tv'
            });
        }
        return results;
    } catch(e) {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    extraArgs = extraArgs || {};
    const isMovie = mediaType === 'movie';
    const sNum = Number(season) || 1;
    const eNum = Number(episode) || 1;

    console.log('[4KHDHub] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    const meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[4KHDHub] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage);

    const epTag = !isMovie ?
        ('S' + String(sNum).padStart(2, '0') + 'E' + String(eNum).padStart(2, '0')) :
        '';

    // Search 4khdhub for the catalog entry
    const searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const searchResults = await search4khdHub(searchTitle, isMovie);
    console.log('[4KHDHub] Search found ' + searchResults.length + ' candidates');

    if (searchResults.length === 0) {
        return [];
    }

    const matching = searchResults.find(r => isMovie ? r.type === 'movie' : r.type === 'tv') || searchResults[0];
    console.log('[4KHDHub] Selected detail page: ' + matching.url);

    const pageRes = await fetch(matching.url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(8000)
    });
    if (!pageRes.ok) return [];
    const html = await pageRes.text();

    const releases = [];
    const epRegex = new RegExp('(?:S0*' + sNum + '\\s*E0*' + eNum + '|Episode[-_\\s]*0*' + eNum + ')\\b', 'i');

    if (!isMovie) {
        // TV Series: parse individual episode blocks
        const epSectionIdx = html.indexOf('id="episodes"');
        const searchArea = epSectionIdx !== -1 ? html.slice(epSectionIdx) : html;
        const blocks = searchArea.split('<div class="episode-download-item">');

        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const titleMatch = block.match(/<div class="episode-file-title">([\s\S]*?)<\/div>/i);
            const linkMatch = block.match(/href="(https:\/\/greenmotors\.[^"]+)"/i);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            const link = linkMatch ? linkMatch[1] : '';

            if (link && epRegex.test(title)) {
                releases.push({
                    rawTitle: title,
                    quality: parseQualityFromText(title),
                    audio: parseAudiosFromText(title),
                    link: link
                });
            }
        }
    } else {
        // Movies: parse file quality blocks
        const blocks = html.split(/<div id="content-file\d+"/i);
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const titleMatch = block.match(/<div class="file-title">([\s\S]*?)<\/div>/i);
            const linkMatch = block.match(/href="(https:\/\/greenmotors\.[^"]+)"/i);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            const link = linkMatch ? linkMatch[1] : '';

            if (link) {
                releases.push({
                    rawTitle: title,
                    quality: parseQualityFromText(title),
                    audio: parseAudiosFromText(title),
                    link: link
                });
            }
        }
    }

    console.log('[4KHDHub] Found ' + releases.length + ' matching release(s) on page');
    if (releases.length === 0) return [];

    // Process up to 8 releases to ensure we cover 4K UHD, 1080p, and multi-host options
    const selectedReleases = releases.slice(0, 8);

    // Concurrently unpack greenmotors -> HubCloud -> direct servers
    const tasks = selectedReleases.map(async (rel) => {
        const hubUrl = await resolveGreenmotorsUrl(rel.link);
        if (!hubUrl) return [];
        const servers = await resolveHubCloud(hubUrl);
        return servers.map(srv => ({
            release: rel,
            server: srv
        }));
    });

    const settled = await Promise.all(tasks);
    const flattened = settled.flat();

    const streams = [];
    const seenStreamKeys = new Set();

    for (const item of flattened) {
        const rel = item.release;
        const srv = item.server;
        const audio = rel.audio;
        const quality = rel.quality;

        const dedupeKey = srv.url + '|' + quality;
        if (seenStreamKeys.has(dedupeKey)) continue;
        seenStreamKeys.add(dedupeKey);

        let streamTitle;
        let displayName;

        if (!isMovie) {
            // MatchScorer format for Series / Anime (+0.25 episode bonus)
            streamTitle = meta.title + ' ' + epTag + ' ' + audio.badge + ' - 4KHDHub ' + srv.serverName + ' [' + quality + ']';
            displayName = '4KHDHub | ' + srv.displayName + ' • ' + audio.badge + ' (' + quality + ')';
        } else {
            // MatchScorer clean format for Movies
            streamTitle = meta.title + ' (' + meta.year + ') ' + audio.badge + ' - 4KHDHub ' + srv.serverName + ' [' + quality + ']';
            displayName = '4KHDHub | ' + srv.displayName + ' • ' + audio.badge + ' (' + quality + ')';
        }

        streams.push({
            name: displayName,
            title: streamTitle,
            url: srv.url,
            quality: quality,
            type: srv.url.includes('.m3u8') ? 'm3u8' : 'mp4',
            provider: '4khdhub',
            language: audio.tag.toLowerCase(),
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://greenmotors.cc/'
            }
        });
    }

    console.log('[4KHDHub] Discovered ' + streams.length + ' direct stream(s)');
    return streams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams,
        resolveMetadata
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
    globalThis.resolveMetadata = resolveMetadata;
}
