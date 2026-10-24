/**
 * Vegamovies Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for Vegamovies (https://veqamovies.mobi / https://vegamovies.pages.dev)
 * Supports Bollywood, Hollywood, South Indian Dubbed, Korean/Asian Drama, and Web Series.
 *
 * High-Speed Direct CDN Streaming Engines:
 *  - Vegamovies | 10Gbps Google CDN (video-downloads.googleusercontent.com)
 *  - Vegamovies | FSL R2 Server (Direct Cloudflare R2 Presigned S3)
 *  - Vegamovies | Pixeldrain Server (High-Speed Direct Stream)
 *  - Vegamovies | ZipDisk Server (Cloudflare Edge Direct Stream)
 *
 * Features:
 *  - Zero-bot-block direct Fast-DL & Nexdrive extraction engine.
 *  - Direct 10Gbps Google Cloud CDN streams with HTTP 206 Partial Content range support.
 *  - Full TV Series season & episode targeting (SxxExx).
 *  - Dynamic multi-audio & subtitle track extraction ([MULTI] [HIN · ENG], [HIN], etc.).
 *  - Browser.resolve fallback for protected pages.
 *  - Strict compliance with MatchScorer.kt and Euthopiar DownloadEngine.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://veqamovies.mobi';
var BACKUP_URLS = [
    'https://veqamovies.mobi',
    'https://vegamovies.pages.dev',
    'https://1vegamovies.pics',
    'https://vegamovies.vg',
    'https://vegamovies.lol'
];
var FASTDL_BASE = 'https://fast-dl.one';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

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
    if (!text) return null;
    var t = String(text);
    // Explicit resolutions first
    if (/\b(2160p|4k\b|uhd\b)/i.test(t)) return '4K 2160p';
    if (/\b(1080[pi]\b|fhd\b)/i.test(t)) return '1080p';
    if (/\b(720p\b)/i.test(t)) return '720p';
    if (/\b(480p\b|540p\b|360p\b)/i.test(t)) return '480p';
    // Fallback general tags only if no explicit noise
    if (/\b(hd)\b/i.test(t) && !/hdrip|webrip|hdts|hdtc/i.test(t)) return '720p';
    if (/\b(sd)\b/i.test(t)) return '480p';
    return null;
}

function extractQualityFromContext(html, linkIndex, label) {
    // 1. Direct label check (if button explicitly specifies quality)
    var q = parseQualityFromText(label);
    if (q) return q;

    // 2. Preceding HTML context (check nearest resolution tag in previous 500 characters)
    var sliceBefore = html.substring(Math.max(0, linkIndex - 500), linkIndex);
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

    // 3. Fallback to general tags in cleanSlice
    var generalMatch = cleanSlice.match(/\b(hd|sd)\b/i);
    if (generalMatch) {
        var gFound = parseQualityFromText(generalMatch[1]);
        if (gFound) return gFound;
    }

    return null;
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
    if (/\b(CHINESE|CHI)\b/i.test(upper)) langs.push('CHI');

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
 * Resolve TMDB metadata dynamically.
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
        year: year ? String(year) : '2024',
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
            },
            redirect: 'manual'
        }, 6000);
        var loc = resp.headers && (resp.headers.get('location') || resp.headers.get('Location'));
        if (loc) {
            if (loc.indexOf('?link=') >= 0) {
                return decodeURIComponent(loc.split('?link=')[1]);
            }
            if (loc.indexOf('googleusercontent.com') >= 0 || /^https?:\/\//i.test(loc)) {
                return loc;
            }
        }
        var finalUrl = resp.url || '';
        if (finalUrl.indexOf('?link=') >= 0) {
            return decodeURIComponent(finalUrl.split('?link=')[1]);
        }
        if (finalUrl.indexOf('video-downloads.googleusercontent.com') >= 0 || finalUrl.indexOf('googleusercontent.com') >= 0) {
            return finalUrl;
        }
        var cType = (resp.headers && resp.headers.get('content-type')) || '';
        if (cType.toLowerCase().indexOf('text/html') >= 0) {
            var text = await resp.text();
            var m = text.match(/href=['"](https:\/\/video-downloads\.googleusercontent\.com\/[^'"]+)['"]/i) ||
                    text.match(/href=['"](https:\/\/[^'"]*googleusercontent\.com\/[^'"]+)['"]/i);
            if (m) return m[1];
        }
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
                'Referer': BASE_URL + '/'
            }
        }, 8000);
        var text = await res.text();

        // Follow nested drive redirects if any
        if (hubUrl.indexOf('hubdrive.') >= 0 || hubUrl.indexOf('/drive/') >= 0) {
            var driveMatch = text.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (driveMatch && driveMatch[0] !== hubUrl) {
                return resolveHubCloud(driveMatch[0]);
            }
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
        var asyncTasks = [];

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
 * Resolves Fast-DL server link directly to Google Cloud CDN stream.
 */
async function resolveFastDlOne(fastDlUrl) {
    try {
        var pageRes = await safeFetch(fastDlUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': BASE_URL + '/'
            }
        }, 8000);
        var pageHtml = await pageRes.text();

        var dlMatch = pageHtml.match(/href="([^"]*dl\.php[^"]+)"/i);
        if (!dlMatch) return null;

        var target = dlMatch[1].replace(/&amp;/g, '&');
        if (target.indexOf('http') !== 0) {
            target = FASTDL_BASE + '/dl/' + target.replace(/^\//, '');
        }

        var dlRes = await safeFetch(target, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': fastDlUrl
            },
            redirect: 'manual'
        }, 8000);

        var cdnUrl = dlRes.headers.get('location');
        if (cdnUrl && cdnUrl.indexOf('http') === 0) {
            return cdnUrl;
        }
    } catch (_) {}
    return null;
}

/**
 * Resolves Nexdrive gateway link to Fast-DL links.
 */
async function resolveNexdrive(nexdriveUrl, isMovie, seasonNum, episodeNum) {
    try {
        var html = '';
        try {
            var res = await safeFetch(nexdriveUrl, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': BASE_URL + '/'
                }
            }, 6000);
            if (res.ok) html = await res.text();
        } catch (_) {}

        if (!html || html.indexOf('challenges.cloudflare.com') >= 0 || html.indexOf('Just a moment...') >= 0) {
            if (typeof Browser !== 'undefined' && Browser.resolve) {
                try {
                    var bRes = await Browser.resolve({ url: nexdriveUrl, timeoutMs: 8000 });
                    if (bRes && bRes.html) html = bRes.html;
                } catch (_) {}
            }
        }
        if (!html) return null;

        var pageTitleMatch = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        var nexQuality = null;
        if (pageTitleMatch) {
            nexQuality = parseQualityFromText(pageTitleMatch[1].replace(/<[^>]+>/g, ''));
        }

        var fastDlLinks = [];
        var aRegex = /<a[^>]+href="([^"]*fast-dl\.one[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRegex.exec(html)) !== null) {
            fastDlLinks.push(m[1].replace(/&amp;/g, '&'));
        }

        if (fastDlLinks.length === 0) {
            // Also check V-Cloud / Hubcloud links
            var vcloudMatch = html.match(/https?:\/\/[^\s"'<>]*(?:vcloud|hubcloud)[^\s"'<>]*/gi);
            if (vcloudMatch && vcloudMatch.length > 0) {
                return { hubUrls: vcloudMatch, quality: nexQuality };
            }
            return null;
        }

        if (isMovie) {
            return { directFastDl: fastDlLinks[0], quality: nexQuality };
        } else {
            // In TV series, episodes in nexdrive are sequentially listed
            var epIndex = episodeNum - 1;
            if (epIndex >= 0 && epIndex < fastDlLinks.length) {
                return { directFastDl: fastDlLinks[epIndex], quality: nexQuality };
            }
            return { directFastDl: fastDlLinks[0], quality: nexQuality };
        }
    } catch (_) {
        return null;
    }
}

/**
 * Searches Vegamovies across active mirrors using DLE POST search.
 */
async function searchVegamovies(query) {
    var searchBases = [BASE_URL].concat(BACKUP_URLS);
    var seenBases = {};

    for (var b = 0; b < searchBases.length; b++) {
        var currentBase = searchBases[b];
        if (seenBases[currentBase]) continue;
        seenBases[currentBase] = true;

        try {
            // 1. DataLife Engine (DLE) POST search with titleonly=3
            var html = '';
            var postRes = await safeFetch(currentBase + '/index.php?do=search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': currentBase + '/'
                },
                body: 'do=search&subaction=search&story=' + encodeURIComponent(query) + '&titleonly=3'
            }, 8000);

            if (postRes.ok) {
                html = await postRes.text();
            }

            // 2. Fallback to GET /?s= if POST produced no articles
            if (!html || html.indexOf('<article') === -1) {
                var getRes = await safeFetch(currentBase + '/?s=' + encodeURIComponent(query), {
                    headers: {
                        'User-Agent': DEFAULT_HEADERS['User-Agent'],
                        'Referer': currentBase + '/'
                    }
                }, 7000);
                if (getRes.ok) html = await getRes.text();
            }

            // 3. Fallback to Browser.resolve if bot-protected by Cloudflare
            if (!html || html.indexOf('<article') === -1) {
                if (typeof Browser !== 'undefined' && Browser.resolve) {
                    try {
                        var bRes = await Browser.resolve({ url: currentBase + '/?s=' + encodeURIComponent(query), timeoutMs: 8000 });
                        if (bRes && bRes.html) html = bRes.html;
                    } catch (_) {}
                }
            }

            var articles = html.match(/<article[\s\S]*?<\/article>/gi) || [];
            if (articles.length === 0) continue;

            var results = [];
            for (var i = 0; i < articles.length; i++) {
                var art = articles[i];
                var linkMatch = art.match(/href="([^"]+)"/);
                var titleMatch = art.match(/title="([^"]+)"/) || art.match(/alt="([^"]+)"/);
                if (linkMatch && titleMatch) {
                    var rawTitle = titleMatch[1].replace(/<[^>]+>/g, '')
                        .replace(/&amp;/g, '&')
                        .replace(/&#039;/g, "'")
                        .replace(/&quot;/g, '"')
                        .trim();
                    results.push({
                        url: linkMatch[1],
                        title: rawTitle,
                        clean: cleanTitle(rawTitle)
                    });
                }
            }

            if (results.length > 0) return results;
        } catch (_) {}
    }
    return [];
}

/**
 * Resolves vgmlinks gateway to Nexdrive or Fast-DL links.
 */
async function resolveVgmlinks(vgmUrl, isMovie, seasonNum, episodeNum) {
    try {
        var pageHtml = '';
        try {
            var res = await safeFetch(vgmUrl, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': BASE_URL + '/'
                }
            }, 6000);
            if (res.ok) pageHtml = await res.text();
        } catch (_) {}

        if (!pageHtml || pageHtml.indexOf('challenges.cloudflare.com') >= 0 || pageHtml.indexOf('Just a moment...') >= 0) {
            if (typeof Browser !== 'undefined' && Browser.resolve) {
                try {
                    var bRes = await Browser.resolve({ url: vgmUrl, timeoutMs: 8000 });
                    if (bRes && bRes.html) pageHtml = bRes.html;
                } catch (_) {}
            }
        }

        var nexMatch = pageHtml.match(/https?:\/\/[^\s"'<>]*nexdrive[^\s"'<>]*/i);
        if (nexMatch) {
            var nexRes = await resolveNexdrive(nexMatch[0], isMovie, seasonNum, episodeNum);
            if (nexRes && nexRes.directFastDl) {
                var cdn = await resolveFastDlOne(nexRes.directFastDl);
                if (cdn) {
                    return [{
                        serverName: '10Gbps Google CDN',
                        displayName: 'Google Cloud CDN',
                        url: cdn,
                        quality: nexRes.quality,
                        priority: 1,
                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                    }];
                }
            } else if (nexRes && nexRes.hubUrls) {
                var hubTasks = nexRes.hubUrls.map(function(hUrl) {
                    return resolveHubCloud(hUrl).then(function(srvs) {
                        return srvs.map(function(s) {
                            return Object.assign({}, s, { quality: nexRes.quality });
                        });
                    }).catch(function() { return []; });
                });
                var hubBatches = await Promise.all(hubTasks);
                return Array.prototype.concat.apply([], hubBatches);
            }
        }
    } catch (_) {}
    return [];
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

    console.log('[Vegamovies] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[Vegamovies] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage);

    var epTag = !isMovie ? ('S' + pad(sNum) + 'E' + pad(eNum)) : '';
    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var candidates = await searchVegamovies(searchTitle);
    console.log('[Vegamovies] Search found ' + candidates.length + ' candidates');

    if (candidates.length === 0) {
        var firstWord = searchTitle.split(' ')[0];
        if (firstWord && firstWord.length > 3) {
            candidates = await searchVegamovies(firstWord);
            console.log('[Vegamovies] Fallback search found ' + candidates.length + ' candidates');
        }
    }

    if (candidates.length === 0) return [];

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
    if (!selected) {
        console.log('[Vegamovies] No matching candidate found for: ' + meta.title);
        return [];
    }
    console.log('[Vegamovies] Selected detail page: ' + selected.url);

    var postHtml = '';
    try {
        var postRes = await safeFetch(selected.url, { headers: DEFAULT_HEADERS }, 6000);
        if (postRes.ok) postHtml = await postRes.text();
    } catch (_) {}

    if (!postHtml || postHtml.indexOf('challenges.cloudflare.com') >= 0 || postHtml.indexOf('Just a moment...') >= 0) {
        if (typeof Browser !== 'undefined' && Browser.resolve) {
            try {
                var bRes = await Browser.resolve({ url: selected.url, timeoutMs: 8000 });
                if (bRes && bRes.html) postHtml = bRes.html;
            } catch (_) {}
        }
    }
    if (!postHtml) return [];

    var audioInfo = parseAudiosFromText(selected.title + ' ' + postHtml.slice(0, 5000));
    var subtitleList = [];


    var streamPromises = [];
    var seenStreamKeys = {};

    // Extract all Nexdrive, Fast-DL, Hubcloud, and VGMLinks download links
    var aRegex = /<a[^>]+href="([^"]*(?:nexdrive|vcloud|fast-dl|vgmlinks)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = aRegex.exec(postHtml)) !== null) {
        var href = m[1].replace(/&amp;/g, '&');
        var label = m[2].replace(/<[^>]+>/g, '').trim();
        var linkQuality = extractQualityFromContext(postHtml, m.index, label);

        if (href.indexOf('nexdrive') >= 0) {
            (function(nexUrl, quality) {
                streamPromises.push(
                    resolveNexdrive(nexUrl, isMovie, sNum, eNum).then(async function(result) {
                        if (!result) return [];
                        var effectiveQuality = (result && result.quality) ? result.quality : (quality || '1080p');
                        if (result.directFastDl) {
                            var directCdn = await resolveFastDlOne(result.directFastDl);
                            if (directCdn) {
                                return [{
                                    serverName: '10Gbps Google CDN',
                                    displayName: 'Google Cloud CDN',
                                    url: directCdn,
                                    quality: effectiveQuality,
                                    priority: 1,
                                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                                }];
                            }
                        } else if (result.hubUrls && result.hubUrls.length > 0) {
                            var hubTasks = result.hubUrls.map(function(hUrl) {
                                return resolveHubCloud(hUrl).then(function(srvs) {
                                    return srvs.map(function(s) {
                                        return Object.assign({}, s, { quality: effectiveQuality });
                                    });
                                }).catch(function() { return []; });
                            });
                            var hubBatches = await Promise.all(hubTasks);
                            return Array.prototype.concat.apply([], hubBatches);
                        }
                        return [];
                    })
                );
            })(href, linkQuality);
        } else if (href.indexOf('vgmlinks') >= 0) {
            (function(vgmUrl, quality) {
                streamPromises.push(
                    resolveVgmlinks(vgmUrl, isMovie, sNum, eNum).then(function(servers) {
                        return servers.map(function(s) {
                            return Object.assign({}, s, { quality: s.quality || quality || '1080p' });
                        });
                    })
                );
            })(href, linkQuality);
        } else if (href.indexOf('fast-dl.one') >= 0) {
            (function(fdlUrl, quality) {
                streamPromises.push(
                    resolveFastDlOne(fdlUrl).then(function(directCdn) {
                        if (!directCdn) return [];
                        return [{
                            serverName: '10Gbps Google CDN',
                            displayName: 'Google Cloud CDN',
                            url: directCdn,
                            quality: quality || '1080p',
                            priority: 1,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        }];
                    })
                );
            })(href, linkQuality);
        } else if (href.indexOf('vcloud') >= 0 || href.indexOf('hubcloud') >= 0) {
            (function(hubUrl, quality) {
                streamPromises.push(
                    resolveHubCloud(hubUrl).then(function(servers) {
                        return servers.map(function(s) {
                            return Object.assign({}, s, { quality: s.quality || quality || '1080p' });
                        });
                    })
                );
            })(href, linkQuality);
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
                (meta.title + ' (' + meta.year + ') ' + audioInfo.badge + ' - Vegamovies ' + item.displayName + ' [' + item.quality + ']') :
                (meta.title + ' ' + epTag + ' ' + audioInfo.badge + ' - Vegamovies ' + item.displayName + ' [' + item.quality + ']');

            var streamFormat = item.url.indexOf('.m3u8') >= 0 ? 'm3u8' :
                               (item.url.indexOf('.mpd') >= 0 ? 'mpd' : 'mp4');

            finalStreams.push({
                name: 'Vegamovies | ' + item.serverName + ' • ' + audioInfo.badge + ' (' + item.quality + ')',
                title: finalTitle,
                url: item.url,
                quality: item.quality,
                type: streamFormat,
                format: streamFormat,
                provider: 'vegamovies',
                language: (audioInfo.tag || 'hin').toLowerCase(),
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

    console.log('[Vegamovies] Discovered ' + finalStreams.length + ' direct stream(s)');
    return finalStreams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    globalThis.getStreams = getStreams;
}
