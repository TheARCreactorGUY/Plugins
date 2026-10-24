/**
 * Cinevood Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for Cinevood (https://cinevood.net / https://new1.cinevood.capital)
 * Supports Bollywood, Hollywood, South Indian Dubbed, Regional, and Web Series.
 *
 * High-Speed Direct CDN Streaming Engines:
 *  - Cinevood | FSL R2 Server (Direct Cloudflare R2 Presigned S3)
 *  - Cinevood | 10Gbps Pixel Cloud (Google Cloud CDN)
 *  - Cinevood | Pixeldrain Server (High-Speed Direct Stream)
 *  - Cinevood | ZipDisk Server (Cloudflare Edge Direct Stream)
 *
 * Features:
 *  - Dynamic mirror failover across active domains.
 *  - Oxxfile single file and season packs API resolution.
 *  - HubCloud / gamerxyt CDN gateway extraction.
 *  - Full TV Series season & episode targeting (SxxExx).
 *  - Dynamic multi-audio & subtitle track extraction ([MULTI] [HIN · ENG], [HIN], etc.).
 *  - Strict compliance with MatchScorer.kt and Euthopiar DownloadEngine.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://cinevood.dog';
var BACKUP_URLS = [
    'https://cinevood.dog',
    'https://cinevood.garden',
    'https://cinevood.hair',
    'https://cinevood.xyz',
    'https://new1.cinevood.capital',
    'https://cinevood.net',
    'https://1cinevood.fyi'
];
var OXXFILE_BASE = 'https://new10.oxxfile.info';
var OXXFILE_BACKUPS = [
    'https://new10.oxxfile.info',
    'https://oxxfile.info',
    'https://oxxfile.fun'
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
    var q = parseQualityFromText(label);
    if (q) return q;

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

        // 1. Dynamic Pixeldrain extraction (bypasses anti-DMCA decoy link negn6f)
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
 * Resolves a mobilejsr / genxfm link to HubCloud, Google CDN, or direct streams.
 */
async function resolveMobileJsr(jsrUrl, isMovie, seasonNum, episodeNum) {
    try {
        var cleanJsr = jsrUrl.replace(/\/+$/, '') + '/';
        var pageHtml = '';
        var sniffedMedia = [];

        // 1. Try safeFetch FIRST
        try {
            var fRes = await safeFetch(cleanJsr, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': BASE_URL + '/'
                }
            }, 5000);
            if (fRes.ok) {
                var txt = await fRes.text();
                if (txt && txt.indexOf('Just a moment...') === -1 && txt.indexOf('challenges.cloudflare.com') === -1) {
                    pageHtml = txt;
                }
            }
        } catch (_) {}

        // 2. Fall back to Browser.resolve with short timeout
        if (!pageHtml && typeof Browser !== 'undefined' && Browser.resolve) {
            try {
                var bRes = await Browser.resolve({
                    url: cleanJsr,
                    timeoutMs: 8000
                });
                if (bRes) {
                    if (bRes.html) pageHtml = bRes.html;
                    if (Array.isArray(bRes.sniffedMedia)) sniffedMedia = bRes.sniffedMedia;
                }
            } catch (_) {}
        }

        var servers = [];
        var seenUrls = {};
        var asyncTasks = [];

        // 1. Sniffed direct media
        for (var sm = 0; sm < sniffedMedia.length; sm++) {
            var mediaItem = sniffedMedia[sm];
            if (mediaItem && mediaItem.url && !mediaItem.isSubtitles && !seenUrls[mediaItem.url]) {
                seenUrls[mediaItem.url] = true;
                servers.push({
                    serverName: 'Direct Stream',
                    displayName: 'Direct Stream',
                    url: mediaItem.url,
                    priority: 1,
                    headers: mediaItem.headers || { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            }
        }

        if (pageHtml) {
            var titleMatch = pageHtml.match(/<title>([\s\S]*?)<\/title>/i) || pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            var pageQuality = titleMatch ? parseQualityFromText(titleMatch[1].replace(/<[^>]+>/g, '')) : null;

            // 2. Fast-DL (G-Direct) links
            var fastDlLinks = [];
            var aRegex = /<a[^>]+href="([^"]*fast-dl\.one[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            var fm;
            while ((fm = aRegex.exec(pageHtml)) !== null) {
                fastDlLinks.push(fm[1].replace(/&amp;/g, '&'));
            }

            if (fastDlLinks.length > 0) {
                var chosenFastDl = null;
                if (isMovie) {
                    chosenFastDl = fastDlLinks[0];
                } else {
                    var epIdx = (Number(episodeNum) || 1) - 1;
                    chosenFastDl = (epIdx >= 0 && epIdx < fastDlLinks.length) ? fastDlLinks[epIdx] : fastDlLinks[0];
                }

                if (chosenFastDl) {
                    var directCdn = await resolveFastDlOne(chosenFastDl);
                    if (directCdn && !seenUrls[directCdn]) {
                        seenUrls[directCdn] = true;
                        servers.push({
                            serverName: '10Gbps Google CDN',
                            displayName: 'Google Cloud CDN',
                            url: directCdn,
                            quality: pageQuality,
                            priority: 1,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    }
                }
            }

            // 3. Other server links
            var generalRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            var m;
            var asyncGeneralTasks = [];
            while ((m = generalRegex.exec(pageHtml)) !== null) {
                var href = m[1].replace(/&amp;/g, '&');
                var label = m[2].replace(/<[^>]+>/g, '').trim();
                if (!href || href.startsWith('#') || href.startsWith('/') || seenUrls[href]) continue;

                if (href.indexOf('video-downloads.googleusercontent.com') >= 0) {
                    seenUrls[href] = true;
                    servers.push({
                        serverName: '10Gbps Google CDN',
                        displayName: 'Google Cloud CDN',
                        url: href,
                        quality: pageQuality,
                        priority: 1,
                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                    });
                } else if (href.indexOf('hubcloud') >= 0 || href.indexOf('gamerxyt') >= 0) {
                    seenUrls[href] = true;
                    (function(h) {
                        asyncGeneralTasks.push(resolveHubCloud(h).then(function(hubS) {
                            if (hubS && hubS.length) {
                                servers = servers.concat(hubS.map(function(s) {
                                    if (pageQuality && !s.quality) s.quality = pageQuality;
                                    return s;
                                }));
                            }
                        }).catch(function() {}));
                    })(href);
                } else if (href.indexOf('pixeldrain.com/u/') >= 0) {
                    seenUrls[href] = true;
                    var directPxl = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download');
                    servers.push({
                        serverName: 'Pixeldrain',
                        displayName: 'Pixeldrain Server',
                        url: directPxl,
                        quality: pageQuality,
                        priority: 2,
                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                    });
                } else if (href.indexOf('r2.cloudflarestorage.com') >= 0 || href.indexOf('r2.dev') >= 0) {
                    seenUrls[href] = true;
                    servers.push({
                        serverName: 'FSL R2',
                        displayName: 'FSL R2 Server',
                        url: href,
                        quality: pageQuality,
                        priority: 1,
                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                    });
                } else if (href.indexOf('workers.dev') >= 0) {
                    seenUrls[href] = true;
                    servers.push({
                        serverName: 'ZipDisk',
                        displayName: 'ZipDisk Server',
                        url: href,
                        quality: pageQuality,
                        priority: 3,
                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                    });
                }
            }
            if (asyncGeneralTasks.length > 0) {
                await Promise.all(asyncGeneralTasks);
            }
        }

        if (servers.length > 0) return servers;

        if (typeof globalThis.EmbedExtractor !== 'undefined' && globalThis.EmbedExtractor.canHandle(cleanJsr)) {
            try {
                var extStreams = await globalThis.EmbedExtractor.resolve(cleanJsr, { name: 'Cinevood' });
                if (extStreams && extStreams.length > 0) return extStreams;
            } catch (_) {}
        }
    } catch (_) {}
    return [];
}

/**
 * Resolves an Oxxfile single link (/s/) to HubCloud URL.
 */
async function resolveOxxfileSingle(oxxUrl) {
    try {
        var baseDomain = OXXFILE_BASE;
        var cleanLink = oxxUrl;
        if (cleanLink.indexOf('http') !== 0) cleanLink = baseDomain + cleanLink;
        var apiUrl = cleanLink.replace('/s/', '/api/s/') + '/hubcloud/';
        var res = await safeFetch(apiUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': cleanLink
            },
            redirect: 'follow'
        }, 7000);
        var finalUrl = res.url || '';
        if (finalUrl.indexOf('hubcloud.') >= 0 || finalUrl.indexOf('gamerxyt.') >= 0) {
            return finalUrl;
        }
    } catch (_) {}
    return null;
}

/**
 * Resolves an Oxxfile TV series pack (/p/) to episode HubCloud links.
 */
async function resolveOxxfilePack(packUrl, seasonNum, episodeNum) {
    try {
        var baseDomain = OXXFILE_BASE;
        var cleanLink = packUrl;
        if (cleanLink.indexOf('http') !== 0) cleanLink = baseDomain + cleanLink;
        var apiUrl = cleanLink.replace('/p/', '/api/packs/') + '/';
        var res = await safeFetch(apiUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': cleanLink
            }
        }, 8000);
        if (!res.ok) return null;
        var json = await res.json();
        if (!json || !json.pack || !Array.isArray(json.pack.items)) return null;

        var epRegex = new RegExp('(?:S0*' + seasonNum + ')?\\s*E0*' + episodeNum + '\\b|Episode\\s*0*' + episodeNum + '\\b', 'i');
        var items = json.pack.items;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var fName = item.file_name || '';
            if (epRegex.test(fName) && item.hubcloud_link) {
                return item.hubcloud_link;
            }
        }
        // Fallback: positional matching if 1-indexed
        if (episodeNum <= items.length && items[episodeNum - 1] && items[episodeNum - 1].hubcloud_link) {
            return items[episodeNum - 1].hubcloud_link;
        }
    } catch (_) {}
    return null;
}

/**
 * Searches Cinevood across base and backup URLs.
 */
async function searchCinevood(query) {
    var searchBases = [BASE_URL].concat(BACKUP_URLS);
    var seenBases = {};

    for (var b = 0; b < searchBases.length; b++) {
        var currentBase = searchBases[b];
        if (seenBases[currentBase]) continue;
        seenBases[currentBase] = true;

        try {
            var searchUrl = currentBase + '/page/1/?s=' + encodeURIComponent(query);
            var res = await safeFetch(searchUrl, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': currentBase + '/'
                }
            }, 7000);
            if (!res.ok) continue;

            var html = await res.text();
            var articles = html.match(/<article[\s\S]*?<\/article>/gi) || [];
            if (articles.length === 0) continue;

            var results = [];
            for (var i = 0; i < articles.length; i++) {
                var art = articles[i];
                var linkMatch = art.match(/href="([^"]+)"/);
                var titleMatch = art.match(/title="([^"]+)"/) || art.match(/alt="([^"]+)"/);
                if (linkMatch && titleMatch) {
                    var rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
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
 * Main getStreams implementation.
 */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var isMovie = mediaType === 'movie';
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;

    console.log('[Cinevood] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[Cinevood] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage);

    var epTag = !isMovie ? ('S' + pad(sNum) + 'E' + pad(eNum)) : '';
    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var candidates = await searchCinevood(searchTitle);
    console.log('[Cinevood] Search found ' + candidates.length + ' candidates');

    if (candidates.length === 0) {
        var firstWord = searchTitle.split(' ')[0];
        if (firstWord && firstWord.length > 3) {
            candidates = await searchCinevood(firstWord);
            console.log('[Cinevood] Fallback search found ' + candidates.length + ' candidates');
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
        console.log('[Cinevood] No matching candidate found for: ' + meta.title);
        return [];
    }
    console.log('[Cinevood] Selected detail page: ' + selected.url);

    var postHtml = '';
    try {
        var postRes = await safeFetch(selected.url, { headers: DEFAULT_HEADERS }, 8000);
        if (postRes.ok) {
            postHtml = await postRes.text();
        }
    } catch (_) {}

    if (!postHtml || postHtml.indexOf('challenges.cloudflare.com') >= 0 || postHtml.indexOf('Just a moment...') >= 0) {
        if (typeof Browser !== 'undefined' && Browser.resolve) {
            try {
                var bRes = await Browser.resolve(selected.url);
                if (bRes && bRes.html) postHtml = bRes.html;
            } catch (_) {}
        }
    }
    if (!postHtml) return [];

    var audioInfo = parseAudiosFromText(selected.title + ' ' + postHtml.slice(0, 5000));
    var subtitleList = [];


    var streamPromises = [];
    var seenStreamKeys = {};

    if (isMovie) {
        var aRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        var movieCandidates = [];
        var seenCandidateQualities = {};
        while ((m = aRegex.exec(postHtml)) !== null) {
            var href = m[1];
            var label = m[2].replace(/<[^>]+>/g, '').trim();
            if (/batch|zip/i.test(label) || /sample/i.test(label)) continue;
            var linkQuality = extractQualityFromContext(postHtml, m.index, label) || '1080p';

            if (href.indexOf('mobilejsr') >= 0 || href.indexOf('genxfm') >= 0) {
                if (!seenCandidateQualities[linkQuality]) {
                    seenCandidateQualities[linkQuality] = true;
                    movieCandidates.push({ type: 'jsr', href: href, quality: linkQuality });
                }
            } else if (href.indexOf('oxxfile') >= 0 && href.indexOf('/s/') >= 0) {
                movieCandidates.push({ type: 'oxx', href: href, quality: linkQuality });
            } else if (href.indexOf('hubcloud.') >= 0 || href.indexOf('gamerxyt.') >= 0) {
                movieCandidates.push({ type: 'hub', href: href, quality: linkQuality });
            }
        }

        // Limit to at most 3 distinct candidates
        var selectedCandidates = movieCandidates.slice(0, 3);
        for (var c = 0; c < selectedCandidates.length; c++) {
            var cand = selectedCandidates[c];
            if (cand.type === 'jsr') {
                (function(jsrUrl, quality) {
                    streamPromises.push(
                        resolveMobileJsr(jsrUrl, true, 1, 1).then(function(servers) {
                            return servers.map(function(s) {
                                return Object.assign({}, s, { quality: s.quality || quality || '1080p' });
                            });
                        })
                    );
                })(cand.href, cand.quality);
            } else if (cand.type === 'oxx') {
                (function(oxxUrl, quality) {
                    streamPromises.push(
                        resolveOxxfileSingle(oxxUrl).then(function(hubUrl) {
                            if (!hubUrl) return [];
                            return resolveHubCloud(hubUrl).then(function(servers) {
                                return servers.map(function(s) {
                                    return Object.assign({}, s, { quality: quality || '1080p' });
                                });
                            });
                        })
                    );
                })(cand.href, cand.quality);
            } else if (cand.type === 'hub') {
                (function(hubUrl, quality) {
                    streamPromises.push(
                        resolveHubCloud(hubUrl).then(function(servers) {
                            return servers.map(function(s) {
                                return Object.assign({}, s, { quality: quality || '1080p' });
                            });
                        })
                    );
                })(cand.href, cand.quality);
            }
        }
    } else {
        // TV Series: support both Oxxfile packs and mobilejsr / genxfm episode links
        var epRegex = new RegExp('(?:Episode\\s*0*' + eNum + '|E0*' + eNum + '|EP-\\s*0*' + eNum + ')\\b', 'i');

        // 1. MobileJSR links
        var jsrRegex = /<a[^>]+href="([^"]*(?:mobilejsr|genxfm)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var jm;
        var tvCandidates = [];
        var seenTvQualities = {};
        while ((jm = jsrRegex.exec(postHtml)) !== null) {
            var jHref = jm[1];
            var jLabel = jm[2].replace(/<[^>]+>/g, '').trim();
            if (/batch|zip/i.test(jLabel) || /sample/i.test(jLabel)) continue;
            var preSlice = postHtml.substring(Math.max(0, jm.index - 500), jm.index);
            var sMatch = preSlice.match(/season\s*0*(\d+)/i) || preSlice.match(/s0*(\d+)/i);
            var qFromSlice = parseQualityFromText(preSlice) || '1080p';

            if (sMatch && Number(sMatch[1]) === sNum) {
                if (!seenTvQualities[qFromSlice]) {
                    seenTvQualities[qFromSlice] = true;
                    tvCandidates.push({ href: jHref, quality: qFromSlice });
                }
            } else if (!sMatch && sNum === 1) {
                if (!seenTvQualities[qFromSlice]) {
                    seenTvQualities[qFromSlice] = true;
                    tvCandidates.push({ href: jHref, quality: qFromSlice });
                }
            }
        }

        var selectedTv = tvCandidates.slice(0, 3);
        for (var t = 0; t < selectedTv.length; t++) {
            (function(jUrl, quality) {
                streamPromises.push(
                    resolveMobileJsr(jUrl, false, sNum, eNum).then(function(servers) {
                        return servers.map(function(s) {
                            return Object.assign({}, s, { quality: s.quality || quality || '1080p' });
                        });
                    })
                );
            })(selectedTv[t].href, selectedTv[t].quality);
        }

        // 2. Oxxfile TV Packs
        var packRegex = /<a[^>]+href="([^"]*oxxfile[^"]*\/p\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var pm;
        while ((pm = packRegex.exec(postHtml)) !== null) {
            var pUrl = pm[1];
            var pLabel = pm[2].replace(/<[^>]+>/g, '').trim();
            var packQuality = extractQualityFromContext(postHtml, pm.index, pLabel);
            (function(packUrl, quality) {
                streamPromises.push(
                    resolveOxxfilePack(packUrl, sNum, eNum).then(function(hubUrl) {
                        if (!hubUrl) return [];
                        return resolveHubCloud(hubUrl).then(function(servers) {
                            return servers.map(function(s) {
                                return Object.assign({}, s, { quality: quality || '1080p' });
                            });
                        });
                    })
                );
            })(pUrl, packQuality);
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
                (meta.title + ' (' + meta.year + ') ' + audioInfo.badge + ' - Cinevood ' + item.displayName + ' [' + item.quality + ']') :
                (meta.title + ' ' + epTag + ' ' + audioInfo.badge + ' - Cinevood ' + item.displayName + ' [' + item.quality + ']');

            var streamFormat = item.url.indexOf('.m3u8') >= 0 ? 'm3u8' :
                               (item.url.indexOf('.mpd') >= 0 ? 'mpd' : 'mp4');

            finalStreams.push({
                name: 'Cinevood | ' + item.serverName + ' • ' + audioInfo.badge + ' (' + item.quality + ')',
                title: finalTitle,
                url: item.url,
                quality: item.quality,
                type: streamFormat,
                format: streamFormat,
                provider: 'cinevood',
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

    console.log('[Cinevood] Discovered ' + finalStreams.length + ' direct stream(s)');
    return finalStreams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    globalThis.getStreams = getStreams;
}
