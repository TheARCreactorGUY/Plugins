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
var BASE_URL = 'https://cinevood.courses';
var BACKUP_URLS = [
    'https://cinevood.courses',
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

function cleanGatewayUrl(rawUrl) {
    if (!rawUrl) return '';
    var u = rawUrl.split('?')[0];
    u = u.replace(/\/+$/, '');
    u = u.replace(/([^:])\/\/+/g, '$1/');
    return u + '/';
}

/**
 * Resolves a mobilejsr / genxfm link to HubCloud, Google CDN, or direct streams.
 */
async function resolveMobileJsr(jsrUrl, isMovie, seasonNum, episodeNum) {
    try {
        var cleanJsr = cleanGatewayUrl(jsrUrl);
        var pageHtml = '';
        var finalResolvedUrl = cleanJsr;
        var sniffedMedia = [];
        var sniffedUrls = [];

        // 1. Try safeFetch FIRST (quick attempt if domain is reachable without challenge)
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
                    finalResolvedUrl = fRes.url || cleanJsr;
                }
            }
        } catch (_) {}

        // 2. Fall back to Browser.resolve with 15000ms timeout for Cloudflare Turnstile completion
        if (!pageHtml && typeof Browser !== 'undefined' && Browser.resolve) {
            try {
                var bRes = await Browser.resolve({
                    url: cleanJsr,
                    timeoutMs: 15000
                });
                if (bRes) {
                    if (bRes.finalUrl) finalResolvedUrl = bRes.finalUrl;
                    if (bRes.html) pageHtml = bRes.html;
                    if (Array.isArray(bRes.sniffedMedia)) sniffedMedia = bRes.sniffedMedia;
                    if (Array.isArray(bRes.sniffedUrls)) sniffedUrls = bRes.sniffedUrls;
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

        // 2. Direct resolution of finalResolvedUrl if redirected to a media locker
        if (finalResolvedUrl && finalResolvedUrl.indexOf('mobilejsr') === -1 && finalResolvedUrl.indexOf('genxfm') === -1) {
            if (finalResolvedUrl.indexOf('fast-dl.one') >= 0) {
                asyncTasks.push(resolveFastDlOne(finalResolvedUrl).then(function(cdn) {
                    if (cdn && !seenUrls[cdn]) {
                        seenUrls[cdn] = true;
                        servers.push({
                            serverName: '10Gbps Google CDN',
                            displayName: 'Google Cloud CDN',
                            url: cdn,
                            priority: 1,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    }
                }).catch(function() {}));
            } else if (finalResolvedUrl.indexOf('hubcloud') >= 0 || finalResolvedUrl.indexOf('gamerxyt') >= 0) {
                asyncTasks.push(resolveHubCloud(finalResolvedUrl).then(function(hubS) {
                    if (hubS && hubS.length) servers = servers.concat(hubS);
                }).catch(function() {}));
            } else if (finalResolvedUrl.indexOf('video-downloads.googleusercontent.com') >= 0 && !seenUrls[finalResolvedUrl]) {
                seenUrls[finalResolvedUrl] = true;
                servers.push({
                    serverName: '10Gbps Google CDN',
                    displayName: 'Google Cloud CDN',
                    url: finalResolvedUrl,
                    priority: 1,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            }
        }

        // 3. Inspect sniffedUrls for locker URLs
        for (var su = 0; su < sniffedUrls.length; su++) {
            var sUrl = sniffedUrls[su];
            if (!sUrl || seenUrls[sUrl]) continue;
            if (sUrl.indexOf('fast-dl.one') >= 0) {
                seenUrls[sUrl] = true;
                (function(h) {
                    asyncTasks.push(resolveFastDlOne(h).then(function(cdn) {
                        if (cdn && !seenUrls[cdn]) {
                            seenUrls[cdn] = true;
                            servers.push({
                                serverName: '10Gbps Google CDN',
                                displayName: 'Google Cloud CDN',
                                url: cdn,
                                priority: 1,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
                    }).catch(function() {}));
                })(sUrl);
            } else if (sUrl.indexOf('hubcloud') >= 0 || sUrl.indexOf('gamerxyt') >= 0) {
                seenUrls[sUrl] = true;
                (function(h) {
                    asyncTasks.push(resolveHubCloud(h).then(function(hubS) {
                        if (hubS && hubS.length) servers = servers.concat(hubS);
                    }).catch(function() {}));
                })(sUrl);
            }
        }

        // 4. Parse page HTML
        if (pageHtml) {
            var titleMatch = pageHtml.match(/<title>([\s\S]*?)<\/title>/i) || pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            var pageQuality = titleMatch ? parseQualityFromText(titleMatch[1].replace(/<[^>]+>/g, '')) : null;

            // Extract all link anchors with label and href
            var aRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            var am;
            var allLinks = [];
            while ((am = aRegex.exec(pageHtml)) !== null) {
                var rawHref = am[1].replace(/&amp;/g, '&').trim();
                var label = am[2].replace(/<[^>]+>/g, '').trim();
                if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;
                var fullHref = rawHref;
                if (fullHref.startsWith('/')) {
                    try {
                        fullHref = new URL(fullHref, finalResolvedUrl).href;
                    } catch (_) {}
                }
                allLinks.push({ href: fullHref, label: label });
            }

            if (!isMovie) {
                // TV Episode resolution
                var epRegex = new RegExp('(?:^|\\b)(?:episode|ep|e)\\s*0*' + episodeNum + '(?:\\b|\\D|$)', 'i');
                var epLinks = allLinks.filter(function(l) {
                    return epRegex.test(l.label) || epRegex.test(l.href);
                });

                var targetLinks = epLinks;
                if (targetLinks.length === 0) {
                    var candidateList = allLinks.filter(function(l) {
                        return l.href.indexOf('fast-dl.one') >= 0 ||
                               l.href.indexOf('hubcloud') >= 0 ||
                               l.href.indexOf('gamerxyt') >= 0 ||
                               l.href.indexOf('pixeldrain') >= 0 ||
                               l.href.indexOf('googleusercontent') >= 0;
                    });
                    var epIdx = (Number(episodeNum) || 1) - 1;
                    if (epIdx >= 0 && epIdx < candidateList.length) {
                        targetLinks = [candidateList[epIdx]];
                    } else if (candidateList.length > 0) {
                        targetLinks = [candidateList[0]];
                    }
                }

                for (var ti = 0; ti < targetLinks.length; ti++) {
                    var tItem = targetLinks[ti];
                    var tHref = tItem.href;
                    if (!tHref || seenUrls[tHref]) continue;
                    seenUrls[tHref] = true;

                    if (tHref.indexOf('fast-dl.one') >= 0) {
                        (function(h) {
                            asyncTasks.push(resolveFastDlOne(h).then(function(cdn) {
                                if (cdn && !seenUrls[cdn]) {
                                    seenUrls[cdn] = true;
                                    servers.push({
                                        serverName: '10Gbps Google CDN',
                                        displayName: 'Google Cloud CDN',
                                        url: cdn,
                                        quality: pageQuality,
                                        priority: 1,
                                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                                    });
                                }
                            }).catch(function() {}));
                        })(tHref);
                    } else if (tHref.indexOf('hubcloud') >= 0 || tHref.indexOf('gamerxyt') >= 0) {
                        (function(h) {
                            asyncTasks.push(resolveHubCloud(h).then(function(hubS) {
                                if (hubS && hubS.length) {
                                    servers = servers.concat(hubS.map(function(s) {
                                        if (pageQuality && !s.quality) s.quality = pageQuality;
                                        return s;
                                    }));
                                }
                            }).catch(function() {}));
                        })(tHref);
                    } else if (tHref.indexOf('pixeldrain.com/u/') >= 0) {
                        var directPxl = tHref.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download');
                        servers.push({
                            serverName: 'Pixeldrain',
                            displayName: 'Pixeldrain Server',
                            url: directPxl,
                            quality: pageQuality,
                            priority: 2,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    } else if (tHref.indexOf('video-downloads.googleusercontent.com') >= 0) {
                        servers.push({
                            serverName: '10Gbps Google CDN',
                            displayName: 'Google Cloud CDN',
                            url: tHref,
                            quality: pageQuality,
                            priority: 1,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    }
                }
            } else {
                // Movie resolution
                for (var li = 0; li < allLinks.length; li++) {
                    var linkItem = allLinks[li];
                    var lHref = linkItem.href;
                    if (!lHref || seenUrls[lHref]) continue;

                    if (lHref.indexOf('fast-dl.one') >= 0) {
                        seenUrls[lHref] = true;
                        (function(h) {
                            asyncTasks.push(resolveFastDlOne(h).then(function(cdn) {
                                if (cdn && !seenUrls[cdn]) {
                                    seenUrls[cdn] = true;
                                    servers.push({
                                        serverName: '10Gbps Google CDN',
                                        displayName: 'Google Cloud CDN',
                                        url: cdn,
                                        quality: pageQuality,
                                        priority: 1,
                                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                                    });
                                }
                            }).catch(function() {}));
                        })(lHref);
                    } else if (lHref.indexOf('hubcloud') >= 0 || lHref.indexOf('gamerxyt') >= 0) {
                        seenUrls[lHref] = true;
                        (function(h) {
                            asyncTasks.push(resolveHubCloud(h).then(function(hubS) {
                                if (hubS && hubS.length) {
                                    servers = servers.concat(hubS.map(function(s) {
                                        if (pageQuality && !s.quality) s.quality = pageQuality;
                                        return s;
                                    }));
                                }
                            }).catch(function() {}));
                        })(lHref);
                    } else if (lHref.indexOf('video-downloads.googleusercontent.com') >= 0) {
                        seenUrls[lHref] = true;
                        servers.push({
                            serverName: '10Gbps Google CDN',
                            displayName: 'Google Cloud CDN',
                            url: lHref,
                            quality: pageQuality,
                            priority: 1,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    } else if (lHref.indexOf('pixeldrain.com/u/') >= 0) {
                        seenUrls[lHref] = true;
                        var directPxl = lHref.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download');
                        servers.push({
                            serverName: 'Pixeldrain',
                            displayName: 'Pixeldrain Server',
                            url: directPxl,
                            quality: pageQuality,
                            priority: 2,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    } else if (lHref.indexOf('r2.cloudflarestorage.com') >= 0 || lHref.indexOf('r2.dev') >= 0) {
                        seenUrls[lHref] = true;
                        servers.push({
                            serverName: 'FSL R2',
                            displayName: 'FSL R2 Server',
                            url: lHref,
                            quality: pageQuality,
                            priority: 1,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    } else if (lHref.indexOf('workers.dev') >= 0) {
                        seenUrls[lHref] = true;
                        servers.push({
                            serverName: 'ZipDisk',
                            displayName: 'ZipDisk Server',
                            url: lHref,
                            quality: pageQuality,
                            priority: 3,
                            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                        });
                    }
                }
            }
        }

        if (asyncTasks.length > 0) {
            await Promise.all(asyncTasks);
        }

        if (servers.length > 0) return servers;

        // Try EmbedExtractor if available
        if (typeof globalThis.EmbedExtractor !== 'undefined' && globalThis.EmbedExtractor.canHandle(cleanJsr)) {
            try {
                var extStreams = await globalThis.EmbedExtractor.resolve(cleanJsr, { name: 'Cinevood' });
                if (extStreams && extStreams.length > 0) return extStreams;
            } catch (_) {}
        }

        // Return empty array if no playable stream resolved.
        // NEVER return intermediate gateway HTML pages as media streams!
        return [];
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
            var searchUrl = currentBase + '/?s=' + encodeURIComponent(query);
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
    var targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1; });
    var scoredCandidates = [];

    for (var i = 0; i < candidates.length; i++) {
        var cand = candidates[i];
        var candClean = cand.clean;
        var candTitle = cand.title;
        var score = 0;

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
            } else if (href.indexOf('fast-dl.one') >= 0) {
                if (!seenCandidateQualities[linkQuality + '_fastdl']) {
                    seenCandidateQualities[linkQuality + '_fastdl'] = true;
                    movieCandidates.push({ type: 'fastdl', href: href, quality: linkQuality });
                }
            } else if (href.indexOf('oxxfile') >= 0 && href.indexOf('/s/') >= 0) {
                movieCandidates.push({ type: 'oxx', href: href, quality: linkQuality });
            } else if (href.indexOf('hubcloud.') >= 0 || href.indexOf('gamerxyt.') >= 0) {
                movieCandidates.push({ type: 'hub', href: href, quality: linkQuality });
            }
        }

        // Limit to at most 4 distinct quality candidates
        var selectedCandidates = movieCandidates.slice(0, 4);
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
            } else if (cand.type === 'fastdl') {
                (function(fastDlUrl, quality) {
                    streamPromises.push(
                        resolveFastDlOne(fastDlUrl).then(function(cdn) {
                            if (!cdn) return [];
                            return [{
                                serverName: '10Gbps Google CDN',
                                displayName: 'Google Cloud CDN',
                                url: cdn,
                                quality: quality || '1080p',
                                priority: 1,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            }];
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
        var postSeasonMatch = (selected.title + ' ' + postHtml.slice(0, 2500)).match(/season\s*0*(\d+)/i) ||
                              (selected.title + ' ' + postHtml.slice(0, 2500)).match(/s0*(\d+)/i);
        var defaultSeason = postSeasonMatch ? Number(postSeasonMatch[1]) : 1;

        // 1. MobileJSR links
        var jsrRegex = /<a[^>]+href="([^"]*(?:mobilejsr|genxfm)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var jm;
        var tvCandidates = [];
        var seenTvQualities = {};
        while ((jm = jsrRegex.exec(postHtml)) !== null) {
            var jHref = jm[1];
            var jLabel = jm[2].replace(/<[^>]+>/g, '').trim();
            if (/batch|zip/i.test(jLabel) || /sample/i.test(jLabel)) continue;
            var preSlice = postHtml.substring(Math.max(0, jm.index - 600), jm.index);
            var sMatch = preSlice.match(/season\s*0*(\d+)/i) || preSlice.match(/s0*(\d+)/i);
            var seasonFound = sMatch ? Number(sMatch[1]) : defaultSeason;
            var qFromSlice = parseQualityFromText(preSlice) || '1080p';

            if (seasonFound === sNum) {
                var btnType = jLabel.indexOf('G-Direct') >= 0 ? 'gdirect' : (jLabel.indexOf('M-Cloud') >= 0 ? 'mcloud' : 'direct');
                var tvKey = qFromSlice + '_' + btnType;
                if (!seenTvQualities[tvKey]) {
                    seenTvQualities[tvKey] = true;
                    tvCandidates.push({ href: jHref, quality: qFromSlice, btnType: btnType });
                }
            }
        }

        var selectedTv = tvCandidates.slice(0, 4);
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
                               (item.url.indexOf('.mpd') >= 0 ? 'mpd' :
                               (item.url.indexOf('.mkv') >= 0 ? 'mkv' : 'mp4'));

            finalStreams.push({
                name: 'Cinevood | ' + item.serverName + ' • ' + audioInfo.badge + ' (' + item.quality + ')',
                title: finalTitle,
                url: item.url,
                quality: item.quality,
                type: streamFormat,
                format: streamFormat,
                container: streamFormat === 'mkv' ? 'mkv' : (streamFormat === 'mpd' ? 'dash' : (streamFormat === 'm3u8' ? 'hls' : 'mp4')),
                isSequential: streamFormat === 'mkv' || streamFormat === 'mp4',
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
