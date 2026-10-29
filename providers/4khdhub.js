/**
 * 4KHDHub Provider Plugin for Euthopiar / Nuvio
 *
 * Dedicated provider for 4KHDHub (https://4khdhub.one/)
 * Supports Movies, TV Series, Webseries, and Anime.
 *
 * Native Direct High-Speed Engines:
 *  - 4KHDHub | FSL R2 Server (Direct Cloudflare R2 Presigned Streaming)
 *  - 4KHDHub | Server : 10Gbps (Pixel Cloud / Google User Content)
 *  - 4KHDHub | ZipDisk Server (Cloudflare Edge Direct Stream)
 *  - 4KHDHub | Pixeldrain Server (Direct Stream CDN)
 *
 * Compatible with Android QuickJS runtime (pure atob, no Node.js Buffer, no AbortSignal.timeout).
 * Formatted specifically for MatchScorer.kt:
 *  - TV / Series / Anime: "Title SxxExx [Audio] - Server [Quality]" (+0.25 episode bonus)
 *  - Movies: "Title (Year) [Audio] - Server [Quality]" (clean movie match)
 */

var BASE_URL = 'https://4khdhub.one';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

function safeFetch(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 7000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var opts = Object.assign({}, options);
    if (controller) {
        opts.signal = controller.signal;
        timer = setTimeout(function() {
            try { controller.abort(); } catch (_) {}
        }, timeoutMs);
    }
    return fetch(url, opts).then(function(res) {
        if (timer) clearTimeout(timer);
        return res;
    }).catch(function(err) {
        if (timer) clearTimeout(timer);
        throw err;
    });
}

var LANGUAGE_MAP = {
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
    var lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    for (var k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) {
            return LANGUAGE_MAP[k];
        }
    }
    return { name: String(code).toUpperCase(), tag: String(code).slice(0, 3).toUpperCase() };
}

function parseAudiosFromText(text) {
    if (!text) return { isMulti: false, primary: 'English', tag: 'ENG', badge: '[ENG]' };
    var upper = String(text).toUpperCase();
    var langs = [];

    var isMultiCue = /\b(MULTI|DUAL|MULTI-AUDIO|DUAL-AUDIO)\b/i.test(upper) ||
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
        var info = getLanguageInfo(tag.toLowerCase());
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
    var t = String(text);

    // 1. Explicit 2160p is definitely 4K UHD
    if (/2160p\b/i.test(t)) return '4K 2160p';

    // 2. Explicit 1080p or 1080i is definitely 1080p (even if DS4K or 4K Remastered is in title)
    if (/1080[pi]\b|fhd\b/i.test(t)) return '1080p';

    // 3. Explicit 720p is definitely 720p
    if (/720p\b/i.test(t)) return '720p';

    // 4. Explicit 480p or 576p is definitely 480p
    if (/(?:480|576)p\b|sd\b/i.test(t)) return '480p';

    // 5. Clean string from site watermark (4khdhub), DS4K, 4K Remaster before standalone 4K check
    var clean = t.replace(/\bds-?4k\b/gi, '')
                 .replace(/\b4k[-_ ]?hdhub[a-z0-9.]*\b/gi, '')
                 .replace(/4k[- ]?remaster(?:ed)?/gi, '')
                 .replace(/4k[- ]?sdr/gi, '')
                 .replace(/4k[- ]?hdr/gi, '');

    if (/\b(?:4k|uhd)\b/i.test(clean)) return '4K 2160p';
    if (/\b(?:hd)\b/i.test(clean)) return '720p';

    return '1080p';
}

function rot13(str) {
    return String(str).replace(/[a-zA-Z]/g, function(c) {
        var base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
}

function decodeB64(str) {
    if (typeof atob === 'function') {
        return atob(str);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'base64').toString('utf8');
    }
    return '';
}

function decodeGreenmotorsPayload(encoded) {
    try {
        var s1 = decodeB64(encoded);
        var s2 = decodeB64(s1);
        var s3 = rot13(s2);
        var s4 = decodeB64(s3);
        var parsed = JSON.parse(s4);
        return decodeB64(parsed.o);
    } catch(e) {
        return null;
    }
}

async function resolveGreenmotorsUrl(gmUrl) {
    try {
        var res = await safeFetch(gmUrl, {
            headers: DEFAULT_HEADERS,
            redirect: 'follow'
        }, 8000);
        var text = await res.text();
        var m = text.match(/s\('o',\s*'([^']+)'/);
        if (!m) return null;
        return decodeGreenmotorsPayload(m[1]);
    } catch(e) {
        return null;
    }
}

async function resolvePixelCloud(pixelUrl) {
    try {
        var resp = await safeFetch(pixelUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://greenmotors.cc/'
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
        if (finalUrl.indexOf('googleusercontent.com') >= 0) {
            return finalUrl;
        }
        var cType = (resp.headers && resp.headers.get('content-type')) || '';
        if (cType.toLowerCase().indexOf('text/html') >= 0) {
            var text = await resp.text();
            var m = text.match(/href=['"](https:\/\/video-downloads\.googleusercontent\.com\/[^'"]+)['"]/i) ||
                    text.match(/href=['"](https:\/\/[^'"]*googleusercontent\.com\/[^'"]+)['"]/i);
            if (m) return m[1];
        }
    } catch (e) {}
    return pixelUrl;
}


async function analyzeCloudStreamHealth(streamUrl) {
    if (!streamUrl) return false;
    try {
        // Probe cloud stream with Range header: bytes=0-0 to prevent downloading full video
        var probeRes = await safeFetch(streamUrl, {
            method: 'GET',
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Range': 'bytes=0-0'
            },
            redirect: 'follow'
        }, 3500);

        // 1. Detect HTTP 500, 502, 503, 504 server errors on cloud/worker hosts
        if (probeRes.status >= 500 && probeRes.status <= 599) {
            console.log('[4KHDHub Analyzer] Cloud host returned HTTP ' + probeRes.status + ' (' + streamUrl.substring(0, 50) + '...). Temporarily filtering out until revived.');
            return false;
        }

        // 2. Detect HTML landing pages masquerading as media streams (ad-gates / link generators)
        var cType = (probeRes.headers && (probeRes.headers.get('content-type') || probeRes.headers.get('Content-Type'))) || '';
        if (cType.toLowerCase().indexOf('text/html') >= 0 && probeRes.status === 200) {
            console.log('[4KHDHub Analyzer] Cloud host returned HTML page instead of video (' + streamUrl.substring(0, 50) + '...). Filtering out.');
            return false;
        }

        return true;
    } catch (e) {
        // Network timeout / drop: preserve source so transient flakes do not discard valid servers
        return true;
    }
}

async function resolveHubCloud(hubUrl) {
    try {
        var res = await safeFetch(hubUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': 'https://greenmotors.cc/'
            }
        });
        var text = await res.text();

        // Follow nested hubdrive redirects if needed
        if (hubUrl.indexOf('hubdrive.') >= 0) {
            var m = text.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (m) return resolveHubCloud(m[0]);
        }

        var gx = text.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        if (!gx) return [];

        var gRes = await safeFetch(gx[0], {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': hubUrl
            }
        });
        var gText = await gRes.text();

        var servers = [];
        var seenUrls = {};

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
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent']
                }
            });
            seenUrls[rawPxl] = true;
            seenUrls[pxlDirect] = true;
        }

        var asyncTasks = [];
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
                    headers: {
                        'User-Agent': DEFAULT_HEADERS['User-Agent']
                    }
                });
            } else if (label.indexOf('PixelServer') >= 0 || href.indexOf('pixeldrain') >= 0) {
                if (href.indexOf('negn6f') >= 0) continue;
                var directPixeldrain = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1')
                                           .replace('pixeldrain.dev', 'pixeldrain.com');
                servers.push({
                    serverName: 'Pixeldrain',
                    displayName: 'Pixeldrain Server',
                    url: directPixeldrain,
                    priority: 2,
                    headers: {
                        'User-Agent': DEFAULT_HEADERS['User-Agent']
                    }
                });
            } else if (label.indexOf('ZipDisk') >= 0 || href.indexOf('workers.dev') >= 0) {
                (function(zh) {
                    asyncTasks.push(analyzeCloudStreamHealth(zh).then(function(isHealthy) {
                        if (isHealthy) {
                            servers.push({
                                serverName: 'ZipDisk',
                                displayName: 'ZipDisk Server',
                                url: zh,
                                priority: 3,
                                headers: {
                                    'User-Agent': DEFAULT_HEADERS['User-Agent']
                                }
                            });
                        }
                    }).catch(function() {}));
                })(href);
            } else if (label.indexOf('10Gbps') >= 0 || href.indexOf('pixel.hubcloud.ist') >= 0 || href.indexOf('gpdl.hubcloud.ist') >= 0) {
                (function(h) {
                    asyncTasks.push(resolvePixelCloud(h).then(async function(directPixel) {
                        if (directPixel) {
                            var isHealthy = await analyzeCloudStreamHealth(directPixel);
                            if (isHealthy) {
                                servers.push({
                                    serverName: 'Pixel Cloud',
                                    displayName: 'Pixel Cloud (Google CDN)',
                                    url: directPixel,
                                    priority: 4,
                                    headers: {
                                        'User-Agent': DEFAULT_HEADERS['User-Agent']
                                    }
                                });
                            }
                        }
                    }).catch(function() {}));
                })(href);
            }
        }
        if (asyncTasks.length > 0) {
            await Promise.all(asyncTasks);
        }
        return servers;
    } catch(e) {
        return [];
    }
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var res = await fetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, {
                headers: DEFAULT_HEADERS
            });
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
        year: year ? String(year) : '2020',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
}


function stripReleaseMetadata(t) {
    return String(t || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^\)]*\)/g, ' ')
        .replace(/\b(?:480p|720p|1080p|2160p|4k|uhd|fhd|hd|sd|dual\s*audio|multi\s*audio|bluray|web-?dl|webrip|hdrip|esub|x264|x265|hevc|season\s*\d+|s\d+)\b[\s\S]*/i, '');
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreCandidateTitle(targetTitle, targetYear, candTitle, isMovie, sNum) {
    var targetClean = cleanTitle(targetTitle);
    var candClean = cleanTitle(candTitle);

    var stopWords = { 'the': 1, 'a': 1, 'an': 1, 'of': 1, 'and': 1, 'in': 1, 'to': 1, 'for': 1, 'on': 1, 'with': 1, 'at': 1, 'by': 1, 'from': 1 };
    var targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1 && !stopWords[w]; });
    if (targetWords.length === 0) {
        targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1; });
    }
    if (targetWords.length === 0) return 0;

    var matchedWords = 0;
    for (var w = 0; w < targetWords.length; w++) {
        if (candClean.indexOf(targetWords[w]) >= 0) matchedWords++;
    }
    var wordRatio = matchedWords / targetWords.length;
    if (wordRatio < 0.6) return -100;

    var score = matchedWords * 10;
    if (candClean.indexOf(targetClean) >= 0) score += 30;

    // Sequel / extra-installment detection
    var sequelRegex = /\b(2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|part\s*\d+|chapter\s*\d+)\b/i;
    var targetSequelMatch = targetClean.match(sequelRegex);
    var candSequelMatch = cleanTitle(stripReleaseMetadata(candTitle)).match(sequelRegex);
    var targetSequel = targetSequelMatch ? targetSequelMatch[0].replace(/\s+/g, '') : null;
    var candSequel = candSequelMatch ? candSequelMatch[0].replace(/\s+/g, '') : null;

    if (!targetSequel && candSequel) {
        score -= 80;
    } else if (targetSequel && !candSequel) {
        score -= 50;
    } else if (targetSequel && candSequel && targetSequel !== candSequel) {
        score -= 80;
    }

    // Year validation window (+/- 1 year tolerance)
    if (isMovie && targetYear) {
        var metaY = parseInt(targetYear, 10);
        var candYearMatches = candTitle.match(/\b(19\d\d|20\d\d)\b/g);
        if (candYearMatches && candYearMatches.length > 0) {
            var hasYearMatch = candYearMatches.some(function(yStr) {
                var y = parseInt(yStr, 10);
                return Math.abs(y - metaY) <= 1;
            });
            if (hasYearMatch) {
                score += 50;
            } else {
                score -= 80;
            }
        }
    }

    // Media type validation
    if (isMovie) {
        if (/season\s*\d+|complete\s*series|s\d{1,2}e\d{1,2}/i.test(candTitle)) {
            score -= 100;
        }
    } else {
        if (/\bmovie\b|\bfilm\b/i.test(candTitle)) {
            score -= 80;
        }
        var rangeMatch = candTitle.match(/season\s*0*(\d+)\s*(?:-|to|&#8211;)\s*0*(\d+)/i) ||
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

    return score;
}

async function search4khdHub(query, isMovie) {
    try {
        var url = BASE_URL + '/?s=' + encodeURIComponent(query);
        var res = await safeFetch(url, { headers: DEFAULT_HEADERS }, 7000);
        if (!res.ok) return [];
        var text = await res.text();

        var results = [];
        var cardRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*movie-card[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = cardRegex.exec(text)) !== null) {
            var href = m[1];
            var raw = m[2];
            var titleMatch = raw.match(/alt="([^"]+)"/i) || raw.match(/aria-label="([^"]+)"/i);
            var title = titleMatch ? titleMatch[1].replace(/ details$/i, '').trim() : '';
            var fullUrl = href.indexOf('http') === 0 ? href : (BASE_URL + (href.charAt(0) === '/' ? '' : '/') + href);
            var isMov = fullUrl.indexOf('-movie-') >= 0;
            results.push({
                url: fullUrl,
                title: title,
                type: isMov ? 'movie' : 'tv'
            });
        }

        // Fallback card regex if movie-card class isn't matched
        if (results.length === 0) {
            var fallbackRegex = /<a[^>]+href="([^"]*(?:-movie-|-series-)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            var fMatch;
            while ((fMatch = fallbackRegex.exec(text)) !== null) {
                var fHref = fMatch[1];
                var fTitleMatch = fMatch[2].match(/alt="([^"]+)"/i) || fMatch[2].match(/aria-label="([^"]+)"/i);
                var fTitle = fTitleMatch ? fTitleMatch[1].replace(/ details$/i, '').trim() : '';
                var fFullUrl = fHref.indexOf('http') === 0 ? fHref : (BASE_URL + (fHref.charAt(0) === '/' ? '' : '/') + fHref);
                results.push({
                    url: fFullUrl,
                    title: fTitle,
                    type: fFullUrl.indexOf('-movie-') >= 0 ? 'movie' : 'tv'
                });
            }
        }

        return results;
    } catch(e) {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var isMovie = mediaType === 'movie';
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;

    console.log('[4KHDHub] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[4KHDHub] Resolved metadata: "' + meta.title + '" (' + meta.year + '), Lang: ' + meta.originalLanguage);

    var epTag = !isMovie ?
        ('S' + (sNum < 10 ? '0' : '') + sNum + 'E' + (eNum < 10 ? '0' : '') + eNum) :
        '';

    // Search 4khdhub for the catalog entry
    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var searchResults = await search4khdHub(searchTitle, isMovie);
    console.log('[4KHDHub] Search found ' + searchResults.length + ' candidates');

    if (searchResults.length === 0) {
        return [];
    }

    var scoredResults = [];
    for (var sr = 0; sr < searchResults.length; sr++) {
        var cand = searchResults[sr];
        var sc = scoreCandidateTitle(meta.title, meta.year, cand.title, isMovie, sNum);
        if (sc > 0 && cand.type === (isMovie ? 'movie' : 'tv')) sc += 10;
        if (sc >= 50) {
            scoredResults.push({ cand: cand, score: sc });
        }
    }
    scoredResults.sort(function(a, b) { return b.score - a.score; });
    var matching = scoredResults.length > 0 && scoredResults[0].score >= 50 ? scoredResults[0].cand : null;
    if (!matching) {
        console.log('[4KHDHub] No candidate passed score threshold for: ' + meta.title);
        return [];
    }
    console.log('[4KHDHub] Selected detail page (score ' + scoredResults[0].score + '): ' + matching.url);

    var pageRes = await safeFetch(matching.url, { headers: DEFAULT_HEADERS }, 8000);
    if (!pageRes.ok) return [];
    var html = await pageRes.text();

    var releases = [];
    var epRegex = new RegExp('(?:S0*' + sNum + '\\s*E0*' + eNum + '|Episode[-_\\s]*0*' + eNum + ')\\b', 'i');

    if (!isMovie) {
        // TV Series: parse individual episode blocks
        var epSectionIdx = html.indexOf('id="episodes"');
        var searchArea = epSectionIdx !== -1 ? html.slice(epSectionIdx) : html;
        var blocks = searchArea.split('<div class="episode-download-item">');

        for (var i = 1; i < blocks.length; i++) {
            var block = blocks[i];
            var titleMatch = block.match(/<div class="episode-file-title">([\s\S]*?)<\/div>/i);
            var linkMatch = block.match(/href="(https:\/\/greenmotors\.[^"]+)"/i);
            var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            var link = linkMatch ? linkMatch[1] : '';

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
        var mBlocks = html.split(/<div id="content-file\d+"/i);
        for (var j = 1; j < mBlocks.length; j++) {
            var mBlock = mBlocks[j];
            var mTitleMatch = mBlock.match(/<div class="file-title">([\s\S]*?)<\/div>/i);
            var mLinkMatch = mBlock.match(/href="(https:\/\/greenmotors\.[^"]+)"/i);
            var mTitle = mTitleMatch ? mTitleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            var mLink = mLinkMatch ? mLinkMatch[1] : '';

            if (mLink) {
                releases.push({
                    rawTitle: mTitle,
                    quality: parseQualityFromText(mTitle),
                    audio: parseAudiosFromText(mTitle),
                    link: mLink
                });
            }
        }
    }

    console.log('[4KHDHub] Found ' + releases.length + ' matching release(s) on page');
    if (releases.length === 0) return [];

    // Process up to 8 releases to cover all quality tiers and mirror hosts
    var selectedReleases = releases.slice(0, 8);

    // Concurrently unpack greenmotors -> HubCloud -> direct servers
    var tasks = selectedReleases.map(async function(rel) {
        var hubUrl = await resolveGreenmotorsUrl(rel.link);
        if (!hubUrl) return [];
        var servers = await resolveHubCloud(hubUrl);
        return servers.map(function(srv) {
            return {
                release: rel,
                server: srv
            };
        });
    });

    var settled = await Promise.all(tasks);
    var flattened = Array.prototype.concat.apply([], settled);

    var streams = [];
    var seenStreamKeys = {};

    for (var k = 0; k < flattened.length; k++) {
        var item = flattened[k];
        var rel = item.release;
        var srv = item.server;
        var audio = rel.audio;
        var quality = rel.quality;

        var dedupeKey = srv.url + '|' + quality;
        if (seenStreamKeys[dedupeKey]) continue;
        seenStreamKeys[dedupeKey] = true;

        var streamTitle;
        var displayName;

        if (!isMovie) {
            // MatchScorer format for Series / Anime (+0.25 episode bonus)
            streamTitle = meta.title + ' ' + epTag + ' ' + audio.badge + ' - 4KHDHub ' + srv.serverName + ' [' + quality + ']';
            displayName = '4KHDHub | ' + srv.displayName + ' • ' + audio.badge + ' (' + quality + ')';
        } else {
            // MatchScorer clean format for Movies
            streamTitle = meta.title + ' (' + meta.year + ') ' + audio.badge + ' - 4KHDHub ' + srv.serverName + ' [' + quality + ']';
            displayName = '4KHDHub | ' + srv.displayName + ' • ' + audio.badge + ' (' + quality + ')';
        }

        var sizeMatch = rel.rawTitle.match(/\[\s*([0-9.]+\s*[MG]B)\s*\]/i) ||
                        rel.rawTitle.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
        var parsedSize = sizeMatch ? sizeMatch[1].trim() : (isMovie ? '2.5 GB' : '950 MB');

        var isHls = srv.url.indexOf('.m3u8') >= 0;
        var isMkv = srv.url.indexOf('.mkv') >= 0;
        var streamFormat = isHls ? 'm3u8' : (isMkv ? 'mkv' : 'mp4');

        streams.push({
            name: displayName,
            title: streamTitle,
            rawTitle: rel.rawTitle || matching.title,
            url: srv.url,
            quality: quality,
            size: parsedSize,
            priority: srv.priority || 99,
            type: streamFormat === 'mkv' ? 'mp4' : streamFormat,
            format: streamFormat,
            container: streamFormat,
            isSequential: streamFormat === 'mp4' || streamFormat === 'mkv',
            provider: '4khdhub',
            language: audio.tag.toLowerCase(),
            headers: srv.headers || {
                'User-Agent': DEFAULT_HEADERS['User-Agent']
            }
        });
    }

    streams.sort(function(a, b) {
        var prioA = a.priority || 99;
        var prioB = b.priority || 99;
        if (prioA !== prioB) return prioA - prioB;
        var qWeight = { '4K 2160p': 4, '1080p': 3, '720p': 2, '480p': 1 };
        return (qWeight[b.quality] || 0) - (qWeight[a.quality] || 0);
    });

    console.log('[4KHDHub] Discovered ' + streams.length + ' direct stream(s)');
    return streams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams: getStreams,
        resolveMetadata: resolveMetadata
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
    globalThis.resolveMetadata = resolveMetadata;
}
