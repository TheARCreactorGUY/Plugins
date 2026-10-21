/**
 * UHDMovies Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for UHDMovies (https://uhdmovies.us.org/)
 * Supports 4K UHD 2160p HDR, 1080p 10-Bit HEVC, and 720p Dual/Multi Audio.
 *
 * Features:
 *  - Native 4-step LinkPilot Decryptor gateway bypass (thenaukriadda.in).
 *  - High-speed direct streaming via Google Cloud CDN (video-downloads.googleusercontent.com).
 *  - Multi-season and arbitrary episode targeting for TV Series and Web Series.
 *  - Full compatibility with Android QuickJS runtime (no Node Buffer, pure fetch).
 *  - Formatted strictly for MatchScorer.kt (+0.25 SxxExx episode bonus for TV, clean (Year) for movies).
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://uhdmovies.us.org';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

var QUALITY_WEIGHTS = {
    '2160p': 4,
    '1080p': 3,
    '720p': 2,
    '480p': 1
};

/**
 * QuickJS-safe fetch with timeout.
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

function parseQuality(text) {
    var lower = String(text || '').toLowerCase();
    if (lower.indexOf('2160p') !== -1 || lower.indexOf('4k') !== -1 || lower.indexOf('uhd') !== -1) return '2160p';
    if (lower.indexOf('1080p') !== -1 || lower.indexOf('fhd') !== -1) return '1080p';
    if (lower.indexOf('720p') !== -1 || lower.indexOf('hd') !== -1) return '720p';
    if (lower.indexOf('480p') !== -1 || lower.indexOf('sd') !== -1) return '480p';
    return '1080p';
}

function parseAudio(text) {
    var upper = String(text || '').toUpperCase();
    var isMulti = upper.indexOf('MULTI') !== -1 || upper.indexOf('DUAL') !== -1 ||
                 (upper.indexOf('HINDI') !== -1 && upper.indexOf('ENGLISH') !== -1);
    var langs = [];
    if (upper.indexOf('HINDI') !== -1 || upper.indexOf('HIN') !== -1) langs.push('HIN');
    if (upper.indexOf('ENGLISH') !== -1 || upper.indexOf('ENG') !== -1) langs.push('ENG');
    if (upper.indexOf('TAMIL') !== -1 || upper.indexOf('TAM') !== -1) langs.push('TAM');
    if (upper.indexOf('TELUGU') !== -1 || upper.indexOf('TEL') !== -1) langs.push('TEL');

    var distinct = [];
    for (var i = 0; i < langs.length; i++) {
        if (distinct.indexOf(langs[i]) === -1) distinct.push(langs[i]);
    }

    if (isMulti || distinct.length > 1) {
        return distinct.length > 0 ? '[MULTI] [' + distinct.join(' · ') + ']' : '[MULTI]';
    }
    if (distinct.length === 1) {
        return '[' + distinct[0] + ']';
    }
    return '[ENG]';
}

/**
 * Resolve TMDB metadata if not provided in extraArgs.
 */
async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    if (extraArgs && extraArgs.title) {
        return {
            title: extraArgs.title,
            year: extraArgs.year || extraArgs.releaseYear || ''
        };
    }

    try {
        var endpoint = TMDB_PROXY_URL + '/' + (mediaType === 'movie' ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=tmdb';
        var resp = await safeFetch(endpoint, {
            headers: { 'Accept': 'application/json' }
        }, 5000);
        if (resp.ok) {
            var data = await resp.json();
            if (data) {
                var title = data.title || data.name || data.original_title || '';
                var releaseDate = data.release_date || data.first_air_date || '';
                var year = releaseDate ? releaseDate.split('-')[0] : '';
                return { title: title, year: year };
            }
        }
    } catch (e) {
        console.error('[UHDMovies] TMDB metadata lookup failed:', e.message);
    }

    return { title: '', year: '' };
}

/**
 * Calculate similarity score between TMDB target and UHDMovies post title.
 */
function calculatePostScore(targetTitle, targetYear, itemTitle, isMovie) {
    var cleanTarget = cleanTitle(targetTitle);
    var cleanItem = cleanTitle(itemTitle);
    var targetWords = cleanTarget.split(' ').filter(Boolean);
    var itemWords = cleanItem.split(' ');

    var matches = 0;
    for (var i = 0; i < targetWords.length; i++) {
        if (itemWords.indexOf(targetWords[i]) !== -1) matches++;
    }
    var score = matches / Math.max(targetWords.length, 1);

    if (targetYear && itemTitle.indexOf(String(targetYear)) !== -1) {
        score += 0.3;
    }

    if (isMovie && /\b(season|s0|s1|complete|episodes)\b/i.test(itemTitle)) {
        score -= 0.5;
    }

    return score;
}

/**
 * Search UHDMovies for matching post URL.
 */
async function searchPost(title, year, isMovie) {
    try {
        var query = encodeURIComponent(title);
        var url = BASE_URL + '/?s=' + query;
        var resp = await safeFetch(url, { headers: DEFAULT_HEADERS }, 8000);
        var html = await resp.text();

        var linkRegex = /<a[^>]+href=["'](https:\/\/uhdmovies\.[^"']+\/download-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var items = [];
        var seen = {};

        var m;
        while ((m = linkRegex.exec(html)) !== null) {
            var postUrl = m[1];
            if (seen[postUrl]) continue;
            seen[postUrl] = true;

            var slug = postUrl.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '').replace(/^download-/, '');
            var titleFromSlug = slug.replace(/-/g, ' ');
            var text = m[2].replace(/<[^>]+>/g, '').trim();
            var displayTitle = text.length > 5 ? text : titleFromSlug;

            var score = calculatePostScore(title, year, displayTitle, isMovie);
            items.push({ url: postUrl, title: displayTitle, score: score });
        }

        items.sort(function(a, b) { return b.score - a.score; });
        return items.length > 0 ? items[0] : null;
    } catch (e) {
        console.error('[UHDMovies] Search failed:', e.message);
        return null;
    }
}

/**
 * Resolve intermediate LinkPilot Decryptor gateway (thenaukriadda.in) to DriveSeed URL.
 */
async function resolveNaukriAdda(sidUrl) {
    // Step 1: GET sid URL
    var resp1 = await safeFetch(sidUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': BASE_URL + '/'
        }
    }, 7000);
    var html1 = await resp1.text();
    var finalUrl1 = resp1.url || sidUrl;

    var form1ActionMatch = html1.match(/<form[^>]*action=['"]([^'"]*)['"]/i);
    if (!form1ActionMatch) throw new Error('Form 1 action not found');
    var form1Action = form1ActionMatch[1];

    var inputRegex = /<input[^>]*name=['"]([^'"]*)['"][^>]*value=['"]([^'"]*)['"]/gi;
    var form1Params = [];
    var im;
    while ((im = inputRegex.exec(html1)) !== null) {
        form1Params.push(encodeURIComponent(im[1]) + '=' + encodeURIComponent(im[2]));
    }

    // Step 2: POST Form 1
    var resp2 = await safeFetch(form1Action, {
        method: 'POST',
        headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': finalUrl1
        },
        body: form1Params.join('&')
    }, 7000);
    var html2 = await resp2.text();
    var finalUrl2 = resp2.url || form1Action;

    var form2ActionMatch = html2.match(/<form[^>]*action=['"]([^'"]*)['"]/i);
    if (!form2ActionMatch) throw new Error('Form 2 action not found');
    var form2Action = form2ActionMatch[1];

    var form2Params = [];
    inputRegex.lastIndex = 0;
    while ((im = inputRegex.exec(html2)) !== null) {
        form2Params.push(encodeURIComponent(im[1]) + '=' + encodeURIComponent(im[2]));
    }

    // Step 3: POST Form 2
    var resp3 = await safeFetch(form2Action, {
        method: 'POST',
        headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': finalUrl2
        },
        body: form2Params.join('&')
    }, 7000);
    var html3 = await resp3.text();
    var finalUrl3 = resp3.url || form2Action;

    var scMatch = html3.match(/sc\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
    if (!scMatch) throw new Error('sc() cookie call not found in step 3');
    var cookieName = scMatch[1];
    var cookieVal = scMatch[2].replace(/\\\//g, '/');

    var goMatch = html3.match(/bg\.setAttribute\(\s*['"]href['"]\s*,\s*['"]([^'"]+)['"]/i) ||
                  html3.match(/['"](https?:\\\/\\\/[^'"]+thenaukriadda[^'"]+\?lp_go=[^'"]+)['"]/i) ||
                  html3.match(/['"](https?:\/\/[^'"]+thenaukriadda[^'"]+\?lp_go=[^'"]+)['"]/i);
    if (!goMatch) throw new Error('Go URL not found in step 3');
    var goUrl = goMatch[1].replace(/\\\//g, '/');

    // Step 4: GET Go URL with Cookie
    var resp4 = await safeFetch(goUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': finalUrl3,
            'Cookie': cookieName + '=' + cookieVal
        }
    }, 7000);
    var html4 = await resp4.text();

    var destMatch = html4.match(/window\.location\.replace\(\s*['"]([^'"]+)['"]\s*\)/i) ||
                    html4.match(/['"](https?:\/\/[^'"]*driveseed\.org\/r\?[^'"]+)['"]/i);
    if (!destMatch) throw new Error('DriveSeed redirect not found in step 4');

    return destMatch[1].replace(/\\\//g, '/');
}

/**
 * Resolve DriveSeed page to direct Google Cloud CDN stream URL.
 */
async function resolveDriveSeed(driveSeedRUrl) {
    // Step 5: GET driveseed.org/r?...
    var resp5 = await safeFetch(driveSeedRUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://en.thenaukriadda.in/'
        }
    }, 7000);
    var html5 = await resp5.text();

    var fileRedirectMatch = html5.match(/window\.location\.replace\(\s*['"](\/file\/[^'"]+)['"]\s*\)/i) ||
                           html5.match(/['"](\/file\/[a-zA-Z0-9_-]+)['"]/i);
    var fileUrl = '';
    if (fileRedirectMatch) {
        fileUrl = 'https://driveseed.org' + fileRedirectMatch[1];
    } else if (resp5.url && resp5.url.indexOf('/file/') !== -1) {
        fileUrl = resp5.url;
    } else {
        throw new Error('DriveSeed /file/ URL not found');
    }

    // Step 6: Fetch file page and extract Instant Download link
    var resp6 = await safeFetch(fileUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': driveSeedRUrl
        }
    }, 7000);
    var html6 = await resp6.text();

    var instantMatch = html6.match(/href=['"](https:\/\/[^'"]*cdn\.video-gen\.xyz\/[^'"]+)['"]/i) ||
                      html6.match(/href=['"](https:\/\/[^'"]*video-gen[^'"]+)['"]/i);
    if (!instantMatch) throw new Error('Instant Download link not found on DriveSeed file page');
    var instantUrl = instantMatch[1];

    // Step 7: Request Instant Download URL (redirects to video-seed.dev/?url=...)
    var resp7 = await safeFetch(instantUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': fileUrl
        }
    }, 8000);
    var finalUrl7 = resp7.url || '';

    var streamUrl = null;
    if (finalUrl7.indexOf('?url=') !== -1) {
        streamUrl = decodeURIComponent(finalUrl7.split('?url=')[1]);
    } else if (finalUrl7.indexOf('video-downloads.googleusercontent.com') !== -1) {
        streamUrl = finalUrl7;
    } else {
        var html7 = await resp7.text();
        var urlParamMatch = html7.match(/['"](https:\/\/video-downloads\.googleusercontent\.com\/[^'"]+)['"]/i);
        if (urlParamMatch) {
            streamUrl = urlParamMatch[1];
        }
    }

    if (!streamUrl) throw new Error('Google CDN stream URL not extracted');
    return streamUrl;
}

/**
 * Extract movie download candidate links from post HTML.
 */
function extractMovieLinks(html, postTitle) {
    var candidates = [];
    var linkRegex = /<a[^>]+href=["'](https:\/\/[^"']*thenaukriadda[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;

    while ((m = linkRegex.exec(html)) !== null) {
        var linkUrl = m[1];
        var linkText = m[2].replace(/<[^>]+>/g, '').trim();
        var lowerText = linkText.toLowerCase();

        if (lowerText.indexOf('g-drive') === -1 && lowerText.indexOf('download') === -1) continue;

        var idx = m.index;
        var start = Math.max(0, idx - 400);
        var context = html.slice(start, idx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        var combined = context + ' ' + postTitle;
        var quality = parseQuality(context);
        var audio = parseAudio(combined);

        candidates.push({
            url: linkUrl,
            quality: quality,
            audio: audio
        });
    }

    var byQuality = {};
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!byQuality[c.quality]) {
            byQuality[c.quality] = c;
        }
    }

    var results = [];
    for (var q in byQuality) {
        results.push(byQuality[q]);
    }
    return results;
}

/**
 * Extract TV episode download candidate links from post HTML.
 */
function extractTvLinks(fullHtml, seasonNum, episodeNum, postTitle) {
    var entryContentMatch = fullHtml.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!-- \.entry-content -->/i) ||
                          fullHtml.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*)/i) ||
                          fullHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

    var contentHtml = entryContentMatch ? entryContentMatch[1] : fullHtml;

    var seasonRegex = /(?:<h[1-6][^>]*>|<p[^>]*>|\b)(?:Season\s*(?:0?(\d+))|\((?:Season\s*(?:0?(\d+)))\))/gi;
    var seasonPositions = [];
    var match;
    while ((match = seasonRegex.exec(contentHtml)) !== null) {
        var s = parseInt(match[1] || match[2], 10);
        seasonPositions.push({ season: s, index: match.index });
    }

    var targetSlice = contentHtml;
    if (seasonPositions.length > 0) {
        var targetStarts = seasonPositions.filter(function(p) { return p.season === seasonNum; });
        if (targetStarts.length > 0) {
            var startIdx = targetStarts[0].index;
            var nextSeasonPos = seasonPositions.find(function(p) { return p.season > seasonNum && p.index > startIdx; });
            var endIdx = nextSeasonPos ? nextSeasonPos.index : contentHtml.length;
            targetSlice = contentHtml.slice(startIdx, endIdx);
        }
    }

    var targetEpStr = 'Episode ' + episodeNum;
    var targetEpAlt = 'Episode 0' + episodeNum;

    var linkRegex = /<a[^>]+href=["'](https:\/\/[^"']*thenaukriadda[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var candidates = [];
    var m;

    while ((m = linkRegex.exec(targetSlice)) !== null) {
        var linkUrl = m[1];
        var linkText = m[2].replace(/<[^>]+>/g, '').trim();
        var lowerLink = linkText.toLowerCase();

        if (lowerLink === targetEpStr.toLowerCase() ||
            lowerLink === targetEpAlt.toLowerCase() ||
            lowerLink === 'e' + episodeNum ||
            lowerLink === 'e0' + episodeNum) {

            var idx = m.index;
            var start = Math.max(0, idx - 400);
            var context = targetSlice.slice(start, idx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

            var combined = context + ' ' + postTitle;
            var quality = parseQuality(context);
            var audio = parseAudio(combined);

            candidates.push({
                url: linkUrl,
                quality: quality,
                audio: audio
            });
        }
    }

    var byQuality = {};
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!byQuality[c.quality]) {
            byQuality[c.quality] = c;
        }
    }

    var results = [];
    for (var q in byQuality) {
        results.push(byQuality[q]);
    }
    return results;
}

/**
 * Main plugin entrypoint invoked by Euthopiar / Universal Streaming Architecture.
 */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    try {
        var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
        extraArgs = Object.assign({}, callArgs, extraArgs || {});

        var isMovie = mediaType === 'movie';
        var sNum = Number(season) || 1;
        var eNum = Number(episode) || 1;

        console.log('[UHDMovies] Requesting ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
            (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

        var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
        if (!meta.title) {
            console.error('[UHDMovies] No title resolved for TMDB ID: ' + tmdbId);
            return [];
        }

        console.log('[UHDMovies] Searching for: "' + meta.title + '" (' + meta.year + ')');
        var post = await searchPost(meta.title, meta.year, isMovie);
        if (!post) {
            console.log('[UHDMovies] No matching post found on site');
            return [];
        }

        console.log('[UHDMovies] Found post: ' + post.url);
        var postResp = await safeFetch(post.url, { headers: DEFAULT_HEADERS }, 8000);
        var postHtml = await postResp.text();

        var candidates = isMovie ?
            extractMovieLinks(postHtml, post.title) :
            extractTvLinks(postHtml, sNum, eNum, post.title);

        if (candidates.length === 0) {
            console.log('[UHDMovies] No candidate links found in post');
            return [];
        }

        console.log('[UHDMovies] Found ' + candidates.length + ' quality candidates. Resolving streams...');

        // Resolve candidates concurrently
        var streamPromises = candidates.map(async function(c) {
            try {
                var driveSeedRUrl = await resolveNaukriAdda(c.url);
                var streamUrl = await resolveDriveSeed(driveSeedRUrl);
                if (!streamUrl) return null;

                // Build title strictly formatted for MatchScorer.kt
                var streamTitle = isMovie ?
                    meta.title + (meta.year ? ' (' + meta.year + ')' : '') + ' ' + c.quality + ' ' + c.audio + ' [UHDMovies]' :
                    meta.title + ' S' + pad(sNum, 2) + 'E' + pad(eNum, 2) + ' ' + c.quality + ' ' + c.audio + ' [UHDMovies]';

                return {
                    name: 'UHDMovies - Google Cloud CDN',
                    title: streamTitle,
                    url: streamUrl,
                    quality: c.quality,
                    format: 'mp4',
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Referer': 'https://video-seed.dev/'
                    }
                };
            } catch (err) {
                console.error('[UHDMovies] Candidate (' + c.quality + ') resolution failed:', err.message);
                return null;
            }
        });

        var settled = await Promise.all(streamPromises);
        var streams = settled.filter(Boolean);

        // Sort qualities: 2160p > 1080p > 720p > 480p
        streams.sort(function(a, b) {
            var wa = QUALITY_WEIGHTS[a.quality] || 0;
            var wb = QUALITY_WEIGHTS[b.quality] || 0;
            return wb - wa;
        });

        console.log('[UHDMovies] Successfully resolved ' + streams.length + ' direct stream(s)');
        return streams;
    } catch (e) {
        console.error('[UHDMovies] Unhandled error:', e.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams: getStreams
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
