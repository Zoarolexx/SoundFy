const https = require('https');

const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

function getRunsText(runs) {
    if (!Array.isArray(runs)) return '';
    return runs.map(run => run.text || '').join('');
}

function removeKeysRecursive(obj, keys) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(item => removeKeysRecursive(item, keys)); return; }
    for (const key of Object.keys(obj)) {
        if (keys.includes(key)) delete obj[key];
        else if (typeof obj[key] === 'object') removeKeysRecursive(obj[key], keys);
    }
}

function formatSongs(contents) {
    const songs = [];
    let count = 0;
    for (const item of contents) {
        if (count >= 20) break;
        if (!item.videoRenderer) continue;
        const vr = item.videoRenderer;
        songs.push({
            videoId: vr.videoId || '',
            title: getRunsText(vr.title?.runs || []),
            artist: getRunsText(vr.ownerText?.runs || vr.longBylineText?.runs || []),
            artistId: vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || vr.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
            thumbnail: (vr.thumbnail?.thumbnails || []).slice(-1)[0]?.url || '',
            url: 'https://youtube.com/watch?v=' + (vr.videoId || '')
        });
        count++;
    }
    return songs;
}

function makeRequest(options, payload) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        if (payload) req.write(JSON.stringify(payload));
        req.end();
    });
}

module.exports = async (req, res) => {
    // NO CORS - allow all
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'GET') { res.status(405).json({ status: false, message: 'Method not allowed' }); return; }

    const searchQuery = (req.query.query || '').trim();
    if (!searchQuery) { res.status(400).json({ status: false, message: 'Parameter query wajib diisi' }); return; }

    try {
        const data = await makeRequest({
            hostname: 'www.youtube.com',
            path: '/youtubei/v1/search?key=' + API_KEY,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
            rejectUnauthorized: false,
            timeout: 15000
        }, { context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'ID' } }, query: searchQuery });

        const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        const songs = formatSongs(contents);
        const result = { status: true, input: { query: searchQuery }, result: { query: searchQuery, total: songs.length, songs, creator: 'Nanzz' } };
        removeKeysRecursive(result, ['creator']);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ status: false, message: 'Gagal: ' + error.message });
    }
};