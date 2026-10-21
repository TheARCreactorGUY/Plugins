/**
 * Big sample verification suite for Movy, Bingr, and 4KHDHub plugins
 */
const movy = require('./providers/movy.js');
const bingr = require('./providers/bingr.js');
const hub = require('./providers/4khdhub.js');

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
      snippet = text.slice(0, 40).replace(/\r?\n/g, ' ');
    } catch (_) {}
    return { status: res.status, ok: isOk, snippet };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function testSample(label, tmdbId, type, s, e) {
  console.log(`\n======================================================`);
  console.log(`>>> TESTING SAMPLE: ${label} (TMDB ${tmdbId}, Type: ${type})`);
  console.log(`======================================================`);

  // Test Movy
  console.log(`--- [MOVY PLUGIN] ---`);
  const movyStreams = await movy.getStreams(tmdbId, type, s, e);
  console.log(`Movy found ${movyStreams.length} stream(s):`);
  const serverNames = movyStreams.map(st => {
    const m = st.name.match(/Movy \| ([^•]+)/);
    return m ? m[1].trim() : st.name;
  });
  console.log(`Servers discovered: ${[...new Set(serverNames)].join(', ')}`);

  // Check Cancun
  const hasCancun = movyStreams.some(st => st.name.toLowerCase().includes('cancun'));
  console.log(`* Cancun server present: ${hasCancun ? 'YES ✓' : 'NO (not available for this title)'}`);

  // Check MatchScorer title compliance
  if (movyStreams.length > 0) {
    console.log(`Sample title: "${movyStreams[0].title}"`);
    if (type !== 'movie') {
      const hasSe = /S\d{2}E\d{2}/.test(movyStreams[0].title);
      console.log(`* TV SxxExx marker present: ${hasSe ? 'YES ✓ (MatchScorer +0.25 Bonus)' : 'NO ✗'}`);
    } else {
      const hasSe = /S\d{2}E\d{2}/.test(movyStreams[0].title);
      console.log(`* Movie clean of TV markers: ${!hasSe ? 'YES ✓ (Clean Movie)' : 'NO ✗'}`);
    }
  }

  // Check playability of first 2 and Cancun if present
  const toCheckMovy = movyStreams.slice(0, 2);
  const cancunStream = movyStreams.find(st => st.name.toLowerCase().includes('cancun'));
  if (cancunStream && !toCheckMovy.includes(cancunStream)) toCheckMovy.push(cancunStream);

  for (const st of toCheckMovy) {
    const p = await checkPlayable(st);
    console.log(`  - ${st.name} => ${p.ok ? 'PLAYABLE (HTTP ' + p.status + ')' : 'STATUS (' + (p.error || p.status) + ')'} [Subs: ${st.subtitles?.length || 0}]`);
  }

  // Test Bingr
  console.log(`\n--- [BINGR PLUGIN] ---`);
  const bingrStreams = await bingr.getStreams(tmdbId, type, s, e);
  console.log(`Bingr found ${bingrStreams.length} stream(s):`);
  const bServerNames = bingrStreams.map(st => {
    const m = st.name.match(/Bingr \| ([^•]+)/);
    return m ? m[1].trim() : st.name;
  });
  console.log(`Servers discovered: ${[...new Set(bServerNames)].join(', ')}`);

  if (bingrStreams.length > 0) {
    console.log(`Sample title: "${bingrStreams[0].title}"`);
    if (type !== 'movie') {
      const hasSe = /S\d{2}E\d{2}/.test(bingrStreams[0].title);
      console.log(`* TV SxxExx marker present: ${hasSe ? 'YES ✓ (MatchScorer +0.25 Bonus)' : 'NO ✗'}`);
    } else {
      const hasSe = /S\d{2}E\d{2}/.test(bingrStreams[0].title);
      console.log(`* Movie clean of TV markers: ${!hasSe ? 'YES ✓ (Clean Movie)' : 'NO ✗'}`);
    }
  }

  for (const st of bingrStreams.slice(0, 3)) {
    const p = await checkPlayable(st);
    console.log(`  - ${st.name} => ${p.ok ? 'PLAYABLE (HTTP ' + p.status + ')' : 'STATUS (' + (p.error || p.status) + ')'} [Subs: ${st.subtitles?.length || 0}]`);
  }

  // Test 4KHDHub
  console.log(`\n--- [4KHDHUB PLUGIN] ---`);
  const hubStreams = await hub.getStreams(tmdbId, type, s, e);
  console.log(`4KHDHub found ${hubStreams.length} stream(s):`);
  const hServerNames = hubStreams.map(st => {
    const m = st.name.match(/4KHDHub \| ([^•]+)/);
    return m ? m[1].trim() : st.name;
  });
  console.log(`Servers discovered: ${[...new Set(hServerNames)].join(', ')}`);

  if (hubStreams.length > 0) {
    console.log(`Sample title: "${hubStreams[0].title}"`);
    if (type !== 'movie') {
      const hasSe = /S\d{2}E\d{2}/.test(hubStreams[0].title);
      console.log(`* TV SxxExx marker present: ${hasSe ? 'YES ✓ (MatchScorer +0.25 Bonus)' : 'NO ✗'}`);
    } else {
      const hasSe = /S\d{2}E\d{2}/.test(hubStreams[0].title);
      console.log(`* Movie clean of TV markers: ${!hasSe ? 'YES ✓ (Clean Movie)' : 'NO ✗'}`);
    }
  }

  for (const st of hubStreams.slice(0, 3)) {
    const p = await checkPlayable(st);
    console.log(`  - ${st.name} => ${p.ok ? 'PLAYABLE (HTTP ' + p.status + ')' : 'STATUS (' + (p.error || p.status) + ')'}`);
  }
}

async function runAll() {
  await testSample('Movie: Fight Club', '550', 'movie');
  await testSample('Movie: Inception', '27205', 'movie');
  await testSample('TV: MobLand S1E1', '243407', 'tv', 1, 1);
  await testSample('TV: Breaking Bad S1E1', '1396', 'tv', 1, 1);
  await testSample('Anime: Attack on Titan Ep 1', '1429', 'anime', 1, 1);
  console.log(`\n======================================================`);
  console.log(`>>> ALL SAMPLE TESTS FINISHED`);
  console.log(`======================================================\n`);
}

runAll();
