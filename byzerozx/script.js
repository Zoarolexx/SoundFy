// ============================================================
// API - ENDPOINTS
// ============================================================
const API = {
    search: '/api/search.js',
    artist: '/api/artist.js',
    suggest: '/api/suggest.js',
    lyrics: '/api/lyrics.js',
    stream: '/api/stream.js'
};

// ============================================================
// SPLASH SCREEN PROGRESS
// ============================================================
(function initSplashProgress() {
    const fill = document.getElementById('splashProgressFill');
    const text = document.getElementById('splashProgressText');
    if (!fill || !text) return;
    
    let progress = 0;
    const target = 100;
    const duration = 2200;
    const interval = 30;
    const step = (target / duration) * interval;
    
    const timer = setInterval(() => {
        progress += step;
        if (progress >= target) {
            progress = target;
            clearInterval(timer);
            setTimeout(() => {
                const splash = document.getElementById('splash-screen');
                if (splash) {
                    splash.classList.add('hide');
                    setTimeout(() => {
                        if (splash && splash.parentNode) {
                            splash.parentNode.removeChild(splash);
                        }
                    }, 800);
                }
            }, 400);
        }
        fill.style.width = progress + '%';
        text.textContent = Math.floor(progress);
    }, interval);
})();

// ============================================================
// PWA INSTALL
// ============================================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.style.display = 'flex';
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                    showToast('✅ Aplikasi berhasil diinstall!');
                }
                deferredPrompt = null;
            }
        });
    }
});

window.addEventListener('appinstalled', () => {
    document.getElementById('installAppBtn').style.display = 'none';
    deferredPrompt = null;
    showToast('✅ Aplikasi berhasil diinstall!');
});

// ============================================================
// NAVIGASI
// ============================================================
window.addEventListener('load', () => {
    history.replaceState({ view: 'home' }, '', '#home');
    loadHomeData();
    renderSearchCategories();
    lucide.createIcons();
});

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        switchView(e.state.view, false);
    } else {
        switchView('home', false);
    }
});

function switchView(viewName, pushState = true) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navMap = { home: 0, search: 1, library: 2, developer: 3 };
    const idx = navMap[viewName];
    if (idx !== undefined) {
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems[idx]) navItems[idx].classList.add('active');
    }
    
    if (viewName === 'library') renderLibraryUI();
    if (viewName === 'developer') {
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn && deferredPrompt) installBtn.style.display = 'flex';
    }
    window.scrollTo(0, 0);
    if (pushState) {
        history.pushState({ view: viewName }, '', `#${viewName}`);
    }
}

// ============================================================
// INDEXEDDB SETUP
// ============================================================
let db;
const request = indexedDB.open("SoundFyDB", 2);
request.onupgradeneeded = function(e) {
    db = e.target.result;
    if(!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
    if(!db.objectStoreNames.contains('liked_songs')) db.createObjectStore('liked_songs', { keyPath: 'videoId' });
    if(!db.objectStoreNames.contains('favorite_songs')) db.createObjectStore('favorite_songs', { keyPath: 'videoId' });
    if(!db.objectStoreNames.contains('history_songs')) db.createObjectStore('history_songs', { keyPath: 'timestamp' });
    if(!db.objectStoreNames.contains('offline_songs')) db.createObjectStore('offline_songs', { keyPath: 'videoId' });
};
request.onsuccess = function(e) { db = e.target.result; renderLibraryUI(); };

// ============================================================
// GLOBAL VARIABLES
// ============================================================
let ytPlayer;
let isPlaying = false;
let currentTrack = null;
let progressInterval;
let isShuffle = false;
let repeatState = 0;
let currentRepeatCount = 0;
let currentPlayContext = null;
let sleepTimerTimeout = null;
let isEditMode = false;
let selectedTracksForDelete = new Set();
let currentPlaylistTracks = [];
let activePlaylistId = null;
let currentLyrics = [];
let isLyricsVisible = false;
let currentLyricIndex = -1;

// ============================================================
// YOUTUBE PLAYER
// ============================================================
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '0', width: '0',
        events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
    });
}

function onPlayerReady(event) { console.log("Player Ready"); }

function onPlayerStateChange(event) {
    const mainPlayBtn = document.getElementById('mainPlayBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const playIconPath = "M8 5v14l11-7z";
    const pauseIconPath = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";

    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        mainPlayBtn.innerHTML = `<path d="${pauseIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${pauseIconPath}"></path>`;
        startProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (event.data == YT.PlayerState.PAUSED) {
        isPlaying = false;
        mainPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (event.data == YT.PlayerState.ENDED) {
        isPlaying = false;
        mainPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        handleTrackEnded();
    }
}

function handleTrackEnded() {
    if (repeatState === 1) {
        if (currentRepeatCount < 1) { currentRepeatCount++; ytPlayer.seekTo(0); ytPlayer.playVideo(); return; }
        else { currentRepeatCount = 0; }
    } else if (repeatState === 2) {
        if (currentRepeatCount < 3) { currentRepeatCount++; ytPlayer.seekTo(0); ytPlayer.playVideo(); return; }
        else { currentRepeatCount = 0; }
    } else if (repeatState === 3) {
        ytPlayer.seekTo(0); ytPlayer.playVideo(); return;
    }
    playNextTrack(false);
}

function playNextTrack(isManualClick = true) {
    if(isManualClick) currentRepeatCount = 0;
    if (currentPlayContext && currentPlayContext.data && currentPlayContext.data.length > 0) {
        if (isShuffle) {
            const randomTrack = currentPlayContext.data[Math.floor(Math.random() * currentPlayContext.data.length)];
            const trackData = encodeURIComponent(JSON.stringify(randomTrack)).replace(/'/g, "%27");
            playMusic(randomTrack.videoId, trackData, currentPlayContext);
        } else {
            let currentIndex = currentPlayContext.data.findIndex(t => t.videoId === currentTrack.videoId);
            if (currentIndex !== -1 && currentIndex + 1 < currentPlayContext.data.length) {
                const nextTrack = currentPlayContext.data[currentIndex + 1];
                const trackData = encodeURIComponent(JSON.stringify(nextTrack)).replace(/'/g, "%27");
                playMusic(nextTrack.videoId, trackData, currentPlayContext);
            } else {
                playNextSimilarSong();
            }
        }
    } else {
        playNextSimilarSong();
    }
}

async function playNextSimilarSong() {
    if (!currentTrack) return;
    try {
        const response = await fetch(`${API.search}?query=${encodeURIComponent(currentTrack.artist + " official audio")}`);
        const result = await response.json();
        if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
            const relatedSongs = result.result.songs.filter(t => t.videoId !== currentTrack.videoId);
            if (relatedSongs.length > 0) {
                const nextTrack = relatedSongs[Math.floor(Math.random() * relatedSongs.length)];
                let img = nextTrack.thumbnail ? nextTrack.thumbnail : (nextTrack.img ? nextTrack.img : 'https://placehold.co/140x140/282828/FFFFFF?text=Music');
                img = getHighResImage(img);
                const artist = nextTrack.artist ? nextTrack.artist : 'Unknown';
                const trackData = encodeURIComponent(JSON.stringify({videoId: nextTrack.videoId, title: nextTrack.title, artist: artist, img: img})).replace(/'/g, "%27");
                playMusic(nextTrack.videoId, trackData, null);
            }
        }
    } catch (error) {}
}

function addToHistory(track) {
    if(!db) return;
    const tx = db.transaction("history_songs", "readwrite");
    const store = tx.objectStore("history_songs");
    const newTrack = { ...track, timestamp: Date.now() };
    store.put(newTrack);
    const countReq = store.count();
    countReq.onsuccess = function() {
        if(countReq.result > 50) {
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = function(e) {
                const cursor = e.target.result;
                if(cursor) { cursor.delete(); }
            }
        }
    }
}

function playMusic(videoId, encodedTrackData, contextData = null) {
    if(currentTrack && currentTrack.videoId !== videoId) currentRepeatCount = 0;
    currentTrack = JSON.parse(decodeURIComponent(encodedTrackData));
    currentPlayContext = contextData;
    addToHistory(currentTrack);
    checkIfLiked(currentTrack.videoId);

    document.getElementById('miniPlayer').style.display = 'flex';
    document.getElementById('miniPlayerImg').src = currentTrack.img;
    document.getElementById('miniPlayerTitle').innerText = currentTrack.title;
    document.getElementById('miniPlayerArtist').innerText = currentTrack.artist;

    document.getElementById('playerArt').src = currentTrack.img;
    document.getElementById('playerTitle').innerText = currentTrack.title;
    document.getElementById('playerArtist').innerText = currentTrack.artist;
    document.getElementById('playerBg').style.backgroundImage = `url('${currentTrack.img}')`;

    // Update Hero
    document.getElementById('heroTitle').innerText = currentTrack.title;
    document.getElementById('heroArtist').innerText = currentTrack.artist;
    document.getElementById('heroCover').innerHTML = `<img src="${currentTrack.img}" alt="Cover">`;

    updateMediaSession();

    if (ytPlayer && ytPlayer.loadVideoById) ytPlayer.loadVideoById(videoId);
    document.getElementById('progressBar').value = 0;
    document.getElementById('miniProgressBar').style.width = '0%';
    document.getElementById('heroProgressBar').style.width = '0%';
    document.getElementById('currentTime').innerText = "0:00";
    document.getElementById('totalTime').innerText = "0:00";
    
    // Reset lyrics
    currentLyrics = [];
    currentLyricIndex = -1;
    document.getElementById('lyricsContainer').innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">Klik tombol untuk menampilkan lirik</div>';
    if (isLyricsVisible) {
        fetchLyrics(currentTrack.videoId);
    }
}

function togglePlay() {
    if (!ytPlayer) return;
    if (isPlaying) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
}

function expandPlayer() { 
    document.getElementById('playerModal').style.display = 'flex'; 
    document.getElementById('heroProgressBar').style.display = 'none';
}
function minimizePlayer() { 
    document.getElementById('playerModal').style.display = 'none'; 
    document.getElementById('heroProgressBar').style.display = 'block';
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function startProgressBar() {
    stopProgressBar();
    progressInterval = setInterval(() => {
        if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
            const current = ytPlayer.getCurrentTime();
            const duration = ytPlayer.getDuration();
            if (duration > 0) {
                const percent = (current / duration) * 100;
                const progressBar = document.getElementById('progressBar');
                progressBar.value = percent;
                progressBar.style.background = `linear-gradient(to right, #1db954 ${percent}%, rgba(255,255,255,0.08) ${percent}%)`;
                document.getElementById('miniProgressBar').style.width = `${percent}%`;
                document.getElementById('heroProgressBar').style.width = `${percent}%`;
                document.getElementById('currentTime').innerText = formatTime(current);
                document.getElementById('totalTime').innerText = formatTime(duration);
                if (isLyricsVisible) {
                    updateLyrics(current);
                }
            }
        }
    }, 1000);
}

function stopProgressBar() { clearInterval(progressInterval); }

function seekTo(value) {
    if (ytPlayer && ytPlayer.getDuration) {
        const duration = ytPlayer.getDuration();
        const seekTime = (value / 100) * duration;
        ytPlayer.seekTo(seekTime, true);
        const percent = value;
        document.getElementById('progressBar').style.background = `linear-gradient(to right, #1db954 ${percent}%, rgba(255,255,255,0.08) ${percent}%)`;
        document.getElementById('miniProgressBar').style.width = `${percent}%`;
        document.getElementById('heroProgressBar').style.width = `${percent}%`;
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('btnShuffle');
    const color = isShuffle ? '#1db954' : 'var(--text-sub)';
    if (btn) btn.style.color = color;
    showToast(isShuffle ? "Acak dihidupkan" : "Acak dimatikan");
}

function toggleRepeat() {
    repeatState = (repeatState + 1) % 4;
    const btn = document.getElementById('btnRepeat');
    const badge = document.getElementById('repeatBadge');
    if (repeatState === 0) {
        btn.style.color = 'var(--text-sub)';
        badge.style.display = 'none';
        showToast("Ulangi dimatikan");
    } else {
        btn.style.color = '#1db954';
        badge.style.display = 'block';
        if (repeatState === 1) { badge.innerText = "1x"; showToast("Ulangi 1 kali"); }
        if (repeatState === 2) { badge.innerText = "3x"; showToast("Ulangi 3 kali"); }
        if (repeatState === 3) { badge.innerText = "∞"; showToast("Ulangi terus"); }
    }
}

function downloadCurrentTrack() {
    if(!currentTrack) return;
    showToast("Menyiapkan metadata lagu untuk offline...");
    const tx = db.transaction("offline_songs", "readwrite");
    tx.objectStore("offline_songs").put(currentTrack);
    setTimeout(() => { showToast("Selesai! Tersedia di Unduhan"); renderLibraryUI(); }, 2000);
    closePlayerMenuModal();
}

function downloadCurrentPlaylist() {
    if(!currentPlaylistTracks || currentPlaylistTracks.length === 0) return;
    showToast(`Menyiapkan ${currentPlaylistTracks.length} lagu untuk offline...`);
    const tx = db.transaction("offline_songs", "readwrite");
    const store = tx.objectStore("offline_songs");
    currentPlaylistTracks.forEach(t => store.put(t));
    setTimeout(() => { showToast("Selesai! Tersedia di Unduhan"); renderLibraryUI(); }, 3000);
}

function openPlayerMenuModal() {
    if(!currentTrack) return;
    document.getElementById('menuArt').src = currentTrack.img;
    document.getElementById('menuTitle').innerText = currentTrack.title;
    document.getElementById('menuArtist').innerText = currentTrack.artist;
    document.getElementById('playerMenuModal').style.display = 'flex';
}

function closePlayerMenuModal() { document.getElementById('playerMenuModal').style.display = 'none'; }

function setSleepTimer() {
    const minutes = prompt("Matikan musik otomatis dalam berapa menit?", "15");
    if(minutes != null && !isNaN(minutes) && minutes > 0) {
        if(sleepTimerTimeout) clearTimeout(sleepTimerTimeout);
        sleepTimerTimeout = setTimeout(() => {
            if(ytPlayer && isPlaying) ytPlayer.pauseVideo();
            showToast("Musik dimatikan (Sleep Timer)");
        }, minutes * 60000);
        showToast(`Timer diatur ${minutes} menit`);
    }
    closePlayerMenuModal();
}

function toggleFavoritLagu() {
    if(!currentTrack) return;
    const tx = db.transaction("favorite_songs", "readwrite");
    const store = tx.objectStore("favorite_songs");
    const getReq = store.get(currentTrack.videoId);
    getReq.onsuccess = function() {
        if(getReq.result) { store.delete(currentTrack.videoId); showToast("Dihapus dari Favorit"); }
        else { store.put(currentTrack); showToast("Ditambahkan ke Favorit"); }
        renderLibraryUI();
        closePlayerMenuModal();
    };
}

function shareLagu() {
    if(navigator.share && currentTrack) {
        navigator.share({
            title: currentTrack.title,
            text: `Dengarkan ${currentTrack.title} oleh ${currentTrack.artist} di SoundFy!`,
            url: window.location.href
        }).catch(err => console.log('Share gagal', err));
    } else {
        showToast("Fitur bagi tidak didukung di browser ini");
    }
    closePlayerMenuModal();
}

function checkIfLiked(videoId) {
    const tx = db.transaction("liked_songs", "readonly");
    const request = tx.objectStore("liked_songs").get(videoId);
    request.onsuccess = function() {
        const btnSvg = document.getElementById('btnLikeSong');
        if(request.result) {
            btnSvg.style.fill = '#1db954';
            btnSvg.style.stroke = '#1db954';
        } else {
            btnSvg.style.fill = 'transparent';
            btnSvg.style.stroke = 'white';
        }
    };
}

function toggleLike() {
    if(!currentTrack) return;
    const tx = db.transaction("liked_songs", "readwrite");
    const store = tx.objectStore("liked_songs");
    const getReq = store.get(currentTrack.videoId);
    getReq.onsuccess = function() {
        const btnSvg = document.getElementById('btnLikeSong');
        if(getReq.result) {
            store.delete(currentTrack.videoId);
            btnSvg.style.fill = 'transparent';
            btnSvg.style.stroke = 'white';
            showToast("Dihapus dari Suka");
        } else {
            store.put(currentTrack);
            btnSvg.style.fill = '#1db954';
            btnSvg.style.stroke = '#1db954';
            showToast("Ditambahkan ke Suka");
        }
        renderLibraryUI();
    };
}

let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('customToast');
    toast.innerText = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function updateMediaSession() {
    if ('mediaSession' in navigator && currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTrack.title,
            artist: currentTrack.artist,
            artwork: [{ src: currentTrack.img, sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', function() { togglePlay(); });
        navigator.mediaSession.setActionHandler('pause', function() { togglePlay(); });
        navigator.mediaSession.setActionHandler('nexttrack', function() { playNextTrack(true); });
    }
}

function getHighResImage(url) {
    if (!url) return url;
    if (url.match(/=w\d+-h\d+/)) return url.replace(/=w\d+-h\d+[^&]*/g, '=w512-h512-l90-rj');
    return url;
}

function createListHTML(track, context = null) {
    let img = track.thumbnail ? track.thumbnail : (track.img ? track.img : 'https://placehold.co/48x48/282828/FFFFFF?text=Music');
    img = getHighResImage(img);
    const artist = track.artist ? track.artist : 'Unknown';
    const trackData = encodeURIComponent(JSON.stringify({videoId: track.videoId, title: track.title, artist: artist, img: img})).replace(/'/g, "%27");
    const ctxString = context ? encodeURIComponent(JSON.stringify(context)).replace(/'/g, "%27") : 'null';
    return `
        <div class="search-result-item" onclick="playMusic('${track.videoId}', '${trackData}', ${ctxString !== 'null' ? `JSON.parse(decodeURIComponent('${ctxString}'))` : 'null'})">
            <img src="${img}" onerror="this.src='https://placehold.co/48x48/282828/FFFFFF?text=Music'">
            <div class="info">
                <div class="title">${track.title}</div>
                <div class="artist">${artist}</div>
            </div>
        </div>
    `;
}

function createCardHTML(track, isArtist = false) {
    let img = track.thumbnail ? track.thumbnail : (track.img ? track.img : 'https://placehold.co/140x140/282828/FFFFFF?text=Music');
    img = getHighResImage(img);
    const artist = track.artist ? track.artist : 'Unknown';
    const trackData = encodeURIComponent(JSON.stringify({videoId: track.videoId, title: track.title, artist: artist, img: img})).replace(/'/g, "%27");
    const clickAction = isArtist ? `openArtistView('${track.title.replace(/'/g, "\\'")}')` : `playMusic('${track.videoId}', '${trackData}', null)`;
    const imgClass = isArtist ? 'h-img artist-img' : 'h-img';
    return `
        <div class="h-card" onclick="${clickAction}">
            <img src="${img}" class="${imgClass}" onerror="this.src='https://placehold.co/140x140/282828/FFFFFF?text=Music'">
            <div class="h-title">${track.title}</div>
            <div class="h-sub">${isArtist ? 'Artis' : artist}</div>
        </div>
    `;
}

let homeDisplayedVideoIds = new Set();
async function fetchAndRender(query, containerId, formatType, isArtist = false, isHome = false) {
    try {
        const response = await fetch(`${API.search}?query=${encodeURIComponent(query)}`);
        const result = await response.json();
        if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
            let limit = containerId === 'recentList' ? 4 : (formatType === 'list' ? 4 : 8);
            let tracks = [];
            for (let t of result.result.songs) {
                if (isHome) {
                    if (!homeDisplayedVideoIds.has(t.videoId)) { tracks.push(t); homeDisplayedVideoIds.add(t.videoId); }
                } else { tracks.push(t); }
                if (tracks.length >= limit) break;
            }
            let html = '';
            tracks.forEach(t => html += formatType === 'list' ? createListHTML(t) : createCardHTML(t, isArtist));
            document.getElementById(containerId).innerHTML = html;
        } else {
            document.getElementById(containerId).innerHTML = '<div style="color:var(--text-sub); font-size: 13px;text-align:center;padding:20px;">Tidak ada data</div>';
        }
    } catch (error) {
        document.getElementById(containerId).innerHTML = '<div style="color:var(--text-sub); font-size: 13px;text-align:center;padding:20px;">Sedang Offline</div>';
    }
}

function loadHomeData() {
    homeDisplayedVideoIds.clear();
    fetchAndRender('lagu indonesia hits terbaru', 'rowAnyar', 'card', false, true);
    fetchAndRender('top 50 indonesia playlist update', 'rowCharts', 'card', false, true);
    fetchAndRender('penyanyi pop indonesia paling hits', 'rowArtists', 'card', true, true);
}

function renderSearchCategories() {
    const categories = [
        { title: 'Pop', color: '#477d95', emoji: '🎵' },
        { title: 'Indie', color: '#8d67ab', emoji: '🎸' },
        { title: 'Indonesia', color: '#e8115b', emoji: '🇮🇩' },
        { title: 'Hip Hop', color: '#f5a623', emoji: '🎤' }
    ];
    let html = '';
    categories.forEach(cat => {
        html += `<div class="category-card" style="background:${cat.color};" onclick="searchMusic('${cat.title}')">
            <div class="title">${cat.title}</div>
            <div class="emoji">${cat.emoji}</div>
        </div>`;
    });
    document.getElementById('categoryGrid').innerHTML = html;
}

let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    const clearBtn = document.getElementById('searchClear');
    if (query.length > 0) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }
    
    if (query.length === 0) {
        document.getElementById('searchCategoriesUI').style.display = 'block';
        document.getElementById('searchResultsUI').style.display = 'none';
        return;
    }
    document.getElementById('searchCategoriesUI').style.display = 'none';
    document.getElementById('searchResultsUI').style.display = 'block';
    searchTimeout = setTimeout(async () => {
        document.getElementById('searchResults').innerHTML = '<div style="color:var(--text-sub); text-align:center;padding:20px;">Mencari musik...</div>';
        try {
            const response = await fetch(`${API.search}?query=${encodeURIComponent(query)}`);
            const result = await response.json();
            if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
                let html = '';
                result.result.songs.forEach(t => html += createListHTML(t));
                document.getElementById('searchResults').innerHTML = html;
            } else {
                document.getElementById('searchResults').innerHTML = '<div style="color:var(--text-sub); text-align:center;padding:20px;">Tidak ada hasil</div>';
            }
        } catch (error) {
            document.getElementById('searchResults').innerHTML = '<div style="color:var(--text-sub); text-align:center;padding:20px;">Anda Sedang Offline</div>';
        }
    }, 800);
});

function clearSearch() {
    const input = document.getElementById('searchInput');
    input.value = '';
    document.getElementById('searchClear').style.display = 'none';
    document.getElementById('searchCategoriesUI').style.display = 'block';
    document.getElementById('searchResultsUI').style.display = 'none';
    input.focus();
}

function searchMusic(query) {
    const input = document.getElementById('searchInput');
    input.value = query;
    input.dispatchEvent(new Event('input'));
    switchView('search');
}

function openArtistView(artistName) {
    document.getElementById('artistNameDisplay').innerText = artistName;
    document.getElementById('artistTracksContainer').innerHTML = '<div style="color:var(--text-sub); text-align:center;padding:20px;">Memuat lagu artis...</div>';
    switchView('artist');
    try {
        const response = await fetch(`${API.search}?query=${encodeURIComponent(artistName + " official audio")}`);
        const result = await response.json();
        if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
            let html = '';
            let ctx = { type: 'artist', data: result.result.songs };
            result.result.songs.forEach(track => { html += createListHTML(track, ctx); });
            document.getElementById('artistTracksContainer').innerHTML = html;
            if(result.result.songs.length > 0) {
                const firstTrack = result.result.songs[0];
                let img = firstTrack.thumbnail ? firstTrack.thumbnail : (firstTrack.img ? firstTrack.img : 'https://placehold.co/48x48/282828/FFFFFF?text=Music');
                img = getHighResImage(img);
                const trackData = encodeURIComponent(JSON.stringify({videoId: firstTrack.videoId, title: firstTrack.title, artist: firstTrack.artist || 'Unknown', img: img})).replace(/'/g, "%27");
                const ctxString = encodeURIComponent(JSON.stringify(ctx)).replace(/'/g, "%27");
                document.querySelector('.artist-play-btn').setAttribute('onclick', `playMusic('${firstTrack.videoId}', '${trackData}', JSON.parse(decodeURIComponent('${ctxString}')))`);
            }
        }
    } catch(e) {}
}

function renderLibraryUI() {
    if(!db) return;
    
    // Update counts
    const likedTx = db.transaction("liked_songs", "readonly");
    const likedReq = likedTx.objectStore("liked_songs").count();
    likedReq.onsuccess = function() {
        document.getElementById('likedCount').innerText = likedReq.result + ' lagu';
    };
    
    const offlineTx = db.transaction("offline_songs", "readonly");
    const offlineReq = offlineTx.objectStore("offline_songs").count();
    offlineReq.onsuccess = function() {
        document.getElementById('offlineCount').innerText = offlineReq.result + ' lagu';
    };
    
    const historyTx = db.transaction("history_songs", "readonly");
    const historyReq = historyTx.objectStore("history_songs").count();
    historyReq.onsuccess = function() {
        document.getElementById('historyCount').innerText = historyReq.result + ' lagu';
    };
}

function openPlaylistView(id) {
    activePlaylistId = id;
    isEditMode = false;
    document.getElementById('bulkActionBar').style.display = 'none';
    switchView('playlist');
    const container = document.getElementById('playlistTracksContainer');
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center;padding:20px;">Memuat daftar lagu...</div>';

    if (id === 'liked') {
        document.getElementById('playlistNameDisplay').innerText = "Disukai";
        const tx = db.transaction("liked_songs", "readonly");
        const req = tx.objectStore("liked_songs").getAll();
        req.onsuccess = () => { processPlaylistData(req.result, 'liked'); };
    }
    else if (id === 'offline') {
        document.getElementById('playlistNameDisplay').innerText = "Diunduh";
        const tx = db.transaction("offline_songs", "readonly");
        const req = tx.objectStore("offline_songs").getAll();
        req.onsuccess = () => { processPlaylistData(req.result, 'offline'); };
    }
    else if (id === 'history') {
        document.getElementById('playlistNameDisplay').innerText = "Riwayat";
        const tx = db.transaction("history_songs", "readonly");
        const req = tx.objectStore("history_songs").getAll();
        req.onsuccess = () => {
            const histData = req.result.sort((a,b) => b.timestamp - a.timestamp);
            processPlaylistData(histData, 'history');
        };
    }
    else if (id === 'top50') {
        document.getElementById('playlistNameDisplay').innerText = "Teratas Saya 50";
        showToast("Memuat 50 lagu teratas...");
    }
    else if (id === 'uploaded') {
        document.getElementById('playlistNameDisplay').innerText = "Diunggah";
        showToast("Belum ada lagu yang diunggah");
    }
    else {
        const tx = db.transaction("playlists", "readonly");
        const req = tx.objectStore("playlists").get(id);
        req.onsuccess = () => {
            const p = req.result;
            document.getElementById('playlistNameDisplay').innerText = p.name;
            processPlaylistData(p.tracks || [], 'playlist');
        };
    }
}

function processPlaylistData(dataArr, typeId) {
    currentPlaylistTracks = dataArr || [];
    document.getElementById('playlistStatsDisplay').innerText = `${currentPlaylistTracks.length} lagu`;
    const container = document.getElementById('playlistTracksContainer');
    if (currentPlaylistTracks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center;padding:20px;">Daftar ini masih kosong.</div>';
        return;
    }
    let html = '';
    let ctx = { type: typeId, data: currentPlaylistTracks };
    currentPlaylistTracks.forEach(t => {
        let img = t.thumbnail ? t.thumbnail : (t.img ? t.img : 'https://placehold.co/48x48/282828/FFFFFF?text=Music');
        img = getHighResImage(img);
        const artist = t.artist ? t.artist : 'Unknown';
        html += `
            <div class="search-result-item" onclick="playMusic('${t.videoId}', '${encodeURIComponent(JSON.stringify({videoId:t.videoId,title:t.title,artist:artist,img:img}))}', ${JSON.stringify(ctx).replace(/'/g, "%27")})">
                <img src="${img}" onerror="this.src='https://placehold.co/48x48/282828/FFFFFF?text=Music'">
                <div class="info">
                    <div class="title">${t.title}</div>
                    <div class="artist">${artist}</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function playFirstPlaylistTrack() {
    if(currentPlaylistTracks && currentPlaylistTracks.length > 0) {
        const firstTrack = currentPlaylistTracks[0];
        const trackData = encodeURIComponent(JSON.stringify(firstTrack)).replace(/'/g, "%27");
        const ctxString = encodeURIComponent(JSON.stringify({ type: 'auto', data: currentPlaylistTracks })).replace(/'/g, "%27");
        playMusic(firstTrack.videoId, trackData, JSON.parse(decodeURIComponent(ctxString)));
    }
}

function toggleEditMode() {
    isEditMode = !isEditMode;
    selectedTracksForDelete.clear();
    document.querySelectorAll('#playlistTracksContainer .search-result-item').forEach(item => {
        if(isEditMode) {
            item.style.borderLeft = '3px solid #e8115b';
            item.style.cursor = 'pointer';
        } else {
            item.style.borderLeft = 'none';
        }
    });
    const bar = document.getElementById('bulkActionBar');
    if(isEditMode) {
        bar.style.display = 'flex';
        updateDeleteCount();
    } else {
        bar.style.display = 'none';
    }
}

function handleCheckDelete(videoId, isChecked) {
    if(isChecked) selectedTracksForDelete.add(videoId);
    else selectedTracksForDelete.delete(videoId);
    updateDeleteCount();
}

function updateDeleteCount() {
    document.getElementById('selCountText').innerText = `${selectedTracksForDelete.size} lagu dipilih`;
}

function deleteSelectedTracks() {
    if(selectedTracksForDelete.size === 0) {
        showToast("Pilih minimal satu lagu untuk dihapus");
        return;
    }
    let storeName = "";
    if(activePlaylistId === 'liked') storeName = "liked_songs";
    else if(activePlaylistId === 'favorite') storeName = "favorite_songs";
    else if(activePlaylistId === 'history') storeName = "history_songs";
    else if(activePlaylistId === 'offline') storeName = "offline_songs";

    if(storeName) {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        selectedTracksForDelete.forEach(id => {
            if(activePlaylistId === 'history') {
                const req = store.openCursor();
                req.onsuccess = function(e) {
                    const cursor = e.target.result;
                    if(cursor) {
                        if(cursor.value.videoId === id) cursor.delete();
                        cursor.continue();
                    }
                }
            } else {
                store.delete(id);
            }
        });
        tx.oncomplete = () => {
            showToast(`${selectedTracksForDelete.size} lagu dihapus`);
            openPlaylistView(activePlaylistId);
        }
    } else {
        const tx = db.transaction("playlists", "readwrite");
        const store = tx.objectStore("playlists");
        const req = store.get(activePlaylistId);
        req.onsuccess = () => {
            const p = req.result;
            p.tracks = p.tracks.filter(t => !selectedTracksForDelete.has(t.videoId));
            store.put(p);
            showToast(`${selectedTracksForDelete.size} lagu dihapus dari Playlist`);
            openPlaylistView(activePlaylistId);
        };
    }
}

let base64PlaylistImage = '';
function openCreatePlaylist() { document.getElementById('createPlaylistModal').style.display = 'block'; }
function closeCreatePlaylist() {
    document.getElementById('createPlaylistModal').style.display = 'none';
    document.getElementById('cpName').value = '';
    document.getElementById('cpPreview').src = 'https://via.placeholder.com/120x120?text=+';
    base64PlaylistImage = '';
}
function previewImage(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
        document.getElementById('cpPreview').src = reader.result;
        base64PlaylistImage = reader.result;
    };
    if(file) reader.readAsDataURL(file);
}
function saveNewPlaylist() {
    const name = document.getElementById('cpName').value || "Playlist baruku";
    const newPlaylist = { id: Date.now().toString(), name: name, img: base64PlaylistImage, tracks: [] };
    const tx = db.transaction("playlists", "readwrite");
    tx.objectStore("playlists").put(newPlaylist);
    tx.oncomplete = function() { closeCreatePlaylist(); renderLibraryUI(); };
}

function openAddToPlaylistModal() {
    if(!currentTrack) return;
    const tx = db.transaction("playlists", "readonly");
    const req = tx.objectStore("playlists").getAll();
    req.onsuccess = () => {
        let html = '';
        req.result.forEach(p => {
            html += `
                <div class="lib-item" onclick="addTrackToPlaylist('${p.id}')" style="margin-bottom: 4px;">
                    <div class="lib-icon" style="background:linear-gradient(135deg,#1db954,#1aa34a);width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i data-lucide="music" class="w-5 h-5 text-black"></i>
                    </div>
                    <div class="lib-info">
                        <span class="lib-name">${p.name}</span>
                        <span class="lib-count">${p.tracks ? p.tracks.length : 0} lagu</span>
                    </div>
                </div>`;
        });
        if(req.result.length === 0) html = '<div style="color:#6b7280; text-align:center;padding:20px;">Belum ada playlist. Buat dulu di Pustaka.</div>';
        document.getElementById('addToPlaylistList').innerHTML = html;
        document.getElementById('addToPlaylistModal').style.display = 'flex';
        lucide.createIcons();
    };
}
function closeAddToPlaylistModal() { document.getElementById('addToPlaylistModal').style.display = 'none'; }
function addTrackToPlaylist(playlistId) {
    const tx = db.transaction("playlists", "readwrite");
    const store = tx.objectStore("playlists");
    const req = store.get(playlistId);
    req.onsuccess = () => {
        const p = req.result;
        if(!p.tracks) p.tracks = [];
        if(!p.tracks.find(t => t.videoId === currentTrack.videoId)) {
            p.tracks.push(currentTrack);
            store.put(p);
            showToast('Ditambahkan ke ' + p.name);
        } else {
            showToast('Sudah ada di ' + p.name);
        }
        closeAddToPlaylistModal();
    };
}

function playFirstArtistTrack() {
    const container = document.getElementById('artistTracksContainer');
    const first = container.querySelector('.search-result-item');
    if(first) first.click();
}

function importPlaylist() {
    showToast('Fitur impor playlist sedang dalam pengembangan');
}

function setQuickFilter(filter) {
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
    const chips = document.querySelectorAll('.filter-chip');
    const map = { 'all': 0, 'chill': 1, 'focus': 2, 'commute': 3, 'gaming': 4 };
    const idx = map[filter];
    if (idx !== undefined && chips[idx]) chips[idx].classList.add('active');
    showToast(`Filter: ${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
}

function setFilter(filter) {
    document.querySelectorAll('.filter-tab').forEach(el => el.classList.remove('active'));
    const tabs = document.querySelectorAll('.filter-tab');
    const map = { 'all': 0, 'songs': 1, 'videos': 2, 'albums': 3 };
    const idx = map[filter];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
}

function setLibTab(tab) {
    document.querySelectorAll('.lib-tab').forEach(el => el.classList.remove('active'));
    const tabs = document.querySelectorAll('.lib-tab');
    const map = { 'playlists': 0, 'songs': 1, 'albums': 2 };
    const idx = map[tab];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
}

function toggleSort() {
    const text = document.getElementById('sortText');
    if (text.innerText === 'Terbaru') {
        text.innerText = 'Terlama';
    } else {
        text.innerText = 'Terbaru';
    }
}

// ============================================================
// LYRICS FUNCTIONS
// ============================================================
async function fetchLyrics(videoId) {
    if (!videoId) return;
    try {
        const response = await fetch(`${API.lyrics}?id=${videoId}`);
        const result = await response.json();
        if (result.status === true && result.result && result.result.lyrics && result.result.lyrics.lines.length > 0) {
            currentLyrics = result.result.lyrics.lines;
            renderLyrics(currentLyrics);
        } else {
            currentLyrics = [];
            document.getElementById('lyricsContainer').innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">Lirik tidak tersedia</div>';
        }
    } catch (error) {
        console.error('Lyrics fetch error:', error);
        document.getElementById('lyricsContainer').innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">Gagal memuat lirik</div>';
    }
}

function renderLyrics(lines) {
    const container = document.getElementById('lyricsContainer');
    if (!container) return;
    if (!lines || lines.length === 0) {
        container.innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">Lirik tidak tersedia</div>';
        return;
    }
    let html = '';
    lines.forEach((line, index) => {
        const text = line.text || '';
        if (text.trim()) {
            html += `<div class="lyric-line" data-index="${index}" data-time="${line.time || 0}">${text}</div>`;
        }
    });
    container.innerHTML = html;
}

function updateLyrics(currentTime) {
    if (!currentLyrics || currentLyrics.length === 0) return;
    const lines = document.querySelectorAll('.lyric-line');
    let activeIndex = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
        const time = currentLyrics[i].time || 0;
        if (currentTime >= time) {
            activeIndex = i;
        } else {
            break;
        }
    }
    if (activeIndex !== currentLyricIndex) {
        currentLyricIndex = activeIndex;
        lines.forEach((line, index) => {
            line.classList.remove('active', 'inactive');
            if (index === activeIndex) {
                line.classList.add('active');
                line.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } else if (index < activeIndex) {
                line.classList.add('inactive');
            }
        });
    }
}

function toggleLyrics() {
    isLyricsVisible = !isLyricsVisible;
    const container = document.getElementById('lyricsContainer');
    const btn = document.getElementById('lyricsToggleBtn');
    const btnText = document.getElementById('lyricsBtnText');
    
    if (isLyricsVisible) {
        container.style.display = 'block';
        btn.classList.add('active');
        btnText.textContent = 'Sembunyikan';
        if (currentLyrics.length === 0 && currentTrack) {
            fetchLyrics(currentTrack.videoId);
        }
        if (ytPlayer && ytPlayer.getCurrentTime) {
            const currentTime = ytPlayer.getCurrentTime() || 0;
            updateLyrics(currentTime);
        }
    } else {
        container.style.display = 'none';
        btn.classList.remove('active');
        btnText.textContent = 'Tampilkan Lirik';
    }
}

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast('✅ Aplikasi berhasil diinstall!');
                document.getElementById('installAppBtn').style.display = 'none';
            } else {
                showToast('❌ Instalasi dibatalkan');
            }
            deferredPrompt = null;
        });
    } else {
        showToast('💡 Buka menu browser > "Tambahkan ke Layar Utama"');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(() => {
                window.dispatchEvent(new Event('beforeinstallprompt'));
            });
        }
    }
}
