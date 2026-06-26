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
// SPLASH SCREEN
// ============================================================
(function initSplash() {
    const fill = document.getElementById('splashProgressFill');
    const text = document.getElementById('splashProgressText');
    if (!fill || !text) return;
    
    let progress = 0;
    const timer = setInterval(() => {
        progress += 2;
        if (progress >= 100) {
            progress = 100;
            clearInterval(timer);
            setTimeout(() => {
                const splash = document.getElementById('splash-screen');
                if (splash) {
                    splash.classList.add('hide');
                    setTimeout(() => {
                        if (splash && splash.parentNode) {
                            splash.parentNode.removeChild(splash);
                        }
                    }, 600);
                }
            }, 300);
        }
        fill.style.width = progress + '%';
        text.textContent = Math.floor(progress);
    }, 30);
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
    switchView('home');
    if (typeof lucide !== 'undefined') lucide.createIcons();
});

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        switchView(e.state.view, false);
    } else {
        switchView('home', false);
    }
});

function switchView(viewName, pushState) {
    if (pushState === undefined) pushState = true;
    
    document.querySelectorAll('.view-section').forEach(function(el) {
        el.classList.remove('active');
    });
    
    var target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(function(el) {
        el.classList.remove('active');
    });
    
    var navMap = { home: 0, search: 1, library: 2, developer: 3 };
    var idx = navMap[viewName];
    if (idx !== undefined) {
        var navItems = document.querySelectorAll('.nav-item');
        if (navItems[idx]) navItems[idx].classList.add('active');
    }
    
    if (viewName === 'library') renderLibraryUI();
    if (viewName === 'developer') {
        var installBtn = document.getElementById('installAppBtn');
        if (installBtn && deferredPrompt) installBtn.style.display = 'flex';
    }
    
    window.scrollTo(0, 0);
    if (pushState) {
        history.pushState({ view: viewName }, '', '#' + viewName);
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openNowPlaying() {
    switchView('nowplaying');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================================
// INDEXEDDB
// ============================================================
var db;
var request = indexedDB.open("SoundFyDB", 2);
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
var ytPlayer = null;
var isPlaying = false;
var currentTrack = null;
var progressInterval = null;
var isShuffle = false;
var repeatState = 0;
var currentRepeatCount = 0;
var currentPlayContext = null;
var sleepTimerTimeout = null;
var isEditMode = false;
var selectedTracksForDelete = new Set();
var currentPlaylistTracks = [];
var activePlaylistId = null;
var currentLyrics = [];
var isLyricsVisible = false;
var currentLyricIndex = -1;

// ============================================================
// UTILITY
// ============================================================
function getHighResImage(url) {
    if (!url) return 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
    if (url.match(/=w\d+-h\d+/)) {
        return url.replace(/=w\d+-h\d+[^&]*/g, '=w512-h512-l90-rj');
    }
    return url;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

var toastTimeout = null;
function showToast(message) {
    var toast = document.getElementById('customToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function() {
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
            'onReady': function() { console.log('Player Ready'); },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    var mainBtn = document.getElementById('mainPlayBtn');
    var miniBtn = document.getElementById('miniPlayBtn');
    var npBtn = document.getElementById('npPlayBtn');
    var play = "M8 5v14l11-7z";
    var pause = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";

    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        if (mainBtn) mainBtn.innerHTML = '<path d="' + pause + '"></path>';
        if (miniBtn) miniBtn.innerHTML = '<path d="' + pause + '"></path>';
        if (npBtn) npBtn.innerHTML = '<path d="' + pause + '"></path>';
        startProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (event.data == YT.PlayerState.PAUSED) {
        isPlaying = false;
        if (mainBtn) mainBtn.innerHTML = '<path d="' + play + '"></path>';
        if (miniBtn) miniBtn.innerHTML = '<path d="' + play + '"></path>';
        if (npBtn) npBtn.innerHTML = '<path d="' + play + '"></path>';
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (event.data == YT.PlayerState.ENDED) {
        isPlaying = false;
        if (mainBtn) mainBtn.innerHTML = '<path d="' + play + '"></path>';
        if (miniBtn) miniBtn.innerHTML = '<path d="' + play + '"></path>';
        if (npBtn) npBtn.innerHTML = '<path d="' + play + '"></path>';
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
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
    progressInterval = setInterval(function() {
        if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
            try {
                var current = ytPlayer.getCurrentTime();
                var duration = ytPlayer.getDuration();
                if (duration > 0) {
                    var percent = (current / duration) * 100;
                    
                    var pb = document.getElementById('progressBar');
                    if (pb) {
                        pb.value = percent;
                        pb.style.background = 'linear-gradient(to right, #1db954 ' + percent + '%, rgba(255,255,255,0.08) ' + percent + '%)';
                    }
                    
                    var np = document.getElementById('npProgress');
                    if (np) np.value = percent;
                    
                    var mp = document.getElementById('miniProgressBar');
                    if (mp) mp.style.width = percent + '%';
                    
                    var hp = document.getElementById('heroProgressBar');
                    if (hp) hp.style.width = percent + '%';
                    
                    var ct = document.getElementById('currentTime');
                    if (ct) ct.textContent = formatTime(current);
                    
                    var npc = document.getElementById('npCurrent');
                    if (npc) npc.textContent = formatTime(current);
                    
                    var tt = document.getElementById('totalTime');
                    if (tt) tt.textContent = formatTime(duration);
                    
                    var npt = document.getElementById('npTotal');
                    if (npt) npt.textContent = formatTime(duration);
                    
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
            var duration = ytPlayer.getDuration();
            var seekTime = (value / 100) * duration;
            ytPlayer.seekTo(seekTime, true);
            var percent = value;
            
            var pb = document.getElementById('progressBar');
            if (pb) {
                pb.style.background = 'linear-gradient(to right, #1db954 ' + percent + '%, rgba(255,255,255,0.08) ' + percent + '%)';
            }
            
            var np = document.getElementById('npProgress');
            if (np) np.value = percent;
            
            var mp = document.getElementById('miniProgressBar');
            if (mp) mp.style.width = percent + '%';
            
            var hp = document.getElementById('heroProgressBar');
            if (hp) hp.style.width = percent + '%';
        } catch (e) {}
    }
}

function expandPlayer() {
    var modal = document.getElementById('playerModal');
    if (modal) modal.style.display = 'flex';
    var hp = document.getElementById('heroProgressBar');
    if (hp) hp.style.display = 'none';
}

function minimizePlayer() {
    var modal = document.getElementById('playerModal');
    if (modal) modal.style.display = 'none';
    var hp = document.getElementById('heroProgressBar');
    if (hp) hp.style.display = 'block';
}

// ============================================================
// PLAY MUSIC
// ============================================================
function playMusic(videoId, encodedTrackData, contextData) {
    if (!videoId) { showToast('⚠️ Video ID tidak valid'); return; }
    
    try {
        if (currentTrack && currentTrack.videoId !== videoId) {
            currentRepeatCount = 0;
        }
        
        currentTrack = JSON.parse(decodeURIComponent(encodedTrackData));
        currentPlayContext = contextData || null;
        
        addToHistory(currentTrack);
        checkIfLiked(currentTrack.videoId);
        updatePlayerUI(currentTrack);
        updateHeroUI(currentTrack);
        updateNowPlayingUI(currentTrack);
        updateMediaSession();
        
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(videoId);
        }
        
        resetProgressUI();
        resetLyrics();
        
        var mini = document.getElementById('miniPlayer');
        if (mini) mini.style.display = 'flex';
        
        if (isLyricsVisible) {
            fetchLyrics(currentTrack.videoId);
        }
    } catch (e) {
        console.log('Play error:', e);
        showToast('⚠️ Gagal memutar lagu');
    }
}

function updatePlayerUI(track) {
    var imgElements = ['miniPlayerImg', 'playerArt', 'menuArt', 'npArt'];
    imgElements.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.src = track.img;
    });
    
    var bg = document.getElementById('playerBg');
    if (bg) bg.style.backgroundImage = 'url(' + track.img + ')';
    
    var textElements = {
        'miniPlayerTitle': track.title,
        'playerTitle': track.title,
        'menuTitle': track.title,
        'npTitle': track.title,
        'miniPlayerArtist': track.artist,
        'playerArtist': track.artist,
        'menuArtist': track.artist,
        'npArtist': track.artist
    };
    
    for (var key in textElements) {
        var el = document.getElementById(key);
        if (el) el.textContent = textElements[key];
    }
}

function updateHeroUI(track) {
    var title = document.getElementById('heroTitle');
    if (title) title.textContent = track.title;
    
    var artist = document.getElementById('heroArtist');
    if (artist) artist.textContent = track.artist;
    
    var cover = document.getElementById('heroCover');
    if (cover) cover.innerHTML = '<img src="' + track.img + '" alt="Cover">';
}

function updateNowPlayingUI(track) {
    var title = document.getElementById('npTitle');
    if (title) title.textContent = track.title;
    
    var artist = document.getElementById('npArtist');
    if (artist) artist.textContent = track.artist;
    
    var art = document.getElementById('npArt');
    if (art) art.src = track.img;
}

function resetProgressUI() {
    var pb = document.getElementById('progressBar');
    if (pb) pb.value = 0;
    
    var np = document.getElementById('npProgress');
    if (np) np.value = 0;
    
    var mp = document.getElementById('miniProgressBar');
    if (mp) mp.style.width = '0%';
    
    var hp = document.getElementById('heroProgressBar');
    if (hp) hp.style.width = '0%';
    
    var ct = document.getElementById('currentTime');
    if (ct) ct.textContent = '0:00';
    
    var npc = document.getElementById('npCurrent');
    if (npc) npc.textContent = '0:00';
    
    var tt = document.getElementById('totalTime');
    if (tt) tt.textContent = '0:00';
    
    var npt = document.getElementById('npTotal');
    if (npt) npt.textContent = '0:00';
}

function resetLyrics() {
    currentLyrics = [];
    currentLyricIndex = -1;
    var container = document.getElementById('lyricsContainer');
    if (container) {
        container.innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">Klik tombol untuk menampilkan lirik</div>';
    }
}

function addToHistory(track) {
    if (!db) return;
    try {
        var tx = db.transaction('history_songs', 'readwrite');
        var store = tx.objectStore('history_songs');
        var newTrack = { 
            videoId: track.videoId,
            title: track.title,
            artist: track.artist,
            img: track.img,
            timestamp: Date.now()
        };
        store.put(newTrack);
    } catch (e) {}
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
            navigator.mediaSession.setActionHandler('nexttrack', function() { playNextTrack(true); });
        } catch (e) {}
    }
}

// ============================================================
// PLAYER CONTROL
// ============================================================
function playNextTrack(isManual) {
    if (isManual) currentRepeatCount = 0;
    
    if (currentPlayContext && currentPlayContext.data && currentPlayContext.data.length > 0) {
        if (isShuffle) {
            var randomTrack = currentPlayContext.data[Math.floor(Math.random() * currentPlayContext.data.length)];
            var trackData = encodeURIComponent(JSON.stringify(randomTrack)).replace(/'/g, '%27');
            playMusic(randomTrack.videoId, trackData, currentPlayContext);
            return;
        }
        
        var currentIndex = currentPlayContext.data.findIndex(function(t) {
            return t.videoId === currentTrack.videoId;
        });
        
        if (currentIndex !== -1 && currentIndex + 1 < currentPlayContext.data.length) {
            var nextTrack = currentPlayContext.data[currentIndex + 1];
            var trackData = encodeURIComponent(JSON.stringify(nextTrack)).replace(/'/g, '%27');
            playMusic(nextTrack.videoId, trackData, currentPlayContext);
            return;
        }
    }
    
    playNextSimilarSong();
}

async function playNextSimilarSong() {
    if (!currentTrack) return;
    try {
        var response = await fetch(API.search + '?query=' + encodeURIComponent(currentTrack.artist + ' official audio'));
        var result = await response.json();
        if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
            var relatedSongs = result.result.songs.filter(function(t) {
                return t.videoId !== currentTrack.videoId;
            });
            if (relatedSongs.length > 0) {
                var nextTrack = relatedSongs[Math.floor(Math.random() * relatedSongs.length)];
                var img = nextTrack.thumbnail || 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
                img = getHighResImage(img);
                var artist = nextTrack.artist || 'Unknown';
                var trackData = encodeURIComponent(JSON.stringify({
                    videoId: nextTrack.videoId,
                    title: nextTrack.title,
                    artist: artist,
                    img: img
                })).replace(/'/g, '%27');
                playMusic(nextTrack.videoId, trackData, null);
            }
        }
    } catch (e) {
        console.log('Play next error:', e);
    }
}

function playPrevTrack() {
    if (!currentTrack) return;
    
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0);
        return;
    }
    
    if (currentPlayContext && currentPlayContext.data && currentPlayContext.data.length > 0) {
        var currentIndex = currentPlayContext.data.findIndex(function(t) {
            return t.videoId === currentTrack.videoId;
        });
        if (currentIndex > 0) {
            var prevTrack = currentPlayContext.data[currentIndex - 1];
            var trackData = encodeURIComponent(JSON.stringify(prevTrack)).replace(/'/g, '%27');
            playMusic(prevTrack.videoId, trackData, currentPlayContext);
        } else {
            showToast('⏮️ Awal playlist');
        }
    } else {
        showToast('⏮️ Tidak ada lagu sebelumnya');
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    var btn = document.getElementById('btnShuffle');
    if (btn) {
        btn.style.color = isShuffle ? '#1db954' : 'var(--text-sub)';
    }
    showToast(isShuffle ? '🔀 Acak dihidupkan' : '🔀 Acak dimatikan');
}

function toggleRepeat() {
    repeatState = (repeatState + 1) % 4;
    var btn = document.getElementById('btnRepeat');
    var badge = document.getElementById('repeatBadge');
    
    if (repeatState === 0) {
        if (btn) btn.style.color = 'var(--text-sub)';
        if (badge) badge.style.display = 'none';
        showToast('🔁 Ulangi dimatikan');
    } else {
        if (btn) btn.style.color = '#1db954';
        if (badge) badge.style.display = 'block';
        if (repeatState === 1) { badge.textContent = '1x'; showToast('🔁 Ulangi 1 kali'); }
        if (repeatState === 2) { badge.textContent = '3x'; showToast('🔁 Ulangi 3 kali'); }
        if (repeatState === 3) { badge.textContent = '∞'; showToast('🔁 Ulangi terus'); }
    }
}

// ============================================================
// LIKE
// ============================================================
function checkIfLiked(videoId) {
    if (!db) return;
    try {
        var tx = db.transaction('liked_songs', 'readonly');
        var req = tx.objectStore('liked_songs').get(videoId);
        req.onsuccess = function() {
            var btn = document.getElementById('btnLikeSong');
            if (btn) {
                if (req.result) {
                    btn.style.fill = '#1db954';
                    btn.style.stroke = '#1db954';
                } else {
                    btn.style.fill = 'transparent';
                    btn.style.stroke = 'white';
                }
            }
        };
    } catch (e) {}
}

function toggleLike() {
    if (!currentTrack || !db) return;
    var tx = db.transaction('liked_songs', 'readwrite');
    var store = tx.objectStore('liked_songs');
    var req = store.get(currentTrack.videoId);
    req.onsuccess = function() {
        var btn = document.getElementById('btnLikeSong');
        if (btn) {
            if (req.result) {
                store.delete(currentTrack.videoId);
                btn.style.fill = 'transparent';
                btn.style.stroke = 'white';
                showToast('💔 Dihapus dari Suka');
            } else {
                store.put(currentTrack);
                btn.style.fill = '#1db954';
                btn.style.stroke = '#1db954';
                showToast('❤️ Ditambahkan ke Suka');
            }
        }
        renderLibraryUI();
    };
}

// ============================================================
// MENU
// ============================================================
function openPlayerMenuModal() {
    if (!currentTrack) return;
    var art = document.getElementById('menuArt');
    if (art) art.src = currentTrack.img;
    var title = document.getElementById('menuTitle');
    if (title) title.textContent = currentTrack.title;
    var artist = document.getElementById('menuArtist');
    if (artist) artist.textContent = currentTrack.artist;
    var modal = document.getElementById('playerMenuModal');
    if (modal) modal.style.display = 'flex';
}

function closePlayerMenuModal() {
    var modal = document.getElementById('playerMenuModal');
    if (modal) modal.style.display = 'none';
}

function downloadCurrentTrack() {
    if (!currentTrack) return;
    showToast('💾 Menyimpan untuk offline...');
    var tx = db.transaction('offline_songs', 'readwrite');
    tx.objectStore('offline_songs').put(currentTrack);
    setTimeout(function() {
        showToast('✅ Tersedia di Unduhan');
        renderLibraryUI();
    }, 2000);
    closePlayerMenuModal();
}

function downloadCurrentPlaylist() {
    if (!currentPlaylistTracks || currentPlaylistTracks.length === 0) return;
    showToast('💾 Menyiapkan ' + currentPlaylistTracks.length + ' lagu...');
    var tx = db.transaction('offline_songs', 'readwrite');
    var store = tx.objectStore('offline_songs');
    currentPlaylistTracks.forEach(function(t) { store.put(t); });
    setTimeout(function() {
        showToast('✅ Selesai! Tersedia di Unduhan');
        renderLibraryUI();
    }, 3000);
}

function setSleepTimer() {
    var minutes = prompt('⏰ Matikan musik otomatis dalam berapa menit?', '15');
    if (minutes != null && !isNaN(minutes) && minutes > 0) {
        if (sleepTimerTimeout) clearTimeout(sleepTimerTimeout);
        sleepTimerTimeout = setTimeout(function() {
            if (ytPlayer && isPlaying) ytPlayer.pauseVideo();
            showToast('💤 Musik dimatikan (Sleep Timer)');
        }, minutes * 60000);
        showToast('⏰ Timer diatur ' + minutes + ' menit');
    }
    closePlayerMenuModal();
}

function toggleFavoritLagu() {
    if (!currentTrack || !db) return;
    var tx = db.transaction('favorite_songs', 'readwrite');
    var store = tx.objectStore('favorite_songs');
    var req = store.get(currentTrack.videoId);
    req.onsuccess = function() {
        if (req.result) {
            store.delete(currentTrack.videoId);
            showToast('⭐ Dihapus dari Favorit');
        } else {
            store.put(currentTrack);
            showToast('⭐ Ditambahkan ke Favorit');
        }
        renderLibraryUI();
        closePlayerMenuModal();
    };
}

function shareLagu() {
    if (navigator.share && currentTrack) {
        navigator.share({
            title: currentTrack.title,
            text: '🎵 Dengarkan ' + currentTrack.title + ' oleh ' + currentTrack.artist + ' di SoundFy!',
            url: window.location.href
        }).catch(function() {});
    } else {
        showToast('📤 ' + currentTrack.title + ' - ' + currentTrack.artist);
    }
    closePlayerMenuModal();
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function createListHTML(track, context) {
    var img = track.thumbnail || track.img || 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
    img = getHighResImage(img);
    var artist = track.artist || 'Unknown';
    var trackData = encodeURIComponent(JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: artist,
        img: img
    })).replace(/'/g, '%27');
    var ctxStr = context ? encodeURIComponent(JSON.stringify(context)).replace(/'/g, '%27') : 'null';
    
    return '<div class="v-item" onclick="playMusic(\'' + track.videoId + '\', \'' + trackData + '\', ' + (ctxStr !== 'null' ? 'JSON.parse(decodeURIComponent(\'' + ctxStr + '\'))' : 'null') + ')">' +
        '<img src="' + img + '" onerror="this.src=\'https://placehold.co/48x48/282828/FFFFFF?text=Music\'">' +
        '<div class="info">' +
            '<div class="title">' + (track.title || 'Untitled') + '</div>' +
            '<div class="artist">' + artist + '</div>' +
        '</div>' +
        '<span class="dots">⋯</span>' +
    '</div>';
}

function createCardHTML(track, isArtist) {
    var img = track.thumbnail || track.img || 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
    img = getHighResImage(img);
    var artist = track.artist || 'Unknown';
    var trackData = encodeURIComponent(JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: artist,
        img: img
    })).replace(/'/g, '%27');
    var clickAction = isArtist ? 'openArtistView(\'' + track.title.replace(/'/g, "\\'") + '\')' : 'playMusic(\'' + track.videoId + '\', \'' + trackData + '\', null)';
    var imgClass = isArtist ? 'h-img artist-img' : 'h-img';
    
    return '<div class="h-card" onclick="' + clickAction + '">' +
        '<img src="' + img + '" class="' + imgClass + '" onerror="this.src=\'https://placehold.co/140x140/282828/FFFFFF?text=Music\'">' +
        '<div class="h-title">' + (track.title || 'Untitled') + '</div>' +
        '<div class="h-sub">' + (isArtist ? 'Artis' : artist) + '</div>' +
    '</div>';
}

function createQuickItemHTML(track, index) {
    var img = track.thumbnail || track.img || 'https://placehold.co/44x44/282828/FFFFFF?text=Music';
    img = getHighResImage(img);
    var artist = track.artist || 'Unknown';
    var trackData = encodeURIComponent(JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: artist,
        img: img
    })).replace(/'/g, '%27');
    
    return '<div class="quick-item" onclick="playMusic(\'' + track.videoId + '\', \'' + trackData + '\', null)">' +
        '<span class="rank">' + (index + 1) + '</span>' +
        '<img src="' + img + '" onerror="this.src=\'https://placehold.co/44x44/282828/FFFFFF?text=Music\'">' +
        '<div class="info">' +
            '<div class="title">' + (track.title || 'Untitled') + '</div>' +
            '<div class="artist">' + artist + '</div>' +
        '</div>' +
        '<div class="play-btn"><svg viewBox="0 0 24 24" fill="black" width="16" height="16"><path d="M8 5v14l11-7z"/></svg></div>' +
    '</div>';
}

function createCommunityItemHTML(track) {
    var img = track.thumbnail || track.img || 'https://placehold.co/160x160/282828/FFFFFF?text=Music';
    img = getHighResImage(img);
    var artist = track.artist || 'Unknown';
    var trackData = encodeURIComponent(JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: artist,
        img: img
    })).replace(/'/g, '%27');
    
    return '<div class="community-item" onclick="playMusic(\'' + track.videoId + '\', \'' + trackData + '\', null)">' +
        '<img src="' + img + '" class="cover" onerror="this.src=\'https://placehold.co/160x160/282828/FFFFFF?text=Music\'">' +
        '<div class="title">' + (track.title || 'Untitled') + '</div>' +
        '<div class="sub">' + artist + ' • 45 lagu</div>' +
    '</div>';
}

// ============================================================
// DATA FETCHING
// ============================================================
var homeDisplayedVideoIds = new Set();

async function fetchAndRender(query, containerId, formatType, isArtist, isHome) {
    var container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        var response = await fetch(API.search + '?query=' + encodeURIComponent(query));
        var result = await response.json();
        
        if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
            var limit = formatType === 'quick' ? 4 : (formatType === 'community' ? 4 : (formatType === 'list' ? 4 : 8));
            var tracks = [];
            
            for (var i = 0; i < result.result.songs.length; i++) {
                var t = result.result.songs[i];
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
            
            var html = '';
            for (var j = 0; j < tracks.length; j++) {
                var track = tracks[j];
                track.title = track.title || 'Untitled';
                track.artist = track.artist || 'Unknown Artist';
                track.thumbnail = track.thumbnail || 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
                
                if (formatType === 'quick') {
                    html += createQuickItemHTML(track, j);
                } else if (formatType === 'community') {
                    html += createCommunityItemHTML(track);
                } else if (formatType === 'list') {
                    html += createListHTML(track);
                } else {
                    html += createCardHTML(track, isArtist);
                }
            }
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div style="color:var(--text-sub);font-size:13px;text-align:center;padding:20px;">📭 Tidak ada data</div>';
        }
    } catch (error) {
        container.innerHTML = '<div style="color:var(--text-sub);font-size:13px;text-align:center;padding:20px;">⚠️ Sedang Offline</div>';
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function loadHomeData() {
    homeDisplayedVideoIds.clear();
    fetchAndRender('lagu indonesia hits terbaru', 'rowAnyar', 'quick', false, true);
    fetchAndRender('top 50 indonesia playlist update', 'rowCharts', 'community', false, true);
    fetchAndRender('penyanyi pop indonesia paling hits', 'rowArtists', 'card', true, true);
    fetchAndRender('lagu viral terbaru 2026', 'rowTiktok', 'card', false, true);
}

function renderSearchCategories() {
    var categories = [
        { title: 'Pop', color: '#477d95' },
        { title: 'Indie', color: '#8d67ab' },
        { title: 'Indonesia', color: '#e8115b' },
        { title: 'Hip Hop', color: '#f5a623' }
    ];
    
    var html = '';
    for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        html += '<div class="category-card" style="background:' + cat.color + ';" onclick="searchMusic(\'' + cat.title + '\')">' +
            '<div class="title">' + cat.title + '</div>' +
            '<div class="emoji">🎵</div>' +
        '</div>';
    }
    
    var grid = document.getElementById('categoryGrid');
    if (grid) grid.innerHTML = html;
}

// ============================================================
// SEARCH
// ============================================================
var searchTimeout = null;

document.addEventListener('DOMContentLoaded', function() {
    var input = document.getElementById('searchInput');
    if (input) {
        input.addEventListener('input', handleSearchInput);
    }
});

function handleSearchInput() {
    var input = document.getElementById('searchInput');
    if (!input) return;
    
    clearTimeout(searchTimeout);
    var query = input.value.trim();
    var clearBtn = document.getElementById('searchClear');
    if (clearBtn) {
        clearBtn.style.display = query.length > 0 ? 'block' : 'none';
    }
    
    var categoriesUI = document.getElementById('searchCategoriesUI');
    var resultsUI = document.getElementById('searchResultsUI');
    
    if (query.length === 0) {
        if (categoriesUI) categoriesUI.style.display = 'block';
        if (resultsUI) resultsUI.style.display = 'none';
        return;
    }
    
    if (categoriesUI) categoriesUI.style.display = 'none';
    if (resultsUI) resultsUI.style.display = 'block';
    
    searchTimeout = setTimeout(function() {
        var results = document.getElementById('searchResults');
        if (results) results.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">🔍 Mencari musik...</div>';
        
        fetch(API.search + '?query=' + encodeURIComponent(query))
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (results) {
                    if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
                        var html = '';
                        for (var i = 0; i < result.result.songs.length; i++) {
                            html += createListHTML(result.result.songs[i]);
                        }
                        results.innerHTML = html;
                    } else {
                        results.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">😕 Tidak ada hasil</div>';
                    }
                }
                if (typeof lucide !== 'undefined') lucide.createIcons();
            })
            .catch(function() {
                if (results) {
                    results.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">⚠️ Anda Sedang Offline</div>';
                }
            });
    }, 800);
}

function clearSearch() {
    var input = document.getElementById('searchInput');
    if (input) {
        input.value = '';
        var clearBtn = document.getElementById('searchClear');
        if (clearBtn) clearBtn.style.display = 'none';
        var categoriesUI = document.getElementById('searchCategoriesUI');
        if (categoriesUI) categoriesUI.style.display = 'block';
        var resultsUI = document.getElementById('searchResultsUI');
        if (resultsUI) resultsUI.style.display = 'none';
        input.focus();
    }
}

function searchMusic(query) {
    var input = document.getElementById('searchInput');
    if (input) {
        input.value = query;
        handleSearchInput();
        switchView('search');
    }
}

// ============================================================
// ARTIST
// ============================================================
function openArtistView(artistName) {
    if (!artistName) {
        showToast('⚠️ Nama artis tidak ditemukan');
        return;
    }
    
    var display = document.getElementById('artistNameDisplay');
    if (display) display.textContent = artistName;
    
    var container = document.getElementById('artistTracksContainer');
    if (container) {
        container.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">⏳ Memuat lagu artis...</div>';
    }
    
    switchView('artist');
    
    fetch(API.search + '?query=' + encodeURIComponent(artistName + ' official audio'))
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (container) {
                if (result.status === true && result.result && result.result.songs && result.result.songs.length > 0) {
                    var html = '';
                    var ctx = { type: 'artist', data: result.result.songs };
                    for (var i = 0; i < result.result.songs.length; i++) {
                        var track = result.result.songs[i];
                        track.title = track.title || 'Untitled';
                        track.artist = track.artist || 'Unknown Artist';
                        track.thumbnail = track.thumbnail || 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
                        html += createListHTML(track, ctx);
                    }
                    container.innerHTML = html;
                } else {
                    container.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">😕 Tidak ada lagu</div>';
                }
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        })
        .catch(function() {
            if (container) {
                container.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">⚠️ Gagal memuat</div>';
            }
        });
}

function playFirstArtistTrack() {
    var container = document.getElementById('artistTracksContainer');
    if (container) {
        var first = container.querySelector('.v-item');
        if (first) first.click();
    }
}

function setArtistTab(tab) {
    document.querySelectorAll('.artist-tab').forEach(function(el) {
        el.classList.remove('active');
    });
    var tabs = document.querySelectorAll('.artist-tab');
    var map = { all: 0, songs: 1, videos: 2, albums: 3 };
    var idx = map[tab];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
    showToast('📂 ' + tab.charAt(0).toUpperCase() + tab.slice(1));
}

// ============================================================
// LIBRARY
// ============================================================
function renderLibraryUI() {
    if (!db) return;
    
    try {
        var likedTx = db.transaction('liked_songs', 'readonly');
        var likedReq = likedTx.objectStore('liked_songs').count();
        likedReq.onsuccess = function() {
            var el = document.getElementById('likedCount');
            if (el) el.textContent = likedReq.result + ' lagu';
        };
        
        var offlineTx = db.transaction('offline_songs', 'readonly');
        var offlineReq = offlineTx.objectStore('offline_songs').count();
        offlineReq.onsuccess = function() {
            var el = document.getElementById('offlineCount');
            if (el) el.textContent = offlineReq.result + ' lagu';
        };
        
        var historyTx = db.transaction('history_songs', 'readonly');
        var historyReq = historyTx.objectStore('history_songs').count();
        historyReq.onsuccess = function() {
            var el = document.getElementById('historyCount');
            if (el) el.textContent = historyReq.result + ' lagu';
        };
    } catch (e) {}
}

function openPlaylistView(id) {
    activePlaylistId = id;
    isEditMode = false;
    
    var bar = document.getElementById('bulkActionBar');
    if (bar) bar.style.display = 'none';
    
    switchView('playlist');
    
    var container = document.getElementById('playlistTracksContainer');
    if (container) {
        container.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">⏳ Memuat daftar lagu...</div>';
    }
    
    var nameDisplay = document.getElementById('playlistNameDisplay');
    if (nameDisplay) {
        var names = {
            'liked': '❤️ Disukai',
            'offline': '💾 Diunduh',
            'history': '🕐 Riwayat',
            'top50': '🏆 Teratas Saya 50',
            'uploaded': '📤 Diunggah'
        };
        nameDisplay.textContent = names[id] || '📀 Playlist';
    }
    
    if (id === 'liked') {
        var likedTx = db.transaction('liked_songs', 'readonly');
        var likedReq = likedTx.objectStore('liked_songs').getAll();
        likedReq.onsuccess = function() { processPlaylistData(likedReq.result, 'liked'); };
    } else if (id === 'offline') {
        var offlineTx = db.transaction('offline_songs', 'readonly');
        var offlineReq = offlineTx.objectStore('offline_songs').getAll();
        offlineReq.onsuccess = function() { processPlaylistData(offlineReq.result, 'offline'); };
    } else if (id === 'history') {
        var historyTx = db.transaction('history_songs', 'readonly');
        var historyReq = historyTx.objectStore('history_songs').getAll();
        historyReq.onsuccess = function() {
            var histData = historyReq.result.sort(function(a, b) {
                return b.timestamp - a.timestamp;
            });
            processPlaylistData(histData, 'history');
        };
    } else if (id === 'top50' || id === 'uploaded') {
        if (container) {
            container.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">📭 Fitur segera hadir</div>';
        }
        var stats = document.getElementById('playlistStatsDisplay');
        if (stats) stats.textContent = '0 lagu';
    } else {
        var playlistTx = db.transaction('playlists', 'readonly');
        var playlistReq = playlistTx.objectStore('playlists').get(id);
        playlistReq.onsuccess = function() {
            var p = playlistReq.result;
            if (p && nameDisplay) nameDisplay.textContent = '📀 ' + p.name;
            processPlaylistData(p ? p.tracks || [] : [], 'playlist');
        };
    }
}

function processPlaylistData(dataArr, typeId) {
    currentPlaylistTracks = dataArr || [];
    
    var stats = document.getElementById('playlistStatsDisplay');
    if (stats) stats.textContent = currentPlaylistTracks.length + ' lagu';
    
    var container = document.getElementById('playlistTracksContainer');
    if (!container) return;
    
    if (currentPlaylistTracks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">📭 Daftar ini masih kosong.</div>';
        return;
    }
    
    var html = '';
    var ctx = { type: typeId, data: currentPlaylistTracks };
    
    for (var i = 0; i < currentPlaylistTracks.length; i++) {
        var t = currentPlaylistTracks[i];
        var img = t.thumbnail || t.img || 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
        img = getHighResImage(img);
        var artist = t.artist || 'Unknown';
        
        html += '<div class="v-item" onclick="playMusic(\'' + t.videoId + '\', \'' + encodeURIComponent(JSON.stringify({
            videoId: t.videoId,
            title: t.title || 'Untitled',
            artist: artist,
            img: img
        })) + '\', ' + JSON.stringify(ctx).replace(/'/g, '%27') + ')">' +
            '<img src="' + img + '" onerror="this.src=\'https://placehold.co/48x48/282828/FFFFFF?text=Music\'">' +
            '<div class="info">' +
                '<div class="title">' + (t.title || 'Untitled') + '</div>' +
                '<div class="artist">' + artist + '</div>' +
            '</div>' +
            '<span class="dots">⋯</span>' +
        '</div>';
    }
    
    container.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function playFirstPlaylistTrack() {
    if (currentPlaylistTracks && currentPlaylistTracks.length > 0) {
        var firstTrack = currentPlaylistTracks[0];
        var trackData = encodeURIComponent(JSON.stringify(firstTrack)).replace(/'/g, '%27');
        var ctxStr = encodeURIComponent(JSON.stringify({ type: 'auto', data: currentPlaylistTracks })).replace(/'/g, '%27');
        playMusic(firstTrack.videoId, trackData, JSON.parse(decodeURIComponent(ctxStr)));
    }
}

// ============================================================
// PLAYLIST CRUD
// ============================================================
var base64PlaylistImage = '';

function openCreatePlaylist() {
    var modal = document.getElementById('createPlaylistModal');
    if (modal) modal.style.display = 'block';
}

function closeCreatePlaylist() {
    var modal = document.getElementById('createPlaylistModal');
    if (modal) modal.style.display = 'none';
    var name = document.getElementById('cpName');
    if (name) name.value = '';
    var preview = document.getElementById('cpPreview');
    if (preview) preview.src = 'https://via.placeholder.com/120x120?text=+';
    base64PlaylistImage = '';
}

function previewImage(event) {
    var file = event.target.files[0];
    var reader = new FileReader();
    reader.onloadend = function() {
        var preview = document.getElementById('cpPreview');
        if (preview) preview.src = reader.result;
        base64PlaylistImage = reader.result;
    };
    if (file) reader.readAsDataURL(file);
}

function saveNewPlaylist() {
    var nameInput = document.getElementById('cpName');
    var name = (nameInput ? nameInput.value : '') || 'Playlist baruku';
    var newPlaylist = {
        id: Date.now().toString(),
        name: name,
        img: base64PlaylistImage,
        tracks: []
    };
    
    var tx = db.transaction('playlists', 'readwrite');
    tx.objectStore('playlists').put(newPlaylist);
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
    
    var tx = db.transaction('playlists', 'readonly');
    var req = tx.objectStore('playlists').getAll();
    req.onsuccess = function() {
        var html = '';
        for (var i = 0; i < req.result.length; i++) {
            var p = req.result[i];
            html += '<div class="lib-item" onclick="addTrackToPlaylist(\'' + p.id + '\')" style="margin-bottom:4px;">' +
                '<div class="lib-icon" style="background:linear-gradient(135deg,#1db954,#1aa34a);width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                    '<i data-lucide="music" class="w-5 h-5 text-black"></i>' +
                '</div>' +
                '<div class="lib-info">' +
                    '<span class="lib-name">' + p.name + '</span>' +
                    '<span class="lib-count">' + (p.tracks ? p.tracks.length : 0) + ' lagu</span>' +
                '</div>' +
            '</div>';
        }
        
        var list = document.getElementById('addToPlaylistList');
        if (list) {
            if (req.result.length === 0) {
                list.innerHTML = '<div style="color:#6b7280;text-align:center;padding:20px;">📭 Belum ada playlist. Buat dulu di Pustaka.</div>';
            } else {
                list.innerHTML = html;
            }
        }
        
        var modal = document.getElementById('addToPlaylistModal');
        if (modal) modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };
}

function closeAddToPlaylistModal() {
    var modal = document.getElementById('addToPlaylistModal');
    if (modal) modal.style.display = 'none';
}

function addTrackToPlaylist(playlistId) {
    if (!currentTrack) return;
    
    var tx = db.transaction('playlists', 'readwrite');
    var store = tx.objectStore('playlists');
    var req = store.get(playlistId);
    req.onsuccess = function() {
        var p = req.result;
        if (!p) return;
        if (!p.tracks) p.tracks = [];
        
        var exists = p.tracks.find(function(t) {
            return t.videoId === currentTrack.videoId;
        });
        
        if (!exists) {
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
    
    var items = document.querySelectorAll('#playlistTracksContainer .v-item');
    for (var i = 0; i < items.length; i++) {
        if (isEditMode) {
            items[i].style.borderLeft = '3px solid #e8115b';
            items[i].style.cursor = 'pointer';
        } else {
            items[i].style.borderLeft = 'none';
        }
    }
    
    var bar = document.getElementById('bulkActionBar');
    if (isEditMode && bar) {
        bar.style.display = 'flex';
        updateDeleteCount();
    } else if (bar) {
        bar.style.display = 'none';
    }
}

function handleCheckDelete(videoId, isChecked) {
    // Placeholder - implementasi checkbox nanti
}

function updateDeleteCount() {
    var el = document.getElementById('selCountText');
    if (el) el.textContent = selectedTracksForDelete.size + ' lagu dipilih';
}

function deleteSelectedTracks() {
    if (selectedTracksForDelete.size === 0) {
        showToast('⚠️ Pilih minimal satu lagu untuk dihapus');
        return;
    }
    
    var storeName = '';
    if (activePlaylistId === 'liked') storeName = 'liked_songs';
    else if (activePlaylistId === 'favorite') storeName = 'favorite_songs';
    else if (activePlaylistId === 'history') storeName = 'history_songs';
    else if (activePlaylistId === 'offline') storeName = 'offline_songs';
    
    if (storeName) {
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        
        selectedTracksForDelete.forEach(function(id) {
            if (activePlaylistId === 'history') {
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value.videoId === id) cursor.delete();
                        cursor.continue();
                    }
                };
            } else {
                store.delete(id);
            }
        });
        
        tx.oncomplete = function() {
            showToast('🗑️ ' + selectedTracksForDelete.size + ' lagu dihapus');
            openPlaylistView(activePlaylistId);
        };
    } else {
        var tx = db.transaction('playlists', 'readwrite');
        var store = tx.objectStore('playlists');
        var req = store.get(activePlaylistId);
        req.onsuccess = function() {
            var p = req.result;
            if (p) {
                p.tracks = p.tracks.filter(function(t) {
                    return !selectedTracksForDelete.has(t.videoId);
                });
                store.put(p);
                showToast('🗑️ ' + selectedTracksForDelete.size + ' lagu dihapus dari Playlist');
                openPlaylistView(activePlaylistId);
            }
        };
    }
}

// ============================================================
// LYRICS
// ============================================================
function fetchLyrics(videoId) {
    if (!videoId) return;
    
    fetch(API.lyrics + '?id=' + videoId)
        .then(function(r) { return r.json(); })
        .then(function(result) {
            var container = document.getElementById('lyricsContainer');
            if (container) {
                if (result.status === true && result.result && result.result.lyrics && result.result.lyrics.lines && result.result.lyrics.lines.length > 0) {
                    currentLyrics = result.result.lyrics.lines;
                    renderLyrics(currentLyrics);
                } else {
                    currentLyrics = [];
                    container.innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">🎤 Lirik tidak tersedia</div>';
                }
            }
        })
        .catch(function() {
            var container = document.getElementById('lyricsContainer');
            if (container) {
                container.innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">⚠️ Gagal memuat lirik</div>';
            }
        });
}

function renderLyrics(lines) {
    var container = document.getElementById('lyricsContainer');
    if (!container) return;
    
    if (!lines || lines.length === 0) {
        container.innerHTML = '<div style="color:#6b7280;text-align:center;font-size:13px;padding:10px;">🎤 Lirik tidak tersedia</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var text = line.text || '';
        if (text.trim()) {
            html += '<div class="lyric-line" data-index="' + i + '" data-time="' + (line.time || 0) + '">' + text + '</div>';
        }
    }
    container.innerHTML = html;
}

function updateLyrics(currentTime) {
    if (!currentLyrics || currentLyrics.length === 0) return;
    
    var lines = document.querySelectorAll('.lyric-line');
    var activeIndex = -1;
    
    for (var i = 0; i < currentLyrics.length; i++) {
        var time = currentLyrics[i].time || 0;
        if (currentTime >= time) {
            activeIndex = i;
        } else {
            break;
        }
    }
    
    if (activeIndex !== currentLyricIndex) {
        currentLyricIndex = activeIndex;
        for (var j = 0; j < lines.length; j++) {
            lines[j].classList.remove('active', 'inactive');
            if (j === activeIndex) {
                lines[j].classList.add('active');
                lines[j].scrollIntoView({ block: 'center', behavior: 'smooth' });
            } else if (j < activeIndex) {
                lines[j].classList.add('inactive');
            }
        }
    }
}

function toggleLyrics() {
    isLyricsVisible = !isLyricsVisible;
    var container = document.getElementById('lyricsContainer');
    var btn = document.getElementById('lyricsToggleBtn');
    var btnText = document.getElementById('lyricsBtnText');
    
    if (isLyricsVisible) {
        if (container) container.style.display = 'block';
        if (btn) btn.classList.add('active');
        if (btnText) btnText.textContent = 'Sembunyikan';
        
        if (currentLyrics.length === 0 && currentTrack) {
            fetchLyrics(currentTrack.videoId);
        }
        
        if (ytPlayer && ytPlayer.getCurrentTime) {
            try {
                var currentTime = ytPlayer.getCurrentTime() || 0;
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
// FILTERS
// ============================================================
function setQuickFilter(filter) {
    var chips = document.querySelectorAll('.filter-chip');
    for (var i = 0; i < chips.length; i++) {
        chips[i].classList.remove('active');
    }
    var map = { all: 0, chill: 1, focus: 2, commute: 3, gaming: 4 };
    var idx = map[filter];
    if (idx !== undefined && chips[idx]) chips[idx].classList.add('active');
    showToast('🎯 Filter: ' + filter.charAt(0).toUpperCase() + filter.slice(1));
}

function setFilter(filter) {
    var tabs = document.querySelectorAll('.filter-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    var map = { all: 0, songs: 1, videos: 2, albums: 3 };
    var idx = map[filter];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
}

function setLibTab(tab) {
    var tabs = document.querySelectorAll('.lib-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    var map = { playlists: 0, songs: 1, albums: 2 };
    var idx = map[tab];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
}

function toggleSort() {
    var text = document.getElementById('sortText');
    if (text) {
        text.textContent = text.textContent === 'Terbaru' ? 'Terlama' : 'Terbaru';
    }
}

function importPlaylist() {
    showToast('📥 Fitur impor playlist sedang dalam pengembangan');
}

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choiceResult) {
            if (choiceResult.outcome === 'accepted') {
                showToast('✅ Aplikasi berhasil diinstall!');
                var installBtn = document.getElementById('installAppBtn');
                if (installBtn) installBtn.style.display = 'none';
            } else {
                showToast('❌ Instalasi dibatalkan');
            }
            deferredPrompt = null;
        });
    } else {
        showToast('💡 Buka menu browser > "Tambahkan ke Layar Utama"');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(function() {
                window.dispatchEvent(new Event('beforeinstallprompt'));
            });
        }
    }
}

console.log('🎵 SoundFy Music Player Loaded!');
console.log('👨‍💻 Developer: Zerozx');
