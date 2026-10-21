/**
 * Bollyflix Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for Bollyflix (https://bollyflix.co.za/)
 * Supports Bollywood, Hollywood, South Indian Dubbed, Web Series, and Anime.
 *
 * High-Speed Direct CDN Streaming Engines:
 *  - Bollyflix | FSL R2 Server (Direct Cloudflare R2 Presigned S3)
 *  - Bollyflix | 10Gbps Pixel Cloud (Google Cloud CDN)
 *  - Bollyflix | Pixeldrain Server (High-Speed Direct Stream)
 *  - Bollyflix | ZipDisk Server (Cloudflare Edge Direct Stream)
 *  - Bollyflix | FastDL Server (Direct High-Speed Media Stream)
 *
 * Features:
 *  - Dynamic mirror failover via live URLs configuration.
 *  - Full TV Series season & episode targeting (fxlinks / elinks / fastdlserver).
 *  - Dynamic multi-audio / dual-audio track detection ([MULTI] [HIN · ENG], [HIN], etc.).
 *  - Full compatibility with Android QuickJS runtime (no Node Buffer, pure fetch).
 *  - Formatted strictly for MatchScorer.kt (+0.25 SxxExx episode bonus for TV, clean (Year) for movies).
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://bollyflix.co.za';
var BACKUP_URLS = [
    'https://bollyflix.co.za',
    'https://bollyflix.frl',
    'https://bollyflix.ind.in',
    'https://bollyflix.to'
];
var DYNAMIC_URLS_ENDPOINT = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
var CINEMETA_URL = 'https://v3-cinemeta.strem.io/meta';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' },
    'hi': { name: 'Hindi', tag: 'HIN' },
    'ta': { name: 'Tamil', tag: 'TAM' },
    'te': { name: 'Telugu', tag: 'TEL' },
    'ml': { name: 'Malayalam', tag: 'MAL' },
    'kn': { name: 'Kannada', tag: 'KAN' },
    'ko': { name: 'Korean', tag: 'KOR' },
    'ja': { name: 'Japanese', tag: 'JPN' },
    'es': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' },
    'de': { name: 'German', tag: 'GER' },
    'zh': { name: 'Chinese', tag: 'CHI' },
    'ru': { name: 'Russian', tag: 'RUS' }
};

/**
 * Safe fetch with timeout (no AbortSignal.timeout).
 */
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

function parseQualityFromText(text) {
    if (!text) return '1080p';
    var t = String(text);
    if (/2160p|4k\b|uhd\b/i.test(t)) return '4K 2160p';
    if (/1080[pi]\b|fhd\b/i.test(t)) return '1080p';
    if (/720p\b|hd\b/i.test(t)) return '720p';
    if (/480p\b|sd\b/i.test(t)) return '480p';
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
    if (/\b(KOREAN|KOR)\b/i.test(upper)) langs.push('KOR');
    if (/\b(JAPANESE|JPN)\b/i.test(upper)) langs.push('JPN');
    if (/\b(SPANISH|SPA)\b/i.test(upper)) langs.push('SPA');
    if (/\b(FRENCH|FRA)\b/i.test(upper)) langs.push('FRA');
    if (/\b(GERMAN|GER)\b/i.test(upper)) langs.push('GER');
    if (/\b(CHINESE|CHI)\b/i.test(upper)) langs.push('CHI');
    if (/\b(RUSSIAN|RUS)\b/i.test(upper)) langs.push('RUS');

    var distinct = [];
    for (var i = 0; i < langs.length; i++) {
        if (distinct.indexOf(langs[i]) === -1) distinct.push(langs[i]);
    }

    if (isMultiCue || distinct.length > 1) {
        var langJoin = distinct.length > 0 ? distinct.join(' · ') : 'MULTI';
        return {
            isMulti: true,
            primary: 'Multi',
            tag: 'MULTI',
            badge: '[MULTI] [' + langJoin + ']'
        };
    }

    if (distinct.length === 1) {
        var tag = distinct[0];
        return {
            isMulti: false,
            primary: tag === 'HIN' ? 'Hindi' : (tag === 'ENG' ? 'English' : tag),
            tag: tag,
            badge: '[' + tag + ']'
        };
    }

    return {
        isMulti: false,
        primary: 'Hindi',
        tag: 'HIN',
        badge: '[HIN]'
    };
}

/**
 * Resolves TMDB metadata dynamically.
 */
async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title && tmdbId) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var res = await safeFetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, {
                headers: DEFAULT_HEADERS
            }, 5000);
            if (res.ok) {
                var meta = await res.json();
                title = meta.title || meta.name || '';
                var relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? String(relDate).substring(0, 4) : '');
                origLang = origLang || meta.original_language || '';
            }
        } catch (_) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2022',
        originalLanguage: origLang || 'hi'
    };
}

/**
 * Direct Google User Content CDN link extractor.
 */
async function resolvePixelCloud(pixelUrl) {
    try {
        var resp = await safeFetch(pixelUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://gamerxyt.com/'
            }
        }, 6000);
        var text = await resp.text();
        var m = text.match(/href=['"](https:\/\/video-downloads\.googleusercontent\.com\/[^'"]+)['"]/i);
        if (m) return m[1];
    } catch (_) {}
    return pixelUrl;
}

/**
 * CDN resolver for HubCloud / gamerxyt.com gateway.
 */
async function resolveHubCloud(hubUrl) {
    try {
        var res = await safeFetch(hubUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://bollyflix.co.za/'
            }
        }, 8000);
        var text = await res.text();

        // Follow nested drive redirects
        if (hubUrl.indexOf('hubdrive.') >= 0 || hubUrl.indexOf('/drive/') >= 0) {
            var m = text.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (m && m[0] !== hubUrl) return resolveHubCloud(m[0]);
        }

        var gx = text.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        if (!gx) return [];

        var gRes = await safeFetch(gx[0], {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': hubUrl
            }
        }, 8000);
        var gText = await gRes.text();

        var servers = [];
        var seenUrls = {};

        // 1. Dynamic Pixeldrain extraction
        var pxlMatch = gText.match(/var\s+pxl\s*=\s*['"](https?:\/\/[^'"]*\/u\/([a-zA-Z0-9_-]+))['"]/i) ||
                       gText.match(/var\s+pxl\s*=\s*['"](https?:\/\/[^'"]*pixeldrain[^'"]*)['"]/i);
        if (pxlMatch) {
            var rawPxl = pxlMatch[1];
            var pxlDirect = rawPxl.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1')
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

            if (label.indexOf('FSL Server') >= 0 || href.indexOf('r2.cloudflarestorage.com') >= 0) {
                servers.push({
                    serverName: 'FSL R2',
                    displayName: 'FSL R2 Server',
                    url: href,
                    priority: 1,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            } else if (label.indexOf('PixelServer') >= 0 || href.indexOf('pixeldrain') >= 0) {
                if (href.indexOf('negn6f') >= 0) continue;
                var directPxl = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1')
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
                var directPixel = await resolvePixelCloud(href);
                servers.push({
                    serverName: '10Gbps Pixel Cloud',
                    displayName: 'Pixel Cloud (Google CDN)',
                    url: directPixel,
                    priority: 4,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            }
        }
        return servers;
    } catch (_) {
        return [];
    }
}

/**
 * Resolver for FastDL server redirect links.
 */
async function resolveFastDlServer(fastDlUrl) {
    try {
        var res = await safeFetch(fastDlUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://fxlinks.rest/'
            },
            redirect: 'manual'
        }, 6000);

        var loc = res.headers.get('location');
        if (loc) {
            if (loc.indexOf('hubcloud') >= 0 || loc.indexOf('gamerxyt') >= 0) {
                return await resolveHubCloud(loc);
            }
            if (loc.indexOf('r2.cloudflarestorage.com') >= 0) {
                return [{
                    serverName: 'FSL R2',
                    displayName: 'FSL R2 Server',
                    url: loc,
                    priority: 1,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                }];
            }
            if (loc.indexOf('pixeldrain') >= 0) {
                var directPxl = loc.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1');
                return [{
                    serverName: 'Pixeldrain',
                    displayName: 'Pixeldrain Server',
                    url: directPxl,
                    priority: 2,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                }];
            }
            if (loc.indexOf('gdflix') >= 0) {
                var gdfHtml = '';
                if (typeof Browser !== 'undefined' && Browser.resolve) {
                    try {
                        var bRes = await Browser.resolve(loc);
                        if (bRes && bRes.html) gdfHtml = bRes.html;
                    } catch (_) {}
                }
                if (!gdfHtml) {
                    try {
                        var gRes = await safeFetch(loc, {
                            headers: {
                                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                                'Referer': fastDlUrl
                            }
                        }, 5000);
                        if (gRes.ok) gdfHtml = await gRes.text();
                    } catch (_) {}
                }
                if (gdfHtml) {
                    var gdfServers = [];
                    var gRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                    var gm;
                    while ((gm = gRegex.exec(gdfHtml)) !== null) {
                        var gHref = gm[1];
                        var gText = gm[2].replace(/<[^>]+>/g, '').trim();
                        if (/r2\.cloudflarestorage\.com|r2\.dev/i.test(gHref)) {
                            gdfServers.push({
                                serverName: 'FSL R2',
                                displayName: 'FSL R2 Server',
                                url: gHref,
                                priority: 1,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        } else if (/pixeldrain/i.test(gHref)) {
                            var directPxlG = gHref.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1');
                            gdfServers.push({
                                serverName: 'Pixeldrain',
                                displayName: 'Pixeldrain Server',
                                url: directPxlG,
                                priority: 2,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        } else if (/workers\.dev/i.test(gHref)) {
                            gdfServers.push({
                                serverName: 'ZipDisk',
                                displayName: 'ZipDisk Server',
                                url: gHref,
                                priority: 3,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        } else if (/video-downloads\.googleusercontent\.com/i.test(gHref)) {
                            gdfServers.push({
                                serverName: '10Gbps Pixel Cloud',
                                displayName: 'Pixel Cloud (Google CDN)',
                                url: gHref,
                                priority: 4,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
                    }
                    if (gdfServers.length > 0) return gdfServers;
                }
            }
        }
    } catch (_) {}
    return [];
}

/**
 * Resolver for LinksMod gateway.
 */
async function resolveLinksMod(linksModUrl) {
    try {
        var res = await safeFetch(linksModUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': BASE_URL + '/'
            }
        }, 7000);
        var text = await res.text();
        var servers = [];

        var aRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRegex.exec(text)) !== null) {
            var href = m[1];
            if (href.indexOf('pixeldrain.com/u/') >= 0) {
                var directPxl = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1');
                servers.push({
                    serverName: 'Pixeldrain',
                    displayName: 'Pixeldrain Server',
                    url: directPxl,
                    priority: 2,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            }
        }
        return servers;
    } catch (_) {
        return [];
    }
}

/**
 * Searches Bollyflix.
 */
async function searchBollyflix(query) {
    try {
        var url = BASE_URL + '/?s=' + encodeURIComponent(query);
        var res = await safeFetch(url, { headers: DEFAULT_HEADERS }, 7000);
        if (!res.ok) return [];
        var text = await res.text();

        var articles = text.match(/<article[\s\S]*?<\/article>/gi) || [];
        var results = [];

        for (var i = 0; i < articles.length; i++) {
            var art = articles[i];
            var linkMatch = art.match(/href="([^"]+)"/);
            var titleMatch = art.match(/alt="([^"]+)"/) || art.match(/title="([^"]+)"/);
            if (linkMatch && titleMatch) {
                var rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
                results.push({
                    url: linkMatch[1],
                    title: rawTitle,
                    clean: cleanTitle(rawTitle)
                });
            }
        }
        return results;
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
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;

    console.log('[Bollyflix] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[Bollyflix] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage);

    var epTag = !isMovie ?
        ('S' + pad(sNum) + 'E' + pad(eNum)) :
        '';

    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var candidates = await searchBollyflix(searchTitle);
    console.log('[Bollyflix] Search found ' + candidates.length + ' candidates');

    if (candidates.length === 0) {
        // Fallback search with single word or title only
        var firstWord = searchTitle.split(' ')[0];
        if (firstWord && firstWord.length > 3) {
            candidates = await searchBollyflix(firstWord);
            console.log('[Bollyflix] Fallback search found ' + candidates.length + ' candidates');
        }
    }

    if (candidates.length === 0) return [];

    // Filter and score candidates
    var targetClean = cleanTitle(meta.title);
    var selected = null;
    for (var i = 0; i < candidates.length; i++) {
        var cand = candidates[i];
        if (cand.clean.indexOf(targetClean) >= 0) {
            if (isMovie && cand.title.indexOf(meta.year) >= 0) {
                selected = cand;
                break;
            }
            if (!isMovie) {
                var sMatch = cand.title.match(/season\s*0*(\d+)/i) || cand.title.match(/s0*(\d+)/i);
                if (sMatch && Number(sMatch[1]) === sNum) {
                    selected = cand;
                    break;
                }
            }
            if (!selected) selected = cand;
        }
    }
    if (!selected) selected = candidates[0];
    console.log('[Bollyflix] Selected detail page: ' + selected.url);

    var postRes = await safeFetch(selected.url, { headers: DEFAULT_HEADERS }, 8000);
    if (!postRes.ok) return [];
    var postHtml = await postRes.text();

    var audioInfo = parseAudiosFromText(selected.title + ' ' + postHtml.slice(0, 5000));
    var subtitleList = [];
    if (/ESub|MSub|Sub/i.test(selected.title) || /ESub|MSub/i.test(postHtml)) {
        subtitleList.push({
            id: 'bollyflix-sub-en',
            name: 'English [Embedded/ESub]',
            language: 'en'
        });
    }

    var streamPromises = [];
    var seenStreamKeys = {};

    if (isMovie) {
        // Parse movie links (fastdlserver, linksmod, hubcloud)
        var aRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRegex.exec(postHtml)) !== null) {
            var href = m[1];
            var label = m[2].replace(/<[^>]+>/g, '').trim();

            if (href.indexOf('fastdlserver') >= 0) {
                (function(url, quality) {
                    streamPromises.push(
                        resolveFastDlServer(url).then(function(servers) {
                            return servers.map(function(s) {
                                return Object.assign({}, s, { quality: quality });
                            });
                        })
                    );
                })(href, parseQualityFromText(label));
            } else if (href.indexOf('linksmod.top') >= 0) {
                (function(url, quality) {
                    streamPromises.push(
                        resolveLinksMod(url).then(function(servers) {
                            return servers.map(function(s) {
                                return Object.assign({}, s, { quality: quality });
                            });
                        })
                    );
                })(href, parseQualityFromText(label));
            } else if (href.indexOf('hubcloud') >= 0 || href.indexOf('gamerxyt') >= 0) {
                (function(url, quality) {
                    streamPromises.push(
                        resolveHubCloud(url).then(function(servers) {
                            return servers.map(function(s) {
                                return Object.assign({}, s, { quality: quality });
                            });
                        })
                    );
                })(href, parseQualityFromText(label));
            }
        }
    } else {
        // TV Series: look for episode links or fxlinks gateway
        var fxMatch = postHtml.match(/https:\/\/fxlinks\.[a-z0-9.]+\/elinks\/[a-z0-9]+/gi);
        if (fxMatch) {
            for (var f = 0; f < fxMatch.length; f++) {
                var fxUrl = fxMatch[f];
                try {
                    var fxRes = await safeFetch(fxUrl, {
                        headers: {
                            'User-Agent': DEFAULT_HEADERS['User-Agent'],
                            'Referer': selected.url
                        }
                    }, 8000);
                    var fxHtml = await fxRes.text();

                    var epRegex = new RegExp('(?:Episode\\s*0*' + eNum + '|E0*' + eNum + ')\\b', 'i');
                    var fxARegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                    var fxM;
                    while ((fxM = fxARegex.exec(fxHtml)) !== null) {
                        var eHref = fxM[1];
                        var eLabel = fxM[2].replace(/<[^>]+>/g, '').trim();

                        if (epRegex.test(eLabel) && eHref.indexOf('fastdlserver') >= 0) {
                            (function(url, quality) {
                                streamPromises.push(
                                    resolveFastDlServer(url).then(function(servers) {
                                        return servers.map(function(s) {
                                            return Object.assign({}, s, { quality: quality });
                                        });
                                    })
                                );
                            })(eHref, parseQualityFromText(fxHtml));
                        }
                    }
                } catch (_) {}
            }
        }
    }

    var resolvedBatches = await Promise.all(streamPromises);
    var finalStreams = [];

    for (var b = 0; b < resolvedBatches.length; b++) {
        var batch = resolvedBatches[b];
        if (!Array.isArray(batch)) continue;

        for (var s = 0; s < batch.length; s++) {
            var item = batch[s];
            if (!item || !item.url) continue;

            var streamKey = item.url + '|' + item.quality;
            if (seenStreamKeys[streamKey]) continue;
            seenStreamKeys[streamKey] = true;

            var finalTitle = isMovie ?
                (meta.title + ' (' + meta.year + ') ' + audioInfo.badge + ' - Bollyflix ' + item.displayName + ' [' + item.quality + ']') :
                (meta.title + ' ' + epTag + ' ' + audioInfo.badge + ' - Bollyflix ' + item.displayName + ' [' + item.quality + ']');

            var streamFormat = item.url.indexOf('.m3u8') >= 0 ? 'm3u8' :
                               (item.url.indexOf('.mpd') >= 0 ? 'mpd' : 'mp4');

            finalStreams.push({
                name: 'Bollyflix | ' + item.serverName,
                title: finalTitle,
                url: item.url,
                quality: item.quality,
                format: streamFormat,
                headers: item.headers || { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
                subtitles: subtitleList,
                audio: {
                    isMulti: audioInfo.isMulti,
                    primary: audioInfo.primary,
                    tag: audioInfo.tag,
                    badge: audioInfo.badge
                }
            });
        }
    }

    console.log('[Bollyflix] Discovered ' + finalStreams.length + ' direct stream(s)');
    return finalStreams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    globalThis.getStreams = getStreams;
}
