/**
 * Comprehensive verification harness for Bingr provider plugin
 */
const { getStreams } = require('./providers/bingr.js');

async function checkPlayable(stream) {
  try {
    const fetchOptions = {
      headers: Object.assign({}, stream.headers, {
        'Range': 'bytes=0-1024'
      }),
      signal: AbortSignal.timeout(6000)
    };
    const res = await fetch(stream.url, fetchOptions);
    const isOk = res.status === 200 || res.status === 206;
    let snippet = '';
    try {
      const text = await res.text();
      snippet = text.slice(0, 50).replace(/\r?\n/g, ' ');
    } catch (_) {}
    return { status: res.status, ok: isOk, snippet };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('   BINGR PROVIDER PLUGIN TEST SUITE');
  console.log('====================================================\n');

  // Test 1: Movie (Fight Club - TMDB 550)
  console.log('>>> TEST 1: Movie (TMDB 550: Fight Club)');
  const movieStreams = await getStreams('550', 'movie');
  console.log(`Found ${movieStreams.length} movie streams.\n`);
  for (let i = 0; i < movieStreams.length; i++) {
    const s = movieStreams[i];
    const playCheck = await checkPlayable(s);
    console.log(`  [${i + 1}] ${s.name}`);
    console.log(`      Language: ${s.language} | Type: ${s.type} | Quality: ${s.quality}`);
    console.log(`      Subtitles attached: ${s.subtitles ? s.subtitles.length : 0}`);
    console.log(`      Playback: ${playCheck.ok ? 'SUCCESS (HTTP ' + playCheck.status + ')' : 'FAIL (' + (playCheck.error || playCheck.status) + ')'} ${playCheck.snippet}`);
    console.log(`      URL: ${s.url.slice(0, 70)}...`);
  }
  console.log('\n----------------------------------------------------\n');

  // Test 2: TV Series (Breaking Bad S1E1 - TMDB 1396)
  console.log('>>> TEST 2: TV Series (TMDB 1396 S1E1: Breaking Bad)');
  const tvStreams = await getStreams('1396', 'tv', 1, 1);
  console.log(`Found ${tvStreams.length} TV streams.\n`);
  for (let i = 0; i < tvStreams.length; i++) {
    const s = tvStreams[i];
    const playCheck = await checkPlayable(s);
    console.log(`  [${i + 1}] ${s.name}`);
    console.log(`      Language: ${s.language} | Type: ${s.type} | Quality: ${s.quality}`);
    console.log(`      Subtitles attached: ${s.subtitles ? s.subtitles.length : 0}`);
    console.log(`      Playback: ${playCheck.ok ? 'SUCCESS (HTTP ' + playCheck.status + ')' : 'FAIL (' + (playCheck.error || playCheck.status) + ')'} ${playCheck.snippet}`);
    console.log(`      URL: ${s.url.slice(0, 70)}...`);
  }
  console.log('\n----------------------------------------------------\n');

  // Test 3: Anime (Attack on Titan Ep 1 - TMDB 1429)
  console.log('>>> TEST 3: Anime (TMDB 1429 Ep 1: Attack on Titan)');
  const animeStreams = await getStreams('1429', 'anime', 1, 1);
  console.log(`Found ${animeStreams.length} Anime streams.\n`);
  for (let i = 0; i < animeStreams.length; i++) {
    const s = animeStreams[i];
    const playCheck = await checkPlayable(s);
    console.log(`  [${i + 1}] ${s.name}`);
    console.log(`      Language: ${s.language} | Type: ${s.type} | Quality: ${s.quality}`);
    console.log(`      Subtitles attached: ${s.subtitles ? s.subtitles.length : 0}`);
    console.log(`      Playback: ${playCheck.ok ? 'SUCCESS (HTTP ' + playCheck.status + ')' : 'FAIL (' + (playCheck.error || playCheck.status) + ')'} ${playCheck.snippet}`);
    console.log(`      URL: ${s.url.slice(0, 70)}...`);
  }
  console.log('\n====================================================\n');
}

runTests();
