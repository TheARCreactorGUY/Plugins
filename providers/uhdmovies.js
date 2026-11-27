/**
 * UHDMovies Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for 4K UHD 2160p HDR, 1080p 10-bit HEVC, and 720p Dual/Multi Audio
 * via Google Cloud CDN with parallel gateway traversal, rich technical metadata,
 * and external VTT subtitle linking.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://uhdmovies.ceo';
var BACKUP_URLS = [
    'https://uhdmovies.ceo',
    'https://uhdmovies.beauty',
    'https://uhdmovies.us.org'
];
var NAUKRI_REFERER = 'https://en.thenaukriadda.in/';
var DRIVESEED_BASE = 'https://driveseed.org';
var SUB_VDRK_URL = 'https://sub.vdrk.site/v2';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

var QUALITY_WEIGHTS = {
    '4K 2160p': 4,
    '2160p': 4,
    '1080p': 3,
    '720p': 2,
    '480p': 1
};

function safeFetch(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 3500;
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

function stripReleaseMetadata(t) {
    return String(t || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^\)]*\)/g, ' ')
        .replace(/\b(?:480p|720p|1080p|2160p|4k|uhd|fhd|hd|sd|dual\s*audio|multi\s*audio|bluray|web-?dl|webrip|hdrip|esub|x264|x265|hevc|season\s*\d+|s\d+)\b[\s\S]*/i, '');
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseQuality(text) {
    var raw = String(text || '').toLowerCase();
    var lower = raw.replace(/\bds4k\b/g, '').replace(/4k\s*remaster(?:ed)?/g, '');
    if (lower.indexOf('2160p') !== -1) return '4K 2160p';
    if (lower.indexOf('1080p') !== -1 || /\bfhd\b/.test(lower)) return '1080p';
    if (lower.indexOf('720p') !== -1 || /\bhd\b(?!\s*r\b)/.test(lower.replace(/\bhdr(?:10(?:\+)?)?\b/g, ''))) return '720p';
    if (lower.indexOf('480p') !== -1 || /\bsd\b/.test(lower)) return '480p';
    if (/\b(?:4k|uhd)\b/.test(lower)) return '4K 2160p';
    return '1080p';
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
        return { isMulti: true, primary: 'Multi', tag: 'MULTI', badge: distinct.length > 0 ? '[MULTI] [' + distinct.join(' · ') + ']' : '[MULTI]' };
    }
    if (distinct.length === 1) {
        var tag = distinct[0];
        return { isMulti: false, primary: tag === 'HIN' ? 'Hindi' : (tag === 'ENG' ? 'English' : tag), tag: tag, badge: '[' + tag + ']' };
    }
    return { isMulti: false, primary: 'English', tag: 'ENG', badge: '[ENG]' };
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    if (extraArgs && extraArgs.title) {
        return { title: extraArgs.title, year: extraArgs.year || extraArgs.releaseYear || '' };
    }
    try {
        var endpoint = TMDB_PROXY_URL + '/' + (mediaType === 'movie' ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=tmdb';
        var resp = await safeFetch(endpoint, { headers: { 'Accept': 'application/json' } }, 2500);
        if (resp.ok) {
            var data = await resp.json();
            if (data) {
                var title = data.title || data.name || data.original_title || '';
                var releaseDate = data.release_date || data.first_air_date || '';
                var year = releaseDate ? releaseDate.split('-')[0] : '';
                return { title: title, year: year };
            }
        }
    } catch (e) {}
    return { title: '', year: '' };
}

function calculatePostScore(targetTitle, targetYear, itemTitle, isMovie) {
    var cleanTarget = cleanTitle(targetTitle);
    var cleanItem = cleanTitle(itemTitle);
    var targetWords = cleanTarget.split(' ').filter(function(w) { return w.length > 1; });
    if (targetWords.length === 0) return 0;

    var matches = 0;
    for (var i = 0; i < targetWords.length; i++) {
        if (cleanItem.indexOf(targetWords[i]) !== -1) matches++;
    }
    if (matches / targetWords.length < 0.6) return -100;

    var score = matches * 10;
    if (cleanItem.indexOf(cleanTarget) >= 0) score += 30;

    var sequelRegex = /\b(2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|part\s*\d+|chapter\s*\d+)\b/i;
    var targetSequelMatch = cleanTarget.match(sequelRegex);
    var candSequelMatch = cleanTitle(stripReleaseMetadata(itemTitle)).match(sequelRegex);
    var targetSequel = targetSequelMatch ? targetSequelMatch[0].replace(/\s+/g, '') : null;
    var candSequel = candSequelMatch ? candSequelMatch[0].replace(/\s+/g, '') : null;

    if (!targetSequel && candSequel) score -= 80;
    else if (targetSequel && !candSequel) score -= 50;
    else if (targetSequel && candSequel && targetSequel !== candSequel) score -= 80;

    if (isMovie && targetYear) {
        var metaY = parseInt(targetYear, 10);
        var candYearMatches = itemTitle.match(/\b(19\d\d|20\d\d)\b/g);
        if (candYearMatches && candYearMatches.length > 0) {
            var hasYearMatch = candYearMatches.some(function(yStr) { return Math.abs(parseInt(yStr, 10) - metaY) <= 1; });
            score += hasYearMatch ? 50 : -80;
        }
        if (/season\s*\d+|complete\s*series|s\d{1,2}e\d{1,2}/i.test(itemTitle)) score -= 100;
    } else if (!isMovie) {
        if (/\bmovie\b|\bfilm\b/i.test(itemTitle)) score -= 80;
    }

    var spinoffRegex = /\b(?:the\s+challenge|in\s+conversation|making\s+of|behind\s+the\s+scenes|trailer|recap|explained|special)\b/i;
    if (spinoffRegex.test(itemTitle) && !spinoffRegex.test(targetTitle || '')) score -= 120;

    return score;
}

async function searchPost(title, year, isMovie) {
    var bases = BACKUP_URLS;
    for (var bi = 0; bi < bases.length; bi++) {
        try {
            var url = bases[bi] + '/?s=' + encodeURIComponent(title);
            var resp = await safeFetch(url, { headers: { 'User-Agent': USER_AGENT, 'Referer': bases[bi] + '/' } }, 3200);
            if (!resp.ok) continue;
            var html = await resp.text();
            if (!html || html.indexOf('Just a moment...') >= 0) continue;

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
                items.push({ url: postUrl, title: displayTitle, score: calculatePostScore(title, year, displayTitle, isMovie) });
            }
            items.sort(function(a, b) { return b.score - a.score; });
            if (items.length > 0 && items[0].score >= 40) return items[0];
        } catch (e) {}
    }
    return null;
}

async function resolveNaukriAdda(sidUrl) {
    var resp1 = await safeFetch(sidUrl, { headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/' } }, 4200);
    var html1 = await resp1.text();
    if (/cf-turnstile|challenges\.cloudflare\.com/i.test(html1)) throw new Error('CAPTCHA gated');
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

    var resp2 = await safeFetch(form1Action, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': finalUrl1 },
        body: form1Params.join('&')
    }, 4200);
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

    var resp3 = await safeFetch(form2Action, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': finalUrl2 },
        body: form2Params.join('&')
    }, 4200);
    var html3 = await resp3.text();
    var finalUrl3 = resp3.url || form2Action;

    var scMatch = html3.match(/sc\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
    if (!scMatch) throw new Error('sc() cookie call not found');
    var cookieName = scMatch[1];
    var cookieVal = scMatch[2].replace(/\\\//g, '/');

    var goMatch = html3.match(/bg\.setAttribute\(\s*['"]href['"]\s*,\s*['"]([^'"]+)['"]/i) ||
                  html3.match(/['"](https?:\\\/\\\/[^'"]+thenaukriadda[^'"]+\?lp_go=[^'"]+)['"]/i) ||
                  html3.match(/['"](https?:\/\/[^'"]+thenaukriadda[^'"]+\?lp_go=[^'"]+)['"]/i);
    if (!goMatch) throw new Error('Go URL not found');
    var goUrl = goMatch[1].replace(/\\\//g, '/');

    var resp4 = await safeFetch(goUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Referer': finalUrl3, 'Cookie': cookieName + '=' + cookieVal }
    }, 4200);
    var html4 = await resp4.text();

    var destMatch = html4.match(/window\.location\.replace\(\s*['"]([^'"]+)['"]\s*\)/i) ||
                    html4.match(/['"](https?:\/\/[^'"]*driveseed\.[^'"]+\/r\?[^'"]+)['"]/i);
    if (!destMatch) throw new Error('DriveSeed redirect not found');

    return destMatch[1].replace(/\\\//g, '/');
}

async function analyzeCloudStreamHealth(streamUrl) {
    if (!streamUrl || typeof streamUrl !== 'string' || !/^https?:\/\//i.test(streamUrl)) return false;
    try {
        var probeRes = await safeFetch(streamUrl, {
            method: 'GET',
            headers: { 'User-Agent': USER_AGENT, 'Range': 'bytes=0-0' },
            redirect: 'follow'
        }, 2200);

        if (probeRes.status < 200 || probeRes.status >= 400) {
            return false;
        }
        var cType = (probeRes.headers && (probeRes.headers.get('content-type') || probeRes.headers.get('Content-Type'))) || '';
        var lowerCt = cType.toLowerCase();
        if ((lowerCt.indexOf('text/') >= 0 || lowerCt.indexOf('application/json') >= 0) &&
            (probeRes.status === 200 || probeRes.status === 206)) {
            return false;
        }
        return true;
    } catch (_) {
        return false;
    }
}

async function resolveDriveSeed(driveSeedRUrl) {
    var resp5 = await safeFetch(driveSeedRUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Referer': NAUKRI_REFERER },
        redirect: 'manual'
    }, 3500);
    var loc5 = resp5.headers && (resp5.headers.get('location') || resp5.headers.get('Location'));
    var fileUrl = '';
    if (loc5 && loc5.indexOf('/file/') !== -1) {
        fileUrl = loc5.startsWith('http') ? loc5 : (DRIVESEED_BASE + loc5);
    } else {
        var html5 = await resp5.text();
        var fileRedirectMatch = html5.match(/window\.location\.replace\(\s*['"](\/file\/[^'"]+)['"]\s*\)/i) ||
                               html5.match(/href=['"]([^'"]*\/file\/[^'"]+)['"]/i) ||
                               html5.match(/['"](\/file\/[a-zA-Z0-9_-]+)['"]/i);
        if (fileRedirectMatch) {
            fileUrl = fileRedirectMatch[1].startsWith('http') ? fileRedirectMatch[1] : (DRIVESEED_BASE + fileRedirectMatch[1]);
        } else if (resp5.url && resp5.url.indexOf('/file/') !== -1) {
            fileUrl = resp5.url;
        }
    }
    if (!fileUrl) throw new Error('DriveSeed /file/ URL not found');

    var resp6 = await safeFetch(fileUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Referer': driveSeedRUrl }
    }, 3500);
    var html6 = await resp6.text();

    var instantMatch = html6.match(/href=['"](https:\/\/[^'"]*cdn\.video-gen\.xyz\/[^'"]+)['"]/i) ||
                      html6.match(/href=['"](https:\/\/[^'"]*video-gen[^'"]+)['"]/i) ||
                      html6.match(/href=['"](https:\/\/[^'"]*cdn\.video-[^'"]+)['"]/i) ||
                      html6.match(/href=['"](https:\/\/[^'"]*googleusercontent\.com\/[^'"]+)['"]/i);
    if (!instantMatch) throw new Error('Instant Download link not found');
    var instantUrl = instantMatch[1];

    if (instantUrl.indexOf('googleusercontent.com') !== -1) {
        if (await analyzeCloudStreamHealth(instantUrl)) return instantUrl;
    }

    var resp7 = await safeFetch(instantUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Referer': fileUrl },
        redirect: 'manual'
    }, 3500);
    var loc7 = resp7.headers && (resp7.headers.get('location') || resp7.headers.get('Location'));
    var finalUrl7 = loc7 || resp7.url || '';

    var streamUrl = null;
    if (finalUrl7.indexOf('?url=') !== -1) {
        var candidateUrl = decodeURIComponent(finalUrl7.split('?url=')[1].split('&')[0]);
        if (/^https?:\/\//i.test(candidateUrl)) streamUrl = candidateUrl;
    }
    if (!streamUrl && finalUrl7.indexOf('googleusercontent.com') !== -1 && /^https?:\/\//i.test(finalUrl7)) {
        streamUrl = finalUrl7;
    }
    if (!streamUrl) {
        var html7 = await resp7.text();
        var urlParamMatch = html7.match(/['"](https:\/\/[^'"]*googleusercontent\.com\/[^'"]+)['"]/i) ||
                            html7.match(/href=['"](https:\/\/[^'"]*googleusercontent\.com\/[^'"]+)['"]/i);
        if (urlParamMatch) streamUrl = urlParamMatch[1];
        else if (finalUrl7 !== instantUrl && /^https?:\/\//i.test(finalUrl7)) streamUrl = finalUrl7;
    }

    if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) throw new Error('Google CDN stream URL not extracted');
    var isHealthy = await analyzeCloudStreamHealth(streamUrl);
    if (!isHealthy) throw new Error('Unhealthy cloud stream URL');
    return streamUrl;
}

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
        var context = html.slice(Math.max(0, idx - 450), idx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        var combined = context + ' ' + postTitle;
        var quality = parseQuality(context);
        var audio = parseAudio(combined);
        var tech = extractMediaTags(combined);
        var sizeMatch = context.match(/\[\s*([0-9.]+\s*[MG]B)\s*\]/i) || context.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);

        candidates.push({
            url: linkUrl,
            quality: quality,
            audio: audio,
            tech: tech,
            rawContext: context,
            size: sizeMatch ? sizeMatch[1].trim() : '2.5 GB'
        });
    }

    var uniqueCandidates = [];
    var seenUrls = {};
    for (var i = 0; i < candidates.length; i++) {
        if (!seenUrls[candidates[i].url]) {
            seenUrls[candidates[i].url] = true;
            uniqueCandidates.push(candidates[i]);
        }
    }
    uniqueCandidates.sort(function(a, b) {
        return (QUALITY_WEIGHTS[b.quality] || 0) - (QUALITY_WEIGHTS[a.quality] || 0);
    });

    var distinctByQuality = [];
    var seenQualities = {};
    for (var q = 0; q < uniqueCandidates.length; q++) {
        if (!seenQualities[uniqueCandidates[q].quality]) {
            seenQualities[uniqueCandidates[q].quality] = true;
            distinctByQuality.push(uniqueCandidates[q]);
        }
    }
    for (var r = 0; r < uniqueCandidates.length && distinctByQuality.length < 3; r++) {
        if (distinctByQuality.indexOf(uniqueCandidates[r]) === -1) distinctByQuality.push(uniqueCandidates[r]);
    }
    return distinctByQuality.slice(0, 3);
}

function extractTvLinks(fullHtml, seasonNum, episodeNum, postTitle) {
    var entryContentMatch = fullHtml.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!-- \.entry-content -->/i) ||
                          fullHtml.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*)/i) ||
                          fullHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    var contentHtml = entryContentMatch ? entryContentMatch[1] : fullHtml;

    var seasonRegex = /(?:<h[1-6][^>]*>|<p[^>]*>|\b)(?:Season\s*(?:0?(\d+))|\((?:Season\s*(?:0?(\d+)))\))/gi;
    var seasonPositions = [];
    var match;
    while ((match = seasonRegex.exec(contentHtml)) !== null) {
        seasonPositions.push({ season: parseInt(match[1] || match[2], 10), index: match.index });
    }

    var targetSlice = contentHtml;
    if (seasonPositions.length > 0) {
        var targetStarts = seasonPositions.filter(function(p) { return p.season === seasonNum; });
        if (targetStarts.length > 0) {
            var startIdx = targetStarts[0].index;
            var nextSeasonPos = seasonPositions.find(function(p) { return p.season > seasonNum && p.index > startIdx; });
            targetSlice = contentHtml.slice(startIdx, nextSeasonPos ? nextSeasonPos.index : contentHtml.length);
        }
    }

    var epRegex = new RegExp('(?:^|\\b)(?:episode|ep|e)[\\s.]*0*' + episodeNum + '(?:\\b|\\D|$)', 'i');
    var linkRegex = /<a[^>]+href=["'](https:\/\/[^"']*thenaukriadda[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var candidates = [];
    var m;

    while ((m = linkRegex.exec(targetSlice)) !== null) {
        var linkUrl = m[1];
        var linkText = m[2].replace(/<[^>]+>/g, '').trim();
        var lowerLink = linkText.toLowerCase();
        var isBatch = /\b(batch|zip|pack)\b/i.test(lowerLink);
        if (!isBatch && epRegex.test(lowerLink)) {
            var idx = m.index;
            var context = targetSlice.slice(Math.max(0, idx - 450), idx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            var combined = context + ' ' + postTitle;
            var quality = parseQuality(context);
            var audio = parseAudio(combined);
            var tech = extractMediaTags(combined);
            var sizeMatch = context.match(/\[\s*([0-9.]+\s*[MG]B(?:\/E)?)\s*\]/i) || context.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);

            candidates.push({
                url: linkUrl,
                quality: quality,
                audio: audio,
                tech: tech,
                rawContext: context,
                size: sizeMatch ? sizeMatch[1].replace(/\/E/i, '').trim() : '1.2 GB'
            });
        }
    }

    var uniqueTv = [];
    var seenTvUrls = {};
    for (var i = 0; i < candidates.length; i++) {
        if (!seenTvUrls[candidates[i].url]) {
            seenTvUrls[candidates[i].url] = true;
            uniqueTv.push(candidates[i]);
        }
    }
    uniqueTv.sort(function(a, b) {
        return (QUALITY_WEIGHTS[b.quality] || 0) - (QUALITY_WEIGHTS[a.quality] || 0);
    });

    var distinctTvByQuality = [];
    var seenTvQualities = {};
    for (var tq = 0; tq < uniqueTv.length; tq++) {
        if (!seenTvQualities[uniqueTv[tq].quality]) {
            seenTvQualities[uniqueTv[tq].quality] = true;
            distinctTvByQuality.push(uniqueTv[tq]);
        }
    }
    for (var tr = 0; tr < uniqueTv.length && distinctTvByQuality.length < 3; tr++) {
        if (distinctTvByQuality.indexOf(uniqueTv[tr]) === -1) distinctTvByQuality.push(uniqueTv[tr]);
    }
    return distinctTvByQuality.slice(0, 3);
}

async function queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum) {
    try {
        var subUrl = isMovie
            ? (SUB_VDRK_URL + '/movie/' + encodeURIComponent(tmdbId))
            : (SUB_VDRK_URL + '/tv/' + encodeURIComponent(tmdbId) + '/' + sNum + '/' + eNum);
        var res = await safeFetch(subUrl, { headers: { 'User-Agent': USER_AGENT } }, 2200);
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
                headers: { 'User-Agent': USER_AGENT }
            };
        }).filter(function(s) { return s.url && typeof s.url === 'string'; });
    } catch (_) {
        return [];
    }
}

async function resolveCandidateToStream(c, post, meta, isMovie, sNum, eNum, externalSubs) {
    var driveSeedRUrl = await resolveNaukriAdda(c.url);
    var streamUrl = await resolveDriveSeed(driveSeedRUrl);
    if (!streamUrl) return null;

    var tech = c.tech || extractMediaTags(post.title);
    var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

    var streamTitle = isMovie
        ? (meta.title + (meta.year ? ' (' + meta.year + ')' : '') + ' ' + c.audio.badge + ' - UHDMovies Google CDN [' + c.quality + ']' + techSuffix)
        : (meta.title + ' S' + pad(sNum, 2) + 'E' + pad(eNum, 2) + ' ' + c.audio.badge + ' - UHDMovies Google CDN [' + c.quality + ']' + techSuffix);

    var serverName = 'UHDMovies | DriveSeed › Google CDN • ' + c.audio.badge + ' (' + c.quality + ')' + techSuffix;
    var isHls = streamUrl.indexOf('.m3u8') >= 0;
    var isMkv = streamUrl.indexOf('.mkv') >= 0 || streamUrl.indexOf('googleusercontent.com') >= 0;
    var streamFormat = isHls ? 'm3u8' : (isMkv ? 'mkv' : 'mp4');
    var stLabel = isHls ? 'HLS' : (isMkv ? 'Direct MKV' : 'Direct MP4');
    var descParts = [stLabel, c.quality, c.size, c.audio.badge].concat(tech.tags);

    return {
        name: serverName,
        title: streamTitle,
        rawTitle: post.title,
        description: descParts.join(' • '),
        url: streamUrl,
        quality: c.quality,
        isAdaptive: false,
        streamType: stLabel,
        size: c.size || (isMovie ? '2.5 GB' : '1.2 GB'),
        type: streamFormat === 'mkv' ? 'mp4' : streamFormat,
        format: streamFormat,
        container: streamFormat,
        isSequential: streamFormat === 'mp4' || streamFormat === 'mkv',
        provider: 'uhdmovies',
        server: 'DriveSeed',
        subServer: 'Google CDN',
        language: (c.audio.tag || 'eng').toLowerCase(),
        headers: { 'User-Agent': USER_AGENT },
        audio: c.audio,
        hdrType: tech.hdrType,
        codec: tech.codec,
        audioFormat: tech.audioFormat,
        sourceType: tech.sourceType,
        tags: tech.tags,
        subtitles: externalSubs
    };
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    try {
        var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
        extraArgs = Object.assign({}, callArgs, extraArgs || {});
        if (!tmdbId) return [];

        var isMovie = mediaType === 'movie';
        var sNum = Number(season) || 1;
        var eNum = Number(episode) || 1;

        var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
        if (!meta.title) return [];

        var searchAndSubs = await Promise.all([
            searchPost(meta.title, meta.year, isMovie),
            queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum)
        ]);
        var post = searchAndSubs[0];
        var externalSubs = searchAndSubs[1];
        if (!post) return [];

        var postResp = await safeFetch(post.url, { headers: DEFAULT_HEADERS }, 3200);
        if (!postResp.ok) return [];
        var postHtml = await postResp.text();

        var candidates = isMovie
            ? extractMovieLinks(postHtml, post.title)
            : extractTvLinks(postHtml, sNum, eNum, post.title);
        if (candidates.length === 0) return [];

        // Resolve top 2 candidates concurrently (limits gateway concurrency to avoid rate-limiting)
        var primaryBatch = candidates.slice(0, 2);
        var settled = await Promise.allSettled(primaryBatch.map(function(c) {
            return resolveCandidateToStream(c, post, meta, isMovie, sNum, eNum, externalSubs);
        }));

        var streams = [];
        for (var i = 0; i < settled.length; i++) {
            if (settled[i].status === 'fulfilled' && settled[i].value) {
                streams.push(settled[i].value);
            }
        }

        // Fallback to 3rd candidate only if both primary candidates failed
        if (streams.length === 0 && candidates.length > 2) {
            try {
                var fbStream = await resolveCandidateToStream(candidates[2], post, meta, isMovie, sNum, eNum, externalSubs);
                if (fbStream) streams.push(fbStream);
            } catch (_) {}
        }

        streams.sort(function(a, b) {
            return (QUALITY_WEIGHTS[b.quality] || 0) - (QUALITY_WEIGHTS[a.quality] || 0);
        });

        console.log('[UHDMovies] Discovered ' + streams.length + ' stream(s), subtitles: ' + externalSubs.length);
        return streams;
    } catch (e) {
        console.error('[UHDMovies] Unhandled error:', e.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
