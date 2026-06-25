// ============================================================
// API ENDPOINTS
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
// NAVIGASI - FIX BOTTOM NAV
// ============================================================
window.addEventListener('load', () => {
    history.replaceState({ view: 'home' }, '', '#home');
    loadHomeData();
    renderSearchCategories();
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    setActiveNav('home');
});

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        switchView(e.state.view, false);
    } else {
        switchView('home', false);
    }
});

function setActiveNav(viewName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navMap = { home: 0, search: 1, library: 2, developer: 3 };
    const idx = navMap[viewName];
    if (idx !== undefined) {
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems[idx]) navItems[idx].classList.add('active');
    }
}

function switchView(viewName, pushState = true) {
    const views = ['home', 'search', 'library', 'developer', 'artist', 'playlist'];
    views.forEach(id => {
        const el = document.getElementById('view-' + id);
        if (el) el.classList.remove('active');
    });
    
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');
    
    setActiveNav(viewName);
    
    if (viewName === 'library') renderLibraryUI();
    if (viewName === 'developer') {
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn && deferredPrompt) installBtn.style.display = 'flex';
    }
    
    window.scrollTo(0, 0);
    
    if (pushState) {
        history.pushState({ view: viewName }, '', `#${viewName}`);
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// ============================================================
// INDEXEDDB SETUP
// ============================================================
let db;
const request = indexedDB.open("SoundFyDB", 2);
request.onupgradeneeded = function(e) {
    db = e.target.result;
    if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('liked_songs')) db.createObjectStore('liked_songs', { keyPath: 'videoId' });
    if (!db.objectStoreNames.contains('favorite_songs')) db.createObjectStore('favorite_songs', { keyPath: 'videoId' });
    if (!db.objectStoreNames.contains('history_songs')) db.createObjectStore('history_songs', { keyPath: 'timestamp' });
    if (!db.objectStoreNames.contains('offline_songs')) db.createObjectStore('offline_songs', { keyPath: 'videoId' });
};
request.onsuccess = function(e) { 
    db = e.target.result; 
    renderLibraryUI(); 
};

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
let isPlayerExpanded = false;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function getHighResImage(url) {
    if (!url) return 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
    if (url.match(/=w\d+-h\d+/)) return url.replace(/=w\d+-h\d+[^&]*/g, '=w512-h512-l90-rj');
    return url;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('customToast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { 
        toast.classList.remove('show'); 
    }, 3000);
}

// ============================================================
// YOUTUBE PLAYER
// ============================================================
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '0',
        width: '0',
        playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            showinfo: 0
        },
        events: {
            'onReady': function() { console.log("Player Ready"); },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    const mainPlayBtn = document.getElementById('mainPlayBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const playIcon = "M8 5v14l11-7z";
    const pauseIcon = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";

    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        if (mainPlayBtn) mainPlayBtn.innerHTML = `<path d="${pauseIcon}"></path>`;
        if (miniPlayBtn) miniPlayBtn.innerHTML = `<path d="${pauseIcon}"></path>`;
        startProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        updateNowPlaying(true);
    } else if (event.data == YT.PlayerState.PAUSED) {
        isPlaying = false;
        if (mainPlayBtn) mainPlayBtn.innerHTML = `<path d="${playIcon}"></path>`;
        if (miniPlayBtn) miniPlayBtn.innerHTML = `<path d="${playIcon}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        updateNowPlaying(false);
    } else if (event.data == YT.PlayerState.ENDED) {
        isPlaying = false;
        if (mainPlayBtn) mainPlayBtn.innerHTML = `<path d="${playIcon}"></path>`;
        if (miniPlayBtn) miniPlayBtn.innerHTML = `<path d="${playIcon}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        updateNowPlaying(false);
        handleTrackEnded();
    }
}

function handleTrackEnded() {
    if (repeatState === 1) {
        if (currentRepeatCount < 1) {
            currentRepeatCount++;
            if (ytPlayer) { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
            return;
        } else {
            currentRepeatCount = 0;
        }
    } else if (repeatState === 2) {
        if (currentRepeatCount < 3) {
            currentRepeatCount++;
            if (ytPlayer) { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
            return;
        } else {
            currentRepeatCount = 0;
        }
    } else if (repeatState === 3) {
        if (ytPlayer) { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
        return;
    }
    playNextTrack(false);
}

function startProgressBar() {
    stopProgressBar();
    progressInterval = setInterval(() => {
        if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
            try {
                const current = ytPlayer.getCurrentTime();
                const duration = ytPlayer.getDuration();
                if (duration > 0) {
                    const percent = (current / duration) * 100;
                    
                    const progressBar = document.getElementById('progressBar');
                    if (progressBar) {
                        progressBar.value = percent;
                    }
                    
                    const miniProgress = document.getElementById('miniProgressBar');
                    if (miniProgress) miniProgress.style.width = `${percent}%`;
                    
                    const heroProgress = document.getElementById('heroProgressBar');
                    if (heroProgress) heroProgress.style.width = `${percent}%`;
                    
                    const currentTime = document.getElementById('currentTime');
                    if (currentTime) currentTime.innerText = formatTime(current);
                    
                    const totalTime = document.getElementById('totalTime');
                    if (totalTime) totalTime.innerText = formatTime(duration);
                    
                    if (isLyricsVisible) {
                        updateLyrics(current);
                    }
                }
            } catch (e) {}
        }
    }, 1000);
}

function stopProgressBar() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function togglePlay() {
    if (!ytPlayer) { showToast('⚠️ Player belum siap'); return; }
    if (isPlaying) {
        ytPlayer.pauseVideo();
    } else {
        ytPlayer.playVideo();
    }
}

function seekTo(value) {
    if (ytPlayer && ytPlayer.getDuration) {
        try {
            const duration = ytPlayer.getDuration();
            const seekTime = (value / 100) * duration;
            ytPlayer.seekTo(seekTime, true);
        } catch (e) {}
    }
}

function expandPlayer() {
    isPlayerExpanded = true;
    const modal = document.getElementById('playerModal');
    if (modal) modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        if (modal) modal.classList.add('show');
    }, 10);
}

function minimizePlayer() {
    isPlayerExpanded = false;
    const modal = document.getElementById('playerModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 400);
    }
}

function updateNowPlaying(isPlaying) {
    const badge = document.getElementById('nowPlayingBadge');
    if (badge) {
        if (isPlaying && currentTrack) {
            badge.style.display = 'flex';
            badge.innerHTML = `
                <span class="now-playing-dot"></span>
                <span>Now Playing</span>
            `;
        } else {
            badge.style.display = 'none';
        }
    }
}

// ============================================================
// PLAYER CONTROL FUNCTIONS
// ============================================================
function playMusic(videoId, encodedTrackData, contextData = null) {
    if (!videoId) { showToast('⚠️ Video ID tidak valid'); return; }
    
    try {
        if (currentTrack && currentTrack.videoId !== videoId) currentRepeatCount = 0;
        currentTrack = JSON.parse(decodeURIComponent(encodedTrackData));
        currentPlayContext = contextData;
        
        addToHistory(currentTrack);
        checkIfLiked(currentTrack.videoId);
        updatePlayerUI(currentTrack);
        updateHeroUI(currentTrack);
        updateMediaSession();
        updateNowPlaying(true);
        
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(videoId);
        }
        
        resetProgressUI();
        resetLyrics();
        
        const miniPlayer = document.getElementById('miniPlayer');
        if (miniPlayer) miniPlayer.style.display = 'flex';
        miniPlayer.classList.add('show');
        
        if (isLyricsVisible) {
            fetchLyrics(currentTrack.videoId);
        }
    } catch (e) {
        console.log('Play music error:', e);
        showToast('⚠️ Gagal memutar lagu');
    }
}

function updatePlayerUI(track) {
    const elements = {
        'miniPlayerImg': track.img,
        'playerArt': track.img,
        'menuArt': track.img,
        'playerBg': `url('${track.img}')`
    };
    
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'playerBg') {
                el.style.backgroundImage = value;
            } else {
                el.src = value;
            }
        }
    }
    
    const textElements = {
        'miniPlayerTitle': track.title,
        'playerTitle': track.title,
        'menuTitle': track.title,
        'miniPlayerArtist': track.artist,
        'playerArtist': track.artist,
        'menuArtist': track.artist
    };
    
    for (const [id, value] of Object.entries(textElements)) {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    }
}

function updateHeroUI(track) {
    const heroTitle = document.getElementById('heroTitle');
    if (heroTitle) heroTitle.innerText = track.title;
    
    const heroArtist = document.getElementById('heroArtist');
    if (heroArtist) heroArtist.innerText = track.artist;
    
    const heroCover = document.getElementById('heroCover');
    if (heroCover) heroCover.innerHTML = `<img src="${track.img}" alt="Cover">`;
}

function resetProgressUI() {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.value = 0;
    
    const miniProgress = document.getElementById('miniProgressBar');
    if (miniProgress) miniProgress.style.width = '0%';
    
    const heroProgress = document.getElementById('heroProgressBar');
    if (heroProgress) heroProgress.style.width = '0%';
    
    const currentTime = document.getElementById('currentTime');
    if (currentTime) currentTime.innerText = "0:00";
    
    const totalTime = document.getElementById('totalTime');
    if (totalTime) totalTime.innerText = "0:00";
}

function resetLyrics() {
    currentLyrics = [];
    currentLyricIndex = -1;
    const lyricsContainer = document.getElementById('lyricsContainer');
    if (lyricsContainer) {
        lyricsContainer.innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">Klik tombol untuk menampilkan lirik</div>';
    }
}

function addToHistory(track) {
    if (!db) return;
    try {
        const tx = db.transaction("history_songs", "readwrite");
        const store = tx.objectStore("history_songs");
        const newTrack = { ...track, timestamp: Date.now() };
        store.put(newTrack);
    } catch (e) {}
}

function playNextTrack(isManualClick = true) {
    if (isManualClick) currentRepeatCount = 0;
    
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
                let img = nextTrack.thumbnail || 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
                img = getHighResImage(img);
                const artist = nextTrack.artist || 'Unknown';
                const trackData = encodeURIComponent(JSON.stringify({
                    videoId: nextTrack.videoId,
                    title: nextTrack.title,
                    artist: artist,
                    img: img
                })).replace(/'/g, "%27");
                playMusic(nextTrack.videoId, trackData, null);
            }
        }
    } catch (error) {
        console.log('Play next similar error:', error);
    }
}

function playPrevTrack() {
    if (!currentTrack) return;
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0);
    } else {
        if (currentPlayContext && currentPlayContext.data && currentPlayContext.data.length > 0) {
            let currentIndex = currentPlayContext.data.findIndex(t => t.videoId === currentTrack.videoId);
            if (currentIndex > 0) {
                const prevTrack = currentPlayContext.data[currentIndex - 1];
                const trackData = encodeURIComponent(JSON.stringify(prevTrack)).replace(/'/g, "%27");
                playMusic(prevTrack.videoId, trackData, currentPlayContext);
            } else {
                showToast('⏮️ Awal playlist');
            }
        } else {
            showToast('⏮️ Tidak ada lagu sebelumnya');
        }
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('btnShuffle');
    if (btn) {
        btn.classList.toggle('active', isShuffle);
    }
    showToast(isShuffle ? "🔀 Acak dihidupkan" : "🔀 Acak dimatikan");
}

function toggleRepeat() {
    repeatState = (repeatState + 1) % 4;
    const btn = document.getElementById('btnRepeat');
    const badge = document.getElementById('repeatBadge');
    
    if (repeatState === 0) {
        if (btn) btn.classList.remove('active');
        if (badge) badge.style.display = 'none';
        showToast("🔁 Ulangi dimatikan");
    } else {
        if (btn) btn.classList.add('active');
        if (badge) badge.style.display = 'block';
        if (repeatState === 1) { badge.innerText = "1x"; showToast("🔁 Ulangi 1 kali"); }
        if (repeatState === 2) { badge.innerText = "3x"; showToast("🔁 Ulangi 3 kali"); }
        if (repeatState === 3) { badge.innerText = "∞"; showToast("🔁 Ulangi terus"); }
    }
}

function updateMediaSession() {
    if ('mediaSession' in navigator && currentTrack) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrack.title || 'Lagu',
                artist: currentTrack.artist || 'Artis',
                artwork: [{ src: currentTrack.img || 'https://placehold.co/512x512/282828/FFFFFF?text=Music', sizes: '512x512' }]
            });
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack(true));
            navigator.mediaSession.setActionHandler('previoustrack', playPrevTrack);
        } catch (e) {}
    }
}

// ============================================================
// LIKE SYSTEM
// ============================================================
function checkIfLiked(videoId) {
    if (!db) return;
    try {
        const tx = db.transaction("liked_songs", "readonly");
        const request = tx.objectStore("liked_songs").get(videoId);
        request.onsuccess = function() {
            const btnSvg = document.getElementById('btnLikeSong');
            if (btnSvg) {
                if (request.result) {
                    btnSvg.classList.add('liked');
                } else {
                    btnSvg.classList.remove('liked');
                }
            }
        };
    } catch (e) {}
}

function toggleLike() {
    if (!currentTrack || !db) return;
    const tx = db.transaction("liked_songs", "readwrite");
    const store = tx.objectStore("liked_songs");
    const getReq = store.get(currentTrack.videoId);
    getReq.onsuccess = function() {
        const btnSvg = document.getElementById('btnLikeSong');
        if (btnSvg) {
            if (getReq.result) {
                store.delete(currentTrack.videoId);
                btnSvg.classList.remove('liked');
                showToast("💔 Dihapus dari Suka");
            } else {
                store.put(currentTrack);
                btnSvg.classList.add('liked');
                showToast("❤️ Ditambahkan ke Suka");
            }
        }
        renderLibraryUI();
    };
}

// ============================================================
// MENU FUNCTIONS
// ============================================================
function openPlayerMenuModal() {
    if (!currentTrack) return;
    const menuArt = document.getElementById('menuArt');
    if (menuArt) menuArt.src = currentTrack.img;
    const menuTitle = document.getElementById('menuTitle');
    if (menuTitle) menuTitle.innerText = currentTrack.title;
    const menuArtist = document.getElementById('menuArtist');
    if (menuArtist) menuArtist.innerText = currentTrack.artist;
    const modal = document.getElementById('playerMenuModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

function closePlayerMenuModal() {
    const modal = document.getElementById('playerMenuModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function downloadCurrentTrack() {
    if (!currentTrack) return;
    showToast("💾 Menyiapkan metadata lagu untuk offline...");
    const tx = db.transaction("offline_songs", "readwrite");
    tx.objectStore("offline_songs").put(currentTrack);
    setTimeout(() => {
        showToast("✅ Selesai! Tersedia di Unduhan");
        renderLibraryUI();
    }, 2000);
    closePlayerMenuModal();
}

function downloadCurrentPlaylist() {
    if (!currentPlaylistTracks || currentPlaylistTracks.length === 0) return;
    showToast(`💾 Menyiapkan ${currentPlaylistTracks.length} lagu untuk offline...`);
    const tx = db.transaction("offline_songs", "readwrite");
    const store = tx.objectStore("offline_songs");
    currentPlaylistTracks.forEach(t => store.put(t));
    setTimeout(() => {
        showToast("✅ Selesai! Tersedia di Unduhan");
        renderLibraryUI();
    }, 3000);
}

function setSleepTimer() {
    const minutes = prompt("⏰ Matikan musik otomatis dalam berapa menit?", "15");
    if (minutes != null && !isNaN(minutes) && minutes > 0) {
        if (sleepTimerTimeout) clearTimeout(sleepTimerTimeout);
        sleepTimerTimeout = setTimeout(() => {
            if (ytPlayer && isPlaying) ytPlayer.pauseVideo();
            showToast("💤 Musik dimatikan (Sleep Timer)");
        }, minutes * 60000);
        showToast(`⏰ Timer diatur ${minutes} menit`);
    }
    closePlayerMenuModal();
}

function toggleFavoritLagu() {
    if (!currentTrack || !db) return;
    const tx = db.transaction("favorite_songs", "readwrite");
    const store = tx.objectStore("favorite_songs");
    const getReq = store.get(currentTrack.videoId);
    getReq.onsuccess = function() {
        if (getReq.result) {
            store.delete(currentTrack.videoId);
            showToast("⭐ Dihapus dari Favorit");
        } else {
            store.put(currentTrack);
            showToast("⭐ Ditambahkan ke Favorit");
        }
        renderLibraryUI();
        closePlayerMenuModal();
    };
}

function shareLagu() {
    if (navigator.share && currentTrack) {
        navigator.share({
            title: currentTrack.title,
            text: `🎵 Dengarkan ${currentTrack.title} oleh ${currentTrack.artist} di SoundFy!`,
            url: window.location.href
        }).catch(err => console.log('Share gagal', err));
    } else {
        showToast("📤 " + currentTrack.title + " - " + currentTrack.artist);
    }
    closePlayerMenuModal();
}

// ============================================================
// UI RENDER FUNCTIONS
// ============================================================
function createListHTML(track, context = null) {
    let img = track.thumbnail || track.img || 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
    img = getHighResImage(img);
    const artist = track.artist || 'Unknown';
    const trackData = encodeURIComponent(JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: artist,
        img: img
    })).replace(/'/g, "%27");
    const ctxString = context ? encodeURIComponent(JSON.stringify(context)).replace(/'/g, "%27") : 'null';
    
    return `
        <div class="track-item" onclick="playMusic('${track.videoId}', '${trackData}', ${ctxString !== 'null' ? `JSON.parse(decodeURIComponent('${ctxString}'))` : 'null'})">
            <img src="${img}" onerror="this.src='https://placehold.co/48x48/282828/FFFFFF?text=Music'">
            <div class="track-info">
                <div class="track-title">${track.title || 'Untitled'}</div>
                <div class="track-artist">${artist}</div>
            </div>
            <button class="track-play-btn" onclick="event.stopPropagation(); playMusic('${track.videoId}', '${trackData}', ${ctxString !== 'null' ? `JSON.parse(decodeURIComponent('${ctxString}'))` : 'null'})">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#1db954"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
        </div>
    `;
}

function createCardHTML(track, isArtist = false) {
    let img = track.thumbnail || track.img || 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
    img = getHighResImage(img);
    const artist = track.artist || 'Unknown';
    const trackData = encodeURIComponent(JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: artist,
        img: img
    })).replace(/'/g, "%27");
    const clickAction = isArtist ? `openArtistView('${track.title.replace(/'/g, "\\'")}')` : `playMusic('${track.videoId}', '${trackData}', null)`;
    const imgClass = isArtist ? 'card-img artist-img' : 'card-img';
    
    return `
        <div class="card" onclick="${clickAction}">
            <div class="card-image-wrapper">
                <img src="${img}" class="${imgClass}" onerror="this.src='https://placehold.co/140x140/282828/FFFFFF?text=Music'">
                <button class="card-play-btn" onclick="event.stopPropagation(); ${isArtist ? `openArtistView('${track.title.replace(/'/g, "\\'")}')` : `playMusic('${track.videoId}', '${trackData}', null)`}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </button>
            </div>
            <div class="card-title">${track.title || 'Untitled'}</div>
            <div class="card-sub">${isArtist ? 'Artis' : artist}</div>
        </div>
    `;
}

// ============================================================
// DATA FETCHING
// ============================================================
let homeDisplayedVideoIds = new Set();

async function fetchAndRender(query, containerId, formatType, isArtist = false, isHome = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        const response = await fetch(`${API.search}?query=${encodeURIComponent(query)}`);
        const result = await response.json();
        
        if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
            let limit = containerId === 'recentList' ? 4 : (formatType === 'list' ? 4 : 8);
            let tracks = [];
            
            for (let t of result.result.songs) {
                if (isHome) {
                    if (!homeDisplayedVideoIds.has(t.videoId)) {
                        tracks.push(t);
                        homeDisplayedVideoIds.add(t.videoId);
                    }
                } else {
                    tracks.push(t);
                }
                if (tracks.length >= limit) break;
            }
            
            let html = '';
            tracks.forEach(t => {
                t.title = t.title || 'Untitled';
                t.artist = t.artist || 'Unknown Artist';
                t.thumbnail = t.thumbnail || 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
                html += formatType === 'list' ? createListHTML(t) : createCardHTML(t, isArtist);
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="empty-state">📭 Tidak ada data</div>';
        }
    } catch (error) {
        console.log('Fetch error:', error);
        container.innerHTML = '<div class="empty-state">⚠️ Sedang Offline</div>';
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function loadHomeData() {
    homeDisplayedVideoIds.clear();
    fetchAndRender('lagu indonesia hits terbaru', 'rowAnyar', 'card', false, true);
    fetchAndRender('top 50 indonesia playlist update', 'rowCharts', 'card', false, true);
    fetchAndRender('penyanyi pop indonesia paling hits', 'rowArtists', 'card', true, true);
    fetchAndRender('lagu viral terbaru 2026', 'rowTiktok', 'card', false, true);
    fetchAndRender('lagu galau sedih indonesia', 'rowGalau', 'card', false, true);
}

function renderSearchCategories() {
    const categories = [
        { title: 'Pop', color: '#477d95', icon: '🎵' },
        { title: 'Indie', color: '#8d67ab', icon: '🎸' },
        { title: 'Indonesia', color: '#e8115b', icon: '🇮🇩' },
        { title: 'Hip Hop', color: '#f5a623', icon: '🎤' }
    ];
    
    let html = '';
    categories.forEach(cat => {
        html += `<div class="category-chip" style="background:${cat.color};" onclick="searchMusic('${cat.title}')">
            <span>${cat.icon}</span>
            <span>${cat.title}</span>
        </div>`;
    });
    
    const grid = document.getElementById('categoryGrid');
    if (grid) grid.innerHTML = html;
}

// ============================================================
// SEARCH FUNCTIONS
// ============================================================
let searchTimeout;

function handleSearchInput() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    const clearBtn = document.getElementById('searchClear');
    
    if (clearBtn) {
        clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
    }
    
    const categoriesUI = document.getElementById('searchCategoriesUI');
    const resultsUI = document.getElementById('searchResultsUI');
    
    if (query.length === 0) {
        if (categoriesUI) categoriesUI.style.display = 'block';
        if (resultsUI) resultsUI.style.display = 'none';
        return;
    }
    
    if (categoriesUI) categoriesUI.style.display = 'none';
    if (resultsUI) resultsUI.style.display = 'block';
    
    searchTimeout = setTimeout(async () => {
        const results = document.getElementById('searchResults');
        if (results) results.innerHTML = '<div class="loading-state">🔍 Mencari musik...</div>';
        
        try {
            const response = await fetch(`${API.search}?query=${encodeURIComponent(query)}`);
            const result = await response.json();
            
            if (results) {
                if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
                    let html = '';
                    result.result.songs.forEach(t => html += createListHTML(t));
                    results.innerHTML = html;
                } else {
                    results.innerHTML = '<div class="empty-state">😕 Tidak ada hasil</div>';
                }
            }
        } catch (error) {
            if (results) {
                results.innerHTML = '<div class="empty-state">⚠️ Anda Sedang Offline</div>';
            }
        }
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }, 800);
}

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
    }
});

function clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = '';
        const clearBtn = document.getElementById('searchClear');
        if (clearBtn) clearBtn.style.display = 'none';
        const categoriesUI = document.getElementById('searchCategoriesUI');
        if (categoriesUI) categoriesUI.style.display = 'block';
        const resultsUI = document.getElementById('searchResultsUI');
        if (resultsUI) resultsUI.style.display = 'none';
        input.focus();
    }
}

function searchMusic(query) {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = query;
        handleSearchInput();
        switchView('search');
    }
}

// ============================================================
// ARTIST FUNCTIONS
// ============================================================
async function openArtistView(artistName) {
    const display = document.getElementById('artistNameDisplay');
    if (display) display.innerText = artistName;
    
    const container = document.getElementById('artistTracksContainer');
    if (container) {
        container.innerHTML = '<div class="loading-state">⏳ Memuat lagu artis...</div>';
    }
    
    switchView('artist');
    
    try {
        const response = await fetch(`${API.search}?query=${encodeURIComponent(artistName + " official audio")}`);
        const result = await response.json();
        
        if (container) {
            if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
                let html = '';
                let ctx = { type: 'artist', data: result.result.songs };
                
                result.result.songs.forEach(track => {
                    track.title = track.title || 'Untitled';
                    track.artist = track.artist || 'Unknown Artist';
                    track.thumbnail = track.thumbnail || 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
                    html += createListHTML(track, ctx);
                });
                
                container.innerHTML = html;
                
                if (result.result.songs.length > 0) {
                    const firstTrack = result.result.songs[0];
                    const btn = document.querySelector('.artist-play-btn');
                    if (btn) {
                        const trackData = encodeURIComponent(JSON.stringify({
                            videoId: firstTrack.videoId,
                            title: firstTrack.title,
                            artist: firstTrack.artist || 'Unknown',
                            img: firstTrack.thumbnail || 'https://placehold.co/48x48/282828/FFFFFF?text=Music'
                        })).replace(/'/g, "%27");
                        const ctxString = encodeURIComponent(JSON.stringify(ctx)).replace(/'/g, "%27");
                        btn.setAttribute('onclick', `playMusic('${firstTrack.videoId}', '${trackData}', JSON.parse(decodeURIComponent('${ctxString}')))`);
                    }
                }
            } else {
                container.innerHTML = '<div class="empty-state">😕 Tidak ada lagu</div>';
            }
        }
    } catch (e) {
        if (container) {
            container.innerHTML = '<div class="empty-state">⚠️ Gagal memuat</div>';
        }
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function playFirstArtistTrack() {
    const container = document.getElementById('artistTracksContainer');
    if (container) {
        const first = container.querySelector('.track-item');
        if (first) first.click();
    }
}

// ============================================================
// LIBRARY FUNCTIONS
// ============================================================
function renderLibraryUI() {
    if (!db) return;
    
    try {
        const likedTx = db.transaction("liked_songs", "readonly");
        const likedReq = likedTx.objectStore("liked_songs").count();
        likedReq.onsuccess = function() {
            const el = document.getElementById('likedCount');
            if (el) el.innerText = likedReq.result + ' lagu';
        };
        
        const offlineTx = db.transaction("offline_songs", "readonly");
        const offlineReq = offlineTx.objectStore("offline_songs").count();
        offlineReq.onsuccess = function() {
            const el = document.getElementById('offlineCount');
            if (el) el.innerText = offlineReq.result + ' lagu';
        };
        
        const historyTx = db.transaction("history_songs", "readonly");
        const historyReq = historyTx.objectStore("history_songs").count();
        historyReq.onsuccess = function() {
            const el = document.getElementById('historyCount');
            if (el) el.innerText = historyReq.result + ' lagu';
        };
        
        // Render playlists
        const playlistTx = db.transaction("playlists", "readonly");
        const playlistReq = playlistTx.objectStore("playlists").getAll();
        playlistReq.onsuccess = function() {
            const container = document.getElementById('playlistGrid');
            if (!container) return;
            
            if (playlistReq.result.length === 0) {
                container.innerHTML = '<div class="empty-state">📭 Belum ada playlist</div>';
                return;
            }
            
            let html = '';
            playlistReq.result.forEach(p => {
                const img = p.img || 'https://placehold.co/120x120/282828/1db954?text=+';
                html += `
                    <div class="playlist-card" onclick="openPlaylistView('${p.id}')">
                        <img src="${img}" alt="${p.name}">
                        <div class="playlist-card-title">${p.name}</div>
                        <div class="playlist-card-count">${p.tracks ? p.tracks.length : 0} lagu</div>
                    </div>
                `;
            });
            container.innerHTML = html;
        };
    } catch (e) {}
}

function openPlaylistView(id) {
    activePlaylistId = id;
    isEditMode = false;
    
    const bar = document.getElementById('bulkActionBar');
    if (bar) bar.style.display = 'none';
    
    switchView('playlist');
    
    const container = document.getElementById('playlistTracksContainer');
    if (container) {
        container.innerHTML = '<div class="loading-state">⏳ Memuat daftar lagu...</div>';
    }
    
    const nameDisplay = document.getElementById('playlistNameDisplay');
    if (nameDisplay) {
        const names = {
            'liked': '❤️ Disukai',
            'offline': '💾 Diunduh',
            'history': '🕐 Riwayat',
            'top50': '🏆 Teratas Saya 50',
            'uploaded': '📤 Diunggah'
        };
        nameDisplay.innerText = names[id] || '📀 Playlist';
    }
    
    if (id === 'liked') {
        const tx = db.transaction("liked_songs", "readonly");
        const req = tx.objectStore("liked_songs").getAll();
        req.onsuccess = () => processPlaylistData(req.result, 'liked');
    } else if (id === 'offline') {
        const tx = db.transaction("offline_songs", "readonly");
        const req = tx.objectStore("offline_songs").getAll();
        req.onsuccess = () => processPlaylistData(req.result, 'offline');
    } else if (id === 'history') {
        const tx = db.transaction("history_songs", "readonly");
        const req = tx.objectStore("history_songs").getAll();
        req.onsuccess = () => {
            const histData = req.result.sort((a, b) => b.timestamp - a.timestamp);
            processPlaylistData(histData, 'history');
        };
    } else if (id === 'top50' || id === 'uploaded') {
        if (container) {
            container.innerHTML = '<div class="empty-state">📭 Fitur segera hadir</div>';
        }
        const stats = document.getElementById('playlistStatsDisplay');
        if (stats) stats.innerText = '0 lagu';
    } else {
        const tx = db.transaction("playlists", "readonly");
        const req = tx.objectStore("playlists").get(id);
        req.onsuccess = () => {
            const p = req.result;
            if (p && nameDisplay) nameDisplay.innerText = "📀 " + p.name;
            processPlaylistData(p ? p.tracks || [] : [], 'playlist');
        };
    }
}

function processPlaylistData(dataArr, typeId) {
    currentPlaylistTracks = dataArr || [];
    
    const stats = document.getElementById('playlistStatsDisplay');
    if (stats) stats.innerText = currentPlaylistTracks.length + ' lagu';
    
    const container = document.getElementById('playlistTracksContainer');
    if (!container) return;
    
    if (currentPlaylistTracks.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Daftar ini masih kosong.</div>';
        return;
    }
    
    let html = '';
    let ctx = { type: typeId, data: currentPlaylistTracks };
    
    currentPlaylistTracks.forEach(t => {
        let img = t.thumbnail || t.img || 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
        img = getHighResImage(img);
        const artist = t.artist || 'Unknown';
        
        html += `
            <div class="track-item" onclick="playMusic('${t.videoId}', '${encodeURIComponent(JSON.stringify({
                videoId: t.videoId,
                title: t.title || 'Untitled',
                artist: artist,
                img: img
            }))}', ${JSON.stringify(ctx).replace(/'/g, "%27")})">
                <img src="${img}" onerror="this.src='https://placehold.co/48x48/282828/FFFFFF?text=Music'">
                <div class="track-info">
                    <div class="track-title">${t.title || 'Untitled'}</div>
                    <div class="track-artist">${artist}</div>
                </div>
                <button class="track-play-btn" onclick="event.stopPropagation(); playMusic('${t.videoId}', '${encodeURIComponent(JSON.stringify({
                    videoId: t.videoId,
                    title: t.title || 'Untitled',
                    artist: artist,
                    img: img
                }))}', ${JSON.stringify(ctx).replace(/'/g, "%27")})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#1db954"><polygon points="5,3 19,12 5,21"/></svg>
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function playFirstPlaylistTrack() {
    if (currentPlaylistTracks && currentPlaylistTracks.length > 0) {
        const firstTrack = currentPlaylistTracks[0];
        const trackData = encodeURIComponent(JSON.stringify(firstTrack)).replace(/'/g, "%27");
        const ctxString = encodeURIComponent(JSON.stringify({ type: 'auto', data: currentPlaylistTracks })).replace(/'/g, "%27");
        playMusic(firstTrack.videoId, trackData, JSON.parse(decodeURIComponent(ctxString)));
    }
}

// ============================================================
// PLAYLIST CRUD
// ============================================================
let base64PlaylistImage = '';

function openCreatePlaylist() {
    const modal = document.getElementById('createPlaylistModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

function closeCreatePlaylist() {
    const modal = document.getElementById('createPlaylistModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
    const name = document.getElementById('cpName');
    if (name) name.value = '';
    const preview = document.getElementById('cpPreview');
    if (preview) preview.src = 'https://placehold.co/120x120/282828/1db954?text=+';
    base64PlaylistImage = '';
}

function previewImage(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
        const preview = document.getElementById('cpPreview');
        if (preview) preview.src = reader.result;
        base64PlaylistImage = reader.result;
    };
    if (file) reader.readAsDataURL(file);
}

function saveNewPlaylist() {
    const nameInput = document.getElementById('cpName');
    const name = (nameInput ? nameInput.value : '') || "Playlist baruku";
    const newPlaylist = {
        id: Date.now().toString(),
        name: name,
        img: base64PlaylistImage,
        tracks: []
    };
    
    const tx = db.transaction("playlists", "readwrite");
    tx.objectStore("playlists").put(newPlaylist);
    tx.oncomplete = function() {
        closeCreatePlaylist();
        renderLibraryUI();
        showToast('✅ Playlist "' + name + '" dibuat');
    };
}

// ============================================================
// ADD TO PLAYLIST
// ============================================================
function openAddToPlaylistModal() {
    if (!currentTrack) return;
    
    const tx = db.transaction("playlists", "readonly");
    const req = tx.objectStore("playlists").getAll();
    req.onsuccess = () => {
        let html = '';
        
        req.result.forEach(p => {
            html += `
                <div class="playlist-select-item" onclick="addTrackToPlaylist('${p.id}')">
                    <div class="playlist-select-icon">📀</div>
                    <div class="playlist-select-info">
                        <span class="playlist-select-name">${p.name}</span>
                        <span class="playlist-select-count">${p.tracks ? p.tracks.length : 0} lagu</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
                </div>
            `;
        });
        
        const list = document.getElementById('addToPlaylistList');
        if (list) {
            if (req.result.length === 0) {
                list.innerHTML = '<div class="empty-state">📭 Belum ada playlist. Buat dulu di Pustaka.</div>';
            } else {
                list.innerHTML = html;
            }
        }
        
        const modal = document.getElementById('addToPlaylistModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    };
}

function closeAddToPlaylistModal() {
    const modal = document.getElementById('addToPlaylistModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function addTrackToPlaylist(playlistId) {
    if (!currentTrack) return;
    
    const tx = db.transaction("playlists", "readwrite");
    const store = tx.objectStore("playlists");
    const req = store.get(playlistId);
    req.onsuccess = () => {
        const p = req.result;
        if (!p) return;
        if (!p.tracks) p.tracks = [];
        
        if (!p.tracks.find(t => t.videoId === currentTrack.videoId)) {
            p.tracks.push(currentTrack);
            store.put(p);
            showToast('✅ Ditambahkan ke ' + p.name);
        } else {
            showToast('⚠️ Sudah ada di ' + p.name);
        }
        closeAddToPlaylistModal();
        renderLibraryUI();
    };
}

// ============================================================
// MULTI-DELETE
// ============================================================
function toggleEditMode() {
    isEditMode = !isEditMode;
    selectedTracksForDelete.clear();
    
    document.querySelectorAll('#playlistTracksContainer .track-item').forEach(item => {
        if (isEditMode) {
            item.style.borderLeft = '3px solid #1db954';
            item.style.cursor = 'pointer';
        } else {
            item.style.borderLeft = 'none';
        }
    });
    
    const bar = document.getElementById('bulkActionBar');
    if (isEditMode && bar) {
        bar.style.display = 'flex';
        updateDeleteCount();
    } else if (bar) {
        bar.style.display = 'none';
    }
}

function handleCheckDelete(videoId, isChecked) {
    if (isChecked) selectedTracksForDelete.add(videoId);
    else selectedTracksForDelete.delete(videoId);
    updateDeleteCount();
}

function updateDeleteCount() {
    const el = document.getElementById('selCountText');
    if (el) el.innerText = `${selectedTracksForDelete.size} lagu dipilih`;
}

function deleteSelectedTracks() {
    if (selectedTracksForDelete.size === 0) {
        showToast("⚠️ Pilih minimal satu lagu untuk dihapus");
        return;
    }
    
    let storeName = "";
    if (activePlaylistId === 'liked') storeName = "liked_songs";
    else if (activePlaylistId === 'favorite') storeName = "favorite_songs";
    else if (activePlaylistId === 'history') storeName = "history_songs";
    else if (activePlaylistId === 'offline') storeName = "offline_songs";
    
    if (storeName) {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        
        selectedTracksForDelete.forEach(id => {
            if (activePlaylistId === 'history') {
                const req = store.openCursor();
                req.onsuccess = function(e) {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value.videoId === id) cursor.delete();
                        cursor.continue();
                    }
                };
            } else {
                store.delete(id);
            }
        });
        
        tx.oncomplete = () => {
            showToast(`🗑️ ${selectedTracksForDelete.size} lagu dihapus`);
            openPlaylistView(activePlaylistId);
        };
    } else {
        const tx = db.transaction("playlists", "readwrite");
        const store = tx.objectStore("playlists");
        const req = store.get(activePlaylistId);
        req.onsuccess = () => {
            const p = req.result;
            if (p) {
                p.tracks = p.tracks.filter(t => !selectedTracksForDelete.has(t.videoId));
                store.put(p);
                showToast(`🗑️ ${selectedTracksForDelete.size} lagu dihapus dari Playlist`);
                openPlaylistView(activePlaylistId);
            }
        };
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
        const container = document.getElementById('lyricsContainer');
        
        if (container) {
            if (result.status === true && result.result && result.result.lyrics && result.result.lyrics.lines && result.result.lyrics.lines.length > 0) {
                currentLyrics = result.result.lyrics.lines;
                renderLyrics(currentLyrics);
            } else {
                currentLyrics = [];
                container.innerHTML = '<div class="empty-state">🎤 Lirik tidak tersedia</div>';
            }
        }
    } catch (error) {
        console.error('Lyrics fetch error:', error);
        const container = document.getElementById('lyricsContainer');
        if (container) {
            container.innerHTML = '<div class="empty-state">⚠️ Gagal memuat lirik</div>';
        }
    }
}

function renderLyrics(lines) {
    const container = document.getElementById('lyricsContainer');
    if (!container) return;
    
    if (!lines || lines.length === 0) {
        container.innerHTML = '<div class="empty-state">🎤 Lirik tidak tersedia</div>';
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
        if (container) container.style.display = 'block';
        if (btn) btn.classList.add('active');
        if (btnText) btnText.textContent = 'Sembunyikan';
        
        if (currentLyrics.length === 0 && currentTrack) {
            fetchLyrics(currentTrack.videoId);
        }
        
        if (ytPlayer && ytPlayer.getCurrentTime) {
            try {
                const currentTime = ytPlayer.getCurrentTime() || 0;
                updateLyrics(currentTime);
            } catch (e) {}
        }
    } else {
        if (container) container.style.display = 'none';
        if (btn) btn.classList.remove('active');
        if (btnText) btnText.textContent = 'Tampilkan Lirik';
    }
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================
function setQuickFilter(filter) {
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
    const chips = document.querySelectorAll('.filter-chip');
    const map = { 'all': 0, 'chill': 1, 'focus': 2, 'commute': 3, 'gaming': 4 };
    const idx = map[filter];
    if (idx !== undefined && chips[idx]) chips[idx].classList.add('active');
    showToast(`🎯 Filter: ${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
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
    if (text) {
        text.innerText = text.innerText === 'Terbaru' ? 'Terlama' : 'Terbaru';
    }
}

function importPlaylist() {
    showToast('📥 Fitur impor playlist sedang dalam pengembangan');
}

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast('✅ Aplikasi berhasil diinstall!');
                const installBtn = document.getElementById('installAppBtn');
                if (installBtn) installBtn.style.display = 'none';
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

console.log('🎵 SoundFy Music Player Loaded!');
console.log('👨‍💻 Developer: Zerozx');
