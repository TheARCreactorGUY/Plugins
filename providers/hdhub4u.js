/**
 * HDHub4u Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated high-speed direct stream provider for HDHub4u (https://HDhub4u.tv / https://new8.hdhub4u.cl)
 * Supports Bollywood, Hollywood Hindi Dubbed, South Indian Regional, and Web Series.
 *
 * High-Speed Direct CDN Streaming Engines:
 *  - HDHub4u | FSL R2 Server (Direct Cloudflare R2 Presigned S3)
 *  - HDHub4u | 10Gbps Pixel Cloud (Google Cloud CDN)
 *  - HDHub4u | Pixeldrain Server (High-Speed Direct Stream)
 *  - HDHub4u | ZipDisk Server (Cloudflare Edge Direct Stream)
 *
 * Features:
 *  - Dynamic active domain discovery via Pingora API (https://dns.pingora.fyi/v2/ping).
 *  - Instant Typesense search indexing (https://search.pingora.fyi/collections/post/documents/search).
 *  - HubDrive & HubCloud CDN gateway resolution with Cloudflare Turnstile bypass.
 *  - Full TV Series season & episode targeting (SxxExx).
 *  - Dynamic multi-audio track extraction ([MULTI] [HIN · TEL], [HIN], etc.).
 *  - Strict compliance with MatchScorer.kt and Euthopiar DownloadEngine.
 */

/* =========================================================================
   CONFIG BLOCK: Endpoints and Active Gateway Seeds
   ========================================================================= */
var BASE_URL = 'https://new9.hdhub4u.cl';
var BACKUP_URLS = [
    'https://new9.hdhub4u.cl',
    'https://new8.hdhub4u.cl',
    'https://hdhub4u.ms',
    'https://hdhub4u.tv',
    'https://hdhub4u.fans',
    'https://hdhub4u.kg',
    'https://hdhub4u.ec'
];
var DYNAMIC_CONFIG_ENDPOINTS = [
    'https://dns.pingora.fyi/v2/ping',
    'https://cdn.hub4u.cloud/v2/ping',
    'https://srv-1.cdndot.fans/v2/ping'
];
var TYPESENSE_SEARCH_URL = 'https://search.pingora.fyi/collections/post/documents/search';
var TMDB_BASE_URL = 'https://api.themoviedb.org/3';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

var cachedBaseUrl = null;
var lastBaseUrlCheck = 0;

function safeFetch(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var timer;
    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error('Request timed out: ' + url));
        }, timeoutMs);
    });

    return Promise.race([
        fetch(url, options),
        timeoutPromise
    ]).then(function(res) {
        clearTimeout(timer);
        return res;
    }, function(err) {
        clearTimeout(timer);
        throw err;
    });
}

function pad(num, size) {
    var s = String(num);
    while (s.length < (size || 2)) s = '0' + s;
    return s;
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Strict quality hierarchy detector (Downscaled 4K trap-safe).
 */
function parseQualityFromText(text) {
    if (!text) return null;
    var t = String(text);

    // 1. Explicit 2160p is definitely 4K UHD
    if (/\b2160p\b/i.test(t)) return '4K 2160p';

    // 2. Explicit 1440p / 2K
    if (/\b(1440p|2k)\b/i.test(t)) return '1440p';

    // 3. Explicit 1080p or 1080i is definitely 1080p (even if 'DS4K' or '4K Remastered' is in the string)
    if (/\b(1080[pi]|fhd)\b/i.test(t)) return '1080p';

    // 4. Explicit 720p is definitely 720p
    if (/\b720p\b/i.test(t)) return '720p';

    // 5. Explicit 480p / 540p / 576p / 360p
    if (/\b(480p|540p|576p|360p|sd)\b/i.test(t)) return '480p';

    // 6. Clean string from site watermarks and DS4K qualifiers before testing standalone 4K
    var clean = t.replace(/\bds-?4k\b/gi, '')
                 .replace(/\b4k[-_ ]?hdhub[a-z0-9.]*\b/gi, '')
                 .replace(/4k[- ]?remaster(?:ed)?/gi, '')
                 .replace(/4k[- ]?sdr/gi, '')
                 .replace(/4k[- ]?hdr/gi, '');

    if (/\b(?:4k|uhd)\b/i.test(clean)) return '4K 2160p';
    if (/\b(?:hd)\b/i.test(clean) && !/hdrip|webrip|hdts|hdtc/i.test(clean)) return '720p';

    return null;
}

function extractQualityFromContext(html, linkIndex, label) {
    var q = parseQualityFromText(label);
    if (q) return q;

    var sliceBefore = html.substring(Math.max(0, linkIndex - 1500), linkIndex);
    var cleanSlice = sliceBefore.replace(/hdrip|webrip|bluray|hdts|hdtc/gi, ' ');
    var matches = [];
    var qRegex = /\b(2160p|4k\b|uhd\b|1080[pi]\b|fhd\b|720p\b|540p\b|480p\b|360p\b)/gi;
    var qm;
    while ((qm = qRegex.exec(cleanSlice)) !== null) {
        matches.push(qm[1]);
    }
    if (matches.length > 0) {
        var lastMatch = matches[matches.length - 1];
        var found = parseQualityFromText(lastMatch);
        if (found) return found;
    }

    var generalMatch = cleanSlice.match(/\b(hd|sd)\b/i);
    if (generalMatch) {
        var gFound = parseQualityFromText(generalMatch[1]);
        if (gFound) return gFound;
    }

    return '1080p';
}

function parseAudiosFromText(text) {
    if (!text) return { isMulti: false, primary: 'Hindi', tag: 'HIN', badge: '[HIN]' };
    var upper = String(text).toUpperCase();
    var langs = [];

    var isMultiCue = /\b(MULTI|DUAL|MULTI-AUDIO|DUAL-AUDIO)\b/i.test(upper) ||
                     (/\b(HINDI|HIN)\b/i.test(upper) && /\b(ENGLISH|ENG)\b/i.test(upper));

    if (/\b(HINDI|HIN)\b/i.test(upper)) langs.push('HIN');
    if (/\b(ENGLISH|ENG)\b/i.test(upper)) langs.push('ENG');
    if (/\b(TAMIL|TAM)\b/i.test(upper)) langs.push('TAM');
    if (/\b(TELUGU|TEL)\b/i.test(upper)) langs.push('TEL');
    if (/\b(MALAYALAM|MAL)\b/i.test(upper)) langs.push('MAL');
    if (/\b(KANNADA|KAN)\b/i.test(upper)) langs.push('KAN');
    if (/\b(BENGALI|BEN)\b/i.test(upper)) langs.push('BEN');
    if (/\b(MARATHI|MAR)\b/i.test(upper)) langs.push('MAR');
    if (/\b(KOREAN|KOR)\b/i.test(upper)) langs.push('KOR');
    if (/\b(JAPANESE|JPN)\b/i.test(upper)) langs.push('JPN');
    if (/\b(SPANISH|SPA)\b/i.test(upper)) langs.push('SPA');
    if (/\b(FRENCH|FRA)\b/i.test(upper)) langs.push('FRA');
    if (/\b(GERMAN|GER)\b/i.test(upper)) langs.push('GER');

    var distinct = [];
    for (var i = 0; i < langs.length; i++) {
        if (distinct.indexOf(langs[i]) === -1) distinct.push(langs[i]);
    }

    if (isMultiCue || distinct.length > 1) {
        var detailTag = distinct.length > 0 ? distinct.join(' · ') : 'HIN · ENG';
        return {
            isMulti: true,
            primary: 'Multi',
            tag: 'MULTI',
            badge: '[MULTI] [' + detailTag + ']'
        };
    }

    if (distinct.length === 1) {
        var single = distinct[0];
        var nameMap = {
            'HIN': 'Hindi', 'ENG': 'English', 'TAM': 'Tamil', 'TEL': 'Telugu',
            'MAL': 'Malayalam', 'KAN': 'Kannada', 'BEN': 'Bengali', 'MAR': 'Marathi'
        };
        return {
            isMulti: false,
            primary: nameMap[single] || single,
            tag: single,
            badge: '[' + single + ']'
        };
    }

    return { isMulti: false, primary: 'Hindi', tag: 'HIN', badge: '[HIN]' };
}

/**
 * Resolves TMDB metadata using host args or TMDB proxy.
 */
async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var isMovie = mediaType === 'movie';
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';
    var imdbId = extraArgs.imdbId || '';

    if (!title && tmdbId) {
        try {
            var url = TMDB_BASE_URL + '/' + (isMovie ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=test';
            var res = await safeFetch(url, { headers: { 'Accept': 'application/json' } }, 5000);
            if (res.ok) {
                var meta = await res.json();
                title = meta.title || meta.name || '';
                var relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? String(relDate).substring(0, 4) : '');
                origLang = origLang || meta.original_language || '';
                imdbId = imdbId || meta.imdb_id || '';
            }
        } catch (_) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2024',
        originalLanguage: origLang || 'hi',
        imdbId: imdbId || ''
    };
}

/**
 * Queries the dynamic Pingora config endpoint to discover the live HDHub4u base domain.
 */
async function getActiveBaseUrl() {
    var now = Date.now();
    if (cachedBaseUrl && (now - lastBaseUrlCheck < 1800000)) {
        return cachedBaseUrl;
    }

    for (var i = 0; i < DYNAMIC_CONFIG_ENDPOINTS.length; i++) {
        try {
            var pingUrl = DYNAMIC_CONFIG_ENDPOINTS[i];
            var res = await safeFetch(pingUrl, {
                headers: { 'User-Agent': USER_AGENT }
            }, 5000);
            if (res.ok) {
                var json = await res.json();
                if (json && json.info && json.info.c) {
                    var rawB64 = json.info.c.replace(/\\/g, '');
                    var decoded = typeof atob === 'function' ? atob(rawB64) : Buffer.from(rawB64, 'base64').toString('utf8');
                    if (decoded && /^https?:\/\//i.test(decoded)) {
                        cachedBaseUrl = decoded.replace(/\/+$/, '');
                        lastBaseUrlCheck = now;
                        return cachedBaseUrl;
                    }
                }
            }
        } catch (_) {}
    }

    cachedBaseUrl = BASE_URL;
    lastBaseUrlCheck = now;
    return cachedBaseUrl;
}

/**
 * Searches HDHub4u using the Typesense API.
 */
async function searchTypesense(query, activeBase) {
    try {
        var cleanQ = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        var params = 'q=' + encodeURIComponent(cleanQ) +
                     '&query_by=' + encodeURIComponent('post_title,category,stars,director,imdb_id') +
                     '&query_by_weights=' + encodeURIComponent('4,2,2,2,4') +
                     '&sort_by=' + encodeURIComponent('sort_by_date:desc') +
                     '&limit=15&highlight_fields=none&use_cache=true&page=1';

        var searchUrl = TYPESENSE_SEARCH_URL + '?' + params;
        var headers = {
            'User-Agent': USER_AGENT,
            'Referer': activeBase + '/search.html?q=' + encodeURIComponent(cleanQ),
            'Origin': activeBase
        };

        var res = await safeFetch(searchUrl, { headers: headers }, 7000);
        if (!res.ok) return [];

        var data = await res.json();
        if (!data || !Array.isArray(data.hits)) return [];

        var results = [];
        for (var i = 0; i < data.hits.length; i++) {
            var doc = data.hits[i].document;
            if (!doc || !doc.permalink) continue;
            results.push({
                title: doc.post_title || '',
                clean: cleanTitle(doc.post_title || ''),
                url: doc.permalink,
                imdbId: doc.imdb_id || '',
                category: doc.category || []
            });
        }
        return results;
    } catch (_) {
        return [];
    }
}

/**
 * Fallback site search across active and backup domains.
 */
async function searchFallback(query, activeBase) {
    var searchBases = [activeBase].concat(BACKUP_URLS);
    var seenBases = {};

    for (var b = 0; b < searchBases.length; b++) {
        var curBase = searchBases[b];
        if (seenBases[curBase]) continue;
        seenBases[curBase] = true;

        try {
            var searchUrl = curBase + '/search.html?q=' + encodeURIComponent(query);
            var res = await safeFetch(searchUrl, { headers: DEFAULT_HEADERS }, 7000);
            if (!res.ok) continue;

            var html = await res.text();
            var aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var am;
            var results = [];
            while ((am = aRegex.exec(html)) !== null) {
                var href = am[1];
                var rawTitle = am[2].replace(/<[^>]+>/g, '').trim();
                if (href.indexOf('hdhub4u') >= 0 &&
                    !/\/category\/|\/tag\/|\/page\/|wp-content|feed|\/app\//i.test(href) &&
                    rawTitle.length > 3) {
                    results.push({
                        title: rawTitle,
                        clean: cleanTitle(rawTitle),
                        url: href,
                        imdbId: '',
                        category: []
                    });
                }
            }
            if (results.length > 0) return results;
        } catch (_) {}
    }
    return [];
}

/**
 * Direct Google User Content CDN link extractor.
 * Follows Golden Rule #5: always uses redirect: 'manual' to prevent 2GB RAM overflow!
 * Follows multi-hop redirects (e.g. hubcloud -> worker -> cryptonewz) to extract direct googleusercontent link.
 */
async function resolvePixelCloud(pixelUrl) {
    var curUrl = pixelUrl;
    var referer = 'https://gamerxyt.com/';
    try {
        for (var hop = 0; hop < 3; hop++) {
            var resp = await safeFetch(curUrl, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': referer
                },
                redirect: 'manual'
            }, 6000);

            var loc = resp.headers && (resp.headers.get('location') || resp.headers.get('Location'));
            if (!loc) break;

            if (loc.indexOf('?link=') >= 0) {
                return decodeURIComponent(loc.split('?link=')[1]);
            }
            if (loc.indexOf('googleusercontent.com') >= 0) {
                return loc;
            }

            referer = curUrl;
            curUrl = loc;
        }

        if (curUrl && curUrl !== pixelUrl && (curUrl.indexOf('googleusercontent.com') >= 0 || curUrl.indexOf('workers.dev') >= 0)) {
            return curUrl;
        }
    } catch (_) {}
    return null;
}

/**
 * CDN resolver for HubDrive & HubCloud / gamerxyt.com gateway.
 */
async function resolveHubCloud(hubUrl, activeBase) {
    try {
        var pageHtml = '';
        try {
            var res = await safeFetch(hubUrl, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': activeBase + '/'
                }
            }, 8000);
            if (res.ok) {
                var txt = await res.text();
                if (txt && txt.indexOf('Just a moment...') === -1 && txt.indexOf('challenges.cloudflare.com') === -1) {
                    pageHtml = txt;
                }
            }
        } catch (_) {}

        if (!pageHtml && typeof Browser !== 'undefined' && Browser.resolve) {
            try {
                var bRes = await Browser.resolve({
                    url: hubUrl,
                    timeoutMs: 15000
                });
                if (bRes) {
                    if (bRes.html) pageHtml = bRes.html;
                    if (Array.isArray(bRes.sniffedMedia)) {
                        for (var sm = 0; sm < bRes.sniffedMedia.length; sm++) {
                            var mi = bRes.sniffedMedia[sm];
                            if (mi && mi.url && !mi.isSubtitles) {
                                return [{
                                    serverName: 'Direct Stream',
                                    displayName: 'Direct Stream',
                                    url: mi.url,
                                    priority: 1,
                                    headers: mi.headers || { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                                }];
                            }
                        }
                    }
                }
            } catch (_) {}
        }

        if (!pageHtml) return [];

        // Follow nested drive redirects if any
        if (hubUrl.indexOf('hubdrive.') >= 0 || hubUrl.indexOf('/file/') >= 0) {
            var hubCloudMatch = pageHtml.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (hubCloudMatch && hubCloudMatch[0] !== hubUrl) {
                return resolveHubCloud(hubCloudMatch[0], activeBase);
            }
        }

        var gx = pageHtml.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        var gText = '';
        if (gx) {
            try {
                var gRes = await safeFetch(gx[0], {
                    headers: {
                        'User-Agent': DEFAULT_HEADERS['User-Agent'],
                        'Referer': hubUrl
                    }
                }, 8000);
                if (gRes.ok) gText = await gRes.text();
            } catch (_) {}

            if (!gText && typeof Browser !== 'undefined' && Browser.resolve) {
                try {
                    var bGx = await Browser.resolve({ url: gx[0], timeoutMs: 12000 });
                    if (bGx && bGx.html) gText = bGx.html;
                } catch (_) {}
            }
        }
        if (!gText) {
            gText = pageHtml;
        }

        var servers = [];
        var seenUrls = {};
        var asyncTasks = [];

        // 1. Dynamic Pixeldrain extraction (bypasses anti-DMCA decoy link negn6f)
        var pxlMatch = gText.match(/var\s+pxl\s*=\s*['"](https?:\/\/[^'"]*\/u\/([a-zA-Z0-9_-]+))['"]/i) ||
                       gText.match(/var\s+pxl\s*=\s*['"](https?:\/\/[^'"]*pixeldrain[^'"]*)['"]/i);
        if (pxlMatch) {
            var rawPxl = pxlMatch[1];
            var pxlDirect = rawPxl.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download')
                                  .replace('pixeldrain.dev', 'pixeldrain.com');
            servers.push({
                serverName: 'Pixeldrain',
                displayName: 'Pixeldrain Server',
                url: pxlDirect,
                priority: 2,
                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
            });
            seenUrls[rawPxl] = true;
            seenUrls[pxlDirect] = true;
        }

        var aRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var match;
        while ((match = aRegex.exec(gText)) !== null) {
            var href = match[1];
            var label = match[2].replace(/<[^>]+>/g, '').trim();
            if (seenUrls[href]) continue;
            seenUrls[href] = true;

            if (label.indexOf('FSL Server') >= 0 || label.indexOf('FSLv2 Server') >= 0 ||
                href.indexOf('r2.cloudflarestorage.com') >= 0 || href.indexOf('r2.dev') >= 0) {
                servers.push({
                    serverName: 'FSL R2',
                    displayName: 'FSL R2 Server',
                    url: href,
                    priority: 1,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            } else if (label.indexOf('PixelServer') >= 0 || href.indexOf('pixeldrain') >= 0) {
                if (href.indexOf('negn6f') >= 0) continue;
                var directPxl = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download')
                                    .replace('pixeldrain.dev', 'pixeldrain.com');
                servers.push({
                    serverName: 'Pixeldrain',
                    displayName: 'Pixeldrain Server',
                    url: directPxl,
                    priority: 2,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            } else if (label.indexOf('ZipDisk') >= 0 || href.indexOf('workers.dev') >= 0) {
                servers.push({
                    serverName: 'ZipDisk',
                    displayName: 'ZipDisk Server',
                    url: href,
                    priority: 3,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            } else if (label.indexOf('10Gbps') >= 0 || href.indexOf('pixel.hubcloud.ist') >= 0 || href.indexOf('gpdl.hubcloud.ist') >= 0) {
                (function(h) {
                    asyncTasks.push(resolvePixelCloud(h).then(function(directPixel) {
                        if (directPixel) {
                            servers.push({
                                serverName: '10Gbps Pixel Cloud',
                                displayName: 'Pixel Cloud (Google CDN)',
                                url: directPixel,
                                priority: 4,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
                    }).catch(function() {}));
                })(href);
            }
        }
        if (asyncTasks.length > 0) {
            await Promise.all(asyncTasks);
        }
        return servers;
    } catch (_) {
        return [];
    }
}

/**
 * Main getStreams implementation.
 */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var isMovie = mediaType === 'movie';
    var effectiveType = isMovie ? 'movie' : 'tv';
    var isAnime = mediaType === 'anime' || Boolean(extraArgs.malId || extraArgs.anilistId || extraArgs.romajiTitle);
    var sNum = season != null ? Number(season) : (extraArgs.season != null ? Number(extraArgs.season) : 1);
    var eNum = episode != null ? Number(episode) : (extraArgs.episode != null ? Number(extraArgs.episode) : 1);

    console.log('[HDHub4u] Fetching streams for ' + effectiveType + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[HDHub4u] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage +
        (meta.imdbId ? ', IMDb: ' + meta.imdbId : ''));

    var activeBase = await getActiveBaseUrl();
    console.log('[HDHub4u] Active Base Domain: ' + activeBase);

    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var candidates = await searchTypesense(searchTitle, activeBase);
    console.log('[HDHub4u] Typesense search found ' + candidates.length + ' candidates');

    if (candidates.length === 0) {
        var firstWord = searchTitle.split(' ')[0];
        if (firstWord && firstWord.length > 3) {
            candidates = await searchTypesense(firstWord, activeBase);
            console.log('[HDHub4u] Fallback single-word search found ' + candidates.length + ' candidates');
        }
    }

    if (candidates.length === 0) {
        candidates = await searchFallback(searchTitle, activeBase);
        console.log('[HDHub4u] Site search found ' + candidates.length + ' candidates');
    }

    if (candidates.length === 0) return [];

    var targetClean = cleanTitle(meta.title);
    var targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1; });
    var scoredCandidates = [];

    for (var i = 0; i < candidates.length; i++) {
        var cand = candidates[i];
        var candClean = cand.clean;
        var candTitle = cand.title;
        var score = 0;

        if (meta.imdbId && cand.imdbId && cand.imdbId === meta.imdbId) {
            score += 100;
        }

        var matchedWords = 0;
        for (var w = 0; w < targetWords.length; w++) {
            if (candClean.indexOf(targetWords[w]) >= 0) matchedWords++;
        }
        if (targetWords.length > 0 && matchedWords / targetWords.length < 0.6) continue;
        score += matchedWords * 10;
        if (candClean.indexOf(targetClean) >= 0) score += 30;

        if (isMovie) {
            if (meta.year && candTitle.indexOf(meta.year) >= 0) score += 50;
            if (/season\s*\d+|complete\s*series|s\d{1,2}e\d{1,2}/i.test(candTitle)) score -= 100;
        } else {
            if (/\bmovie\b|\bfilm\b/i.test(candTitle)) score -= 80;
            var rangeMatch = candTitle.match(/season\s*0*(\d+)\s*(?:-|to)\s*0*(\d+)/i) ||
                             candTitle.match(/s0*(\d+)\s*(?:-|to)\s*s?0*(\d+)/i);
            var singleMatch = candTitle.match(/season\s*0*(\d+)/i) || candTitle.match(/s0*(\d+)/i);

            if (rangeMatch) {
                var startS = Number(rangeMatch[1]);
                var endS = Number(rangeMatch[2]);
                if (sNum >= startS && sNum <= endS) {
                    score += 60;
                } else {
                    score -= 100;
                }
            } else if (singleMatch) {
                var sFound = Number(singleMatch[1]);
                if (sFound === sNum) {
                    score += 80;
                } else {
                    score -= 100;
                }
            } else if (/complete|series/i.test(candTitle)) {
                score += 30;
            }
        }

        if (score > 0) {
            scoredCandidates.push({ cand: cand, score: score });
        }
    }

    scoredCandidates.sort(function(a, b) { return b.score - a.score; });
    var selected = scoredCandidates.length > 0 ? scoredCandidates[0].cand : null;
    if (!selected) {
        console.log('[HDHub4u] No matching candidate found for: ' + meta.title);
        return [];
    }

    // Ensure detail page uses active base domain
    var targetUrl = selected.url;
    try {
        var parsed = new URL(targetUrl);
        targetUrl = activeBase + parsed.pathname;
    } catch (_) {}

    console.log('[HDHub4u] Selected detail page: ' + targetUrl);

    var postHtml = '';
    try {
        var postRes = await safeFetch(targetUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': activeBase + '/'
            }
        }, 8000);
        if (postRes.ok) {
            postHtml = await postRes.text();
        }
    } catch (_) {}

    if (!postHtml || postHtml.indexOf('challenges.cloudflare.com') >= 0 || postHtml.indexOf('Just a moment...') >= 0) {
        if (typeof Browser !== 'undefined' && Browser.resolve) {
            try {
                var bRes = await Browser.resolve({ url: targetUrl, timeoutMs: 15000 });
                if (bRes && bRes.html) postHtml = bRes.html;
            } catch (_) {}
        }
    }

    if (!postHtml) return [];

    var audioInfo = parseAudiosFromText(selected.title + ' ' + postHtml.slice(0, 5000));
    var epTag = !isMovie ? ('S' + pad(sNum) + 'E' + pad(eNum)) : '';

    var aRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    var streamPromises = [];
    var seenStreamKeys = {};

    if (isMovie) {
        // Movie: collect quality-segregated HubDrive / HubCloud download links
        var movieLinks = [];
        var seenMovieQualities = {};

        while ((m = aRegex.exec(postHtml)) !== null) {
            var href = m[1];
            var label = m[2].replace(/<[^>]+>/g, '').trim();
            if (/how-to-download|tutorial|telegram|join/i.test(label) || /how-to-download/i.test(href)) continue;

            if (href.indexOf('hubdrive.') >= 0 || href.indexOf('hubcloud.') >= 0 || href.indexOf('gamerxyt.') >= 0) {
                var linkQuality = extractQualityFromContext(postHtml, m.index, label) || '1080p';
                if (!seenMovieQualities[linkQuality]) {
                    seenMovieQualities[linkQuality] = true;
                    movieLinks.push({ href: href, quality: linkQuality });
                }
            }
        }

        // Limit to at most 4 distinct qualities
        var selectedMovieLinks = movieLinks.slice(0, 4);
        for (var c = 0; c < selectedMovieLinks.length; c++) {
            (function(linkItem) {
                streamPromises.push(
                    resolveHubCloud(linkItem.href, activeBase).then(function(servers) {
                        return servers.map(function(s) {
                            return Object.assign({}, s, { quality: s.quality || linkItem.quality || '1080p' });
                        });
                    })
                );
            })(selectedMovieLinks[c]);
        }
    } else {
        // TV Series: parse episodes (e.g., "EPiSODE 1 720p - Drive", "WATCH 1080p - Drive")
        var epCandidates = [];
        var epRegex = new RegExp('(?:^|\\b)(?:episode|ep|e)\\s*0*' + eNum + '(?:\\b|\\D|$)', 'i');

        while ((m = aRegex.exec(postHtml)) !== null) {
            var eHref = m[1];
            var eLabel = m[2].replace(/<[^>]+>/g, '').trim();
            if (/how-to-download|tutorial|telegram|join/i.test(eLabel) || /how-to-download/i.test(eHref)) continue;

            if (eHref.indexOf('hubdrive.') >= 0 || eHref.indexOf('hubcloud.') >= 0 || eHref.indexOf('gamerxyt.') >= 0) {
                var preSlice = postHtml.substring(Math.max(0, m.index - 300), m.index);
                var fullContext = preSlice + ' ' + eLabel;
                var qFromContext = parseQualityFromText(fullContext) || '1080p';

                if (epRegex.test(fullContext)) {
                    epCandidates.push({ href: eHref, quality: qFromContext });
                }
            }
        }

        // If no explicit episode text match found, try positional index for 1-indexed episodes
        if (epCandidates.length === 0) {
            var allHubLinks = [];
            aRegex.lastIndex = 0;
            while ((m = aRegex.exec(postHtml)) !== null) {
                var rawH = m[1];
                if (rawH.indexOf('hubdrive.') >= 0 || rawH.indexOf('hubcloud.') >= 0) {
                    allHubLinks.push(rawH);
                }
            }
            var epIdx = eNum - 1;
            if (epIdx >= 0 && epIdx < allHubLinks.length) {
                epCandidates.push({ href: allHubLinks[epIdx], quality: '1080p' });
            }
        }

        for (var t = 0; t < epCandidates.length; t++) {
            (function(cand) {
                streamPromises.push(
                    resolveHubCloud(cand.href, activeBase).then(function(servers) {
                        return servers.map(function(s) {
                            return Object.assign({}, s, { quality: s.quality || cand.quality || '1080p' });
                        });
                    })
                );
            })(epCandidates[t]);
        }
    }

    var settled = await Promise.allSettled(streamPromises);
    var finalStreams = [];

    for (var bIdx = 0; bIdx < settled.length; bIdx++) {
        var resObj = settled[bIdx];
        if (resObj.status !== 'fulfilled' || !Array.isArray(resObj.value)) continue;

        var batch = resObj.value;
        for (var s = 0; s < batch.length; s++) {
            var item = batch[s];
            if (!item || !item.url) continue;

            var streamKey = item.url + '|' + item.quality;
            if (seenStreamKeys[streamKey]) continue;
            seenStreamKeys[streamKey] = true;

            var finalTitle = isMovie ?
                (meta.title + ' (' + meta.year + ') ' + audioInfo.badge + ' - HDHub4u ' + item.displayName + ' [' + item.quality + ']') :
                (meta.title + ' ' + epTag + ' ' + audioInfo.badge + ' - HDHub4u ' + item.displayName + ' [' + item.quality + ']');

            var streamFormat = item.url.indexOf('.m3u8') >= 0 ? 'm3u8' :
                               (item.url.indexOf('.mpd') >= 0 ? 'mpd' :
                               (item.url.indexOf('.mkv') >= 0 ? 'mkv' : 'mp4'));

            finalStreams.push({
                name: 'HDHub4u | ' + item.serverName + ' • ' + audioInfo.badge + ' (' + item.quality + ')',
                title: finalTitle,
                url: item.url,
                quality: item.quality,
                type: streamFormat,
                format: streamFormat,
                container: streamFormat === 'mkv' ? 'mkv' : (streamFormat === 'mpd' ? 'dash' : (streamFormat === 'm3u8' ? 'hls' : 'mp4')),
                isSequential: streamFormat === 'mkv' || streamFormat === 'mp4',
                provider: 'hdhub4u',
                language: (audioInfo.tag || 'hin').toLowerCase(),
                headers: item.headers || { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
                subtitles: [],
                audio: {
                    isMulti: audioInfo.isMulti,
                    primary: audioInfo.primary,
                    tag: audioInfo.tag,
                    badge: audioInfo.badge
                }
            });
        }
    }

    console.log('[HDHub4u] Discovered ' + finalStreams.length + ' direct stream(s)');
    return finalStreams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    globalThis.getStreams = getStreams;
}
