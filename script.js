/* ============================================
   SMALL HELPERS
   ============================================ */
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeClickable(el) {
    if (!el || el.dataset.clickableBound === '1') return;
    el.dataset.clickableBound = '1';
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
        }
    });
}

function bindClickableRoles(root = document) {
    root.querySelectorAll('[role="button"][tabindex="0"]').forEach(makeClickable);
}
window.bindClickableRoles = bindClickableRoles;

/* ============================================
   STARTUP FADE-IN
   ============================================ */
(function () {
    const overlay = document.getElementById('startup-overlay');
    if (!overlay) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('is-fading');
        });
    });
    setTimeout(() => {
        overlay.remove();
    }, prefersReducedMotion() ? 100 : 1600);
})();

bindClickableRoles(document);

/* ============================================
   WINDOW HELPER — shared for all draggable windows
   ============================================ */
function closeOtherWindows(exceptId) {
    document.querySelectorAll('.window-overlay.is-open').forEach((el) => {
        if (el.id === exceptId) return;
        el.classList.remove('is-open');
        el.setAttribute('aria-hidden', 'true');
        const frame = el.querySelector('.window');
        if (frame) {
            frame.style.transform = '';
            frame.classList.remove('is-inactive');
        }
    });
}

function setupDraggableWindow(windowId, iconId, closeId, options = {}) {
    const triggers = typeof iconId === 'string' ? [document.getElementById(iconId)] : iconId.map(id => document.getElementById(id));
    const windowEl = document.getElementById(windowId);
    const closeBtn = document.getElementById(closeId);

    if (!windowEl || !closeBtn || triggers.some(t => !t)) {
        console.warn(`[setupDraggableWindow] Missing element(s) for "${windowId}"`);
        return null;
    }

    const frame    = windowEl.querySelector('.window');
    const titlebar = frame && frame.querySelector('.window-titlebar');
    if (!frame || !titlebar) return null;

    const setActive = (active) => frame.classList.toggle('is-inactive', !active);

    let isDragging = false;
    let startPointerX = 0, startPointerY = 0;
    let startOffsetX = 0,  startOffsetY = 0;
    let offsetX = 0, offsetY = 0;

    const applyTransform = () => frame.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    const resetPosition = () => { offsetX = 0; offsetY = 0; frame.style.transform = ''; };

    const onPointerDown = (e) => {
        if (e.target.closest('.window-close')) return;
        if (e.button !== 0) return;
        isDragging = true;
        startPointerX = e.clientX; startPointerY = e.clientY;
        startOffsetX = offsetX; startOffsetY = offsetY;
        titlebar.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;
        let newOffsetX = startOffsetX + (e.clientX - startPointerX);
        let newOffsetY = startOffsetY + (e.clientY - startPointerY);
        const overlayRect = windowEl.getBoundingClientRect();
        const winW = frame.offsetWidth; const winH = frame.offsetHeight;
        const minOffsetX = -overlayRect.width / 2 + winW / 2;
        const maxOffsetX =  overlayRect.width / 2 - winW / 2;
        const minOffsetY = -overlayRect.height / 2 + winH / 2;
        const maxOffsetY =  overlayRect.height / 2 - winH / 2;
        newOffsetX = (minOffsetX > maxOffsetX) ? (minOffsetX + maxOffsetX) / 2 : Math.max(minOffsetX, Math.min(newOffsetX, maxOffsetX));
        newOffsetY = (minOffsetY > maxOffsetY) ? (minOffsetY + maxOffsetY) / 2 : Math.max(minOffsetY, Math.min(newOffsetY, maxOffsetY));
        offsetX = newOffsetX; offsetY = newOffsetY;
        applyTransform();
    };

    const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        if (titlebar.hasPointerCapture(e.pointerId)) titlebar.releasePointerCapture(e.pointerId);
    };

    titlebar.addEventListener('pointerdown', onPointerDown);
    titlebar.addEventListener('pointermove', onPointerMove);
    titlebar.addEventListener('pointerup', onPointerUp);
    titlebar.addEventListener('pointercancel', onPointerUp);

    const setOpen = (open) => {
        if (open) {
            if (!options.keepOthers) closeOtherWindows(windowId);
            windowEl.classList.add('is-open');
            windowEl.setAttribute('aria-hidden', 'false');
            setActive(true);
            closeBtn.focus();
        } else {
            windowEl.classList.remove('is-open');
            windowEl.setAttribute('aria-hidden', 'true');
            resetPosition();
            if (triggers[0]) triggers[0].focus();
        }
    };

    triggers.forEach(t => t.addEventListener('click', () => setOpen(true)));
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
    frame.addEventListener('mousedown', () => setActive(true));
    windowEl.addEventListener('click', (e) => { if (e.target === windowEl) setActive(false); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && windowEl.classList.contains('is-open')) setOpen(false);
    });

    return { setOpen };
}

setupDraggableWindow('folder-window',       'for-lya-icon',     'folder-close');
setupDraggableWindow('letter-window',       'letter-item',      'letter-close',       { keepOthers: true });
setupDraggableWindow('three-months-window', 'three-months-item', 'three-months-close', { keepOthers: true });
setupDraggableWindow('reminder-window',     'reminder-icon',    'reminder-close');
setupDraggableWindow('heart-window',        'heart-clicker',    'heart-close');

/* ============================================
   HEART CLICKER
   ============================================ */
(function () {
    const content = document.getElementById('heart-clicker-content');
    if (!content) return;
    const hint = content.querySelector('.heart-clicker-hint');
    const bigHeart = content.querySelector('.heart-big');
    const HEART_SRC = 'images/desktop/heart.png';
    const SFX_SRC = 'audio/per.mp3';
    const LIFETIME_MS = prefersReducedMotion() ? 600 : 1500;

    const sfxTemplate = new Audio();
    sfxTemplate.src = SFX_SRC; sfxTemplate.preload = 'auto'; sfxTemplate.volume = 0.6;
    let hintHidden = false;
    const rand = (min, max) => min + Math.random() * (max - min);

    const playSfx = () => {
        const sfx = sfxTemplate.cloneNode(); sfx.volume = 0.6;
        const p = sfx.play(); if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    if (bigHeart) {
        bigHeart.addEventListener('click', () => {
            bigHeart.classList.remove('is-tapped');
            void bigHeart.offsetWidth;
            bigHeart.classList.add('is-tapped');
        });
    }

    // Stop fast clicking from selecting text or dragging the heart image
    content.addEventListener('mousedown', (e) => { if (e.detail > 1) e.preventDefault(); });
    content.addEventListener('selectstart', (e) => e.preventDefault());
    content.addEventListener('dragstart', (e) => e.preventDefault());

    content.addEventListener('click', (e) => {
        playSfx();
        if (!hintHidden && hint) { hint.classList.add('is-hidden'); hintHidden = true; }
        const rect = content.getBoundingClientRect();
        const baseX = e.clientX - rect.left; const baseY = e.clientY - rect.top;
        const count = Math.random() < 0.35 ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const offsetX = count > 1 ? rand(-12, 12) : 0;
            spawnHeart(baseX + offsetX, baseY + rand(-8, 8));
        }
    });

    function spawnHeart(x, y) {
        const heart = document.createElement('img');
        heart.className = 'floating-heart'; heart.src = HEART_SRC; heart.alt = '';
        const size = rand(12, 48).toFixed(0);
        heart.style.width = size + 'px'; heart.style.height = size + 'px';
        heart.style.left = x + 'px'; heart.style.top = y + 'px';
        heart.style.setProperty('--rot', rand(-20, 20).toFixed(1) + 'deg');
        content.appendChild(heart);
        setTimeout(() => { if (heart.parentNode) heart.parentNode.removeChild(heart); }, LIFETIME_MS);
    }
})();

/* ============================================
   START MENU & RESTART
   ============================================ */
(function () {
    const startBtn  = document.querySelector('.start-btn');
    const startMenu = document.getElementById('start-menu');
    if (!startBtn || !startMenu) return;
    const setMenuOpen = (open) => {
        startMenu.classList.toggle('is-open', open);
        startBtn.classList.toggle('is-pressed', open);
        startBtn.setAttribute('aria-pressed', String(open));
    };
    startBtn.addEventListener('click', () => setMenuOpen(!startMenu.classList.contains('is-open')));
    document.addEventListener('click', (e) => {
        if (startBtn.contains(e.target) || startMenu.contains(e.target)) return;
        setMenuOpen(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenuOpen(false); });
})();

(function () {
    const restartBtn = document.getElementById('restart-btn');
    if (!restartBtn) return;
    let navigating = false;
    restartBtn.addEventListener('click', () => {
        if (navigating) return; navigating = true;
        restartBtn.classList.add('is-pressed');
        setTimeout(() => {
            restartBtn.classList.remove('is-pressed');
            setTimeout(() => { window.location.href = 'index.html'; }, 100);
        }, prefersReducedMotion() ? 0 : 150);
    });
})();

/* ============================================
   BACKGROUND MUSIC
   ============================================ */
(function () {
    const bgMusic = document.getElementById('bg-music');
    if (!bgMusic) return;
    bgMusic.volume = 0.05;
    let userPaused = false;
    bgMusic.addEventListener('pause', () => { if (!bgMusic.ended) userPaused = true; });
    bgMusic.addEventListener('play', () => { userPaused = false; });
    const tryPlay = () => { if (userPaused) return; bgMusic.play().catch(() => {}); };
    tryPlay();
    document.addEventListener('pointerdown', () => {
        if (bgMusic.paused && !userPaused) tryPlay();
    }, { once: true });
})();

/* ============================================
   TASKBAR — DAY COUNTER + TIME OF DAY + SLIDESHOW
   ============================================ */
(function () {
    const counterEl = document.getElementById('day-counter-text');
    const todImg    = document.getElementById('time-of-day-image');
    const slideLeft = document.getElementById('slideshow-left');
    const slideRight= document.getElementById('slideshow-right');
    if (!counterEl || !todImg || !slideLeft || !slideRight) return;

    const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const REFERENCE_GMT8_MIDNIGHT_MS = Date.UTC(2007, 9, 22, 0, 0, 0) - GMT8_OFFSET_MS;
    const nowInGMT8 = () => new Date(Date.now() + GMT8_OFFSET_MS);

    function updateDayCounter() {
        const gmt8Now = nowInGMT8();
        const todayGmt8MidnightMs = Date.UTC(
            gmt8Now.getUTCFullYear(), gmt8Now.getUTCMonth(), gmt8Now.getUTCDate(), 0, 0, 0
        ) - GMT8_OFFSET_MS;
        const days = Math.floor((todayGmt8MidnightMs - REFERENCE_GMT8_MIDNIGHT_MS) / MS_PER_DAY);
        counterEl.textContent = `DAY ${days}`;
    }

    function updateTimeOfDayAndBackground() {
        const hour = nowInGMT8().getUTCHours();
        let iconSrc, slideSrc;

        if (hour >= 6 && hour < 10) {
            iconSrc = 'images/taskbar/evening.png';   
            slideSrc = 'images/slides/slide_evening.png';
        } else if (hour >= 10 && hour < 17) {
            iconSrc = 'images/taskbar/noon.png';      
            slideSrc = 'images/slides/slide_noon.png';
        } else if (hour >= 17 && hour < 20) {
            iconSrc = 'images/taskbar/evening.png';   
            slideSrc = 'images/slides/slide_evening.png';
        } else {
            iconSrc = 'images/taskbar/night.png';     
            slideSrc = 'images/slides/slide_night.png';
        }

        if (!todImg.src.endsWith(iconSrc)) todImg.src = iconSrc;
        const bgUrl = `url('${slideSrc}')`;
        if (slideLeft.style.backgroundImage !== bgUrl) {
            slideLeft.style.backgroundImage = bgUrl;
            slideRight.style.backgroundImage = bgUrl;
        }
    }

    function updateAll() { updateDayCounter(); updateTimeOfDayAndBackground(); }

    updateAll();
    setInterval(updateAll, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateAll(); });
})();

/* ============================================
   JINE CHAT — CUSTOM CHAT BOX
   ============================================ */
(function () {
    const chatContainer = document.getElementById('jine-chat-container');
    const closeBtn      = document.getElementById('jine-close-btn');

    // Login window (optional: if missing, JINE opens straight to the chat)
    const loginContainer = document.getElementById('jine-login-container');
    const loginFrame     = document.getElementById('jine-login-frame');
    const loginField     = loginContainer ? loginContainer.querySelector('.jine-login-field') : null;
    const loginInput     = document.getElementById('jine-login-input');
    const loginMask      = document.getElementById('jine-login-mask');
    const loginError     = document.getElementById('jine-login-error');

    // Emoji box (optional)
    const emojiBtn   = document.getElementById('jine-emoji-btn');
    const emojiPanel = document.getElementById('jine-emoji-panel');
    const emojiTabs  = document.getElementById('jine-emoji-tabs');
    const emojiGrid  = document.getElementById('jine-emoji-grid');

    // Attachment (picture / video sending) elements (optional)
    const attachBtn     = document.getElementById('jine-attach-btn');
    const fileInput     = document.getElementById('jine-file-input');
    const attachPreview = document.getElementById('jine-attach-preview');
    const attachThumb   = document.getElementById('jine-attach-thumb');
    const attachName    = document.getElementById('jine-attach-name');
    const attachSize    = document.getElementById('jine-attach-size');
    const attachRemove  = document.getElementById('jine-attach-remove');
    const jineIcon      = document.getElementById('jine-icon');
    const taskbarBtn    = document.getElementById('jine-taskbar-btn');
    
    const messagesArea = document.getElementById('jine-messages');
    const inputField   = document.getElementById('jine-input');
    const sendBtn      = document.getElementById('jine-send');
    
    if (!chatContainer || !closeBtn || !messagesArea || !inputField || !sendBtn) return;

    const SERVER_URL = 'https://hbd-lya.onrender.com';

    // --- Open / Close Logic ---
    // Closing terminates the session (socket disconnects). The messages already
    // on screen are kept, and the server re-sends its history on reconnect.
    let socket = null;

    function openChat() {
        chatContainer.classList.add('is-visible');
        chatContainer.setAttribute('aria-hidden', 'false');

        // Reconnect if the session was terminated
        if (socket && !socket.connected && !socket.active) socket.connect();

        inputField.focus();
    }

    function closeChat() {
        chatContainer.classList.remove('is-visible');
        chatContainer.setAttribute('aria-hidden', 'true');

        closeEmoji();
        clearAttachment();

        const t = document.getElementById('jine-typing-indicator');
        if (t) t.remove();

        if (socket) socket.disconnect();
    }

    // Listeners
    // --- Emoji Box ---
    const EMOJI_SETS = [
        { icon: '\u{1F642}', name: 'Faces', list: ['\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F602}','\u{1F923}','\u{1F972}','\u263A\uFE0F','\u{1F60A}','\u{1F607}','\u{1F642}','\u{1F643}','\u{1F609}','\u{1F60C}','\u{1F60D}','\u{1F970}','\u{1F618}','\u{1F617}','\u{1F619}','\u{1F61A}','\u{1F60B}','\u{1F61B}','\u{1F61C}','\u{1F92A}','\u{1F61D}','\u{1F917}','\u{1F92D}','\u{1F92B}','\u{1F914}','\u{1F610}','\u{1F611}','\u{1F636}','\u{1F60F}','\u{1F612}','\u{1F644}','\u{1F62C}','\u{1F62E}','\u{1F634}','\u{1F62A}','\u{1F622}','\u{1F62D}','\u{1F97A}','\u{1F624}','\u{1F620}','\u{1F621}','\u{1F975}','\u{1F976}','\u{1F631}','\u{1F628}','\u{1F630}','\u{1F613}','\u{1F633}','\u{1F974}','\u{1F922}'] },
        { icon: '\u2764\uFE0F', name: 'Love', list: ['\u2764\uFE0F','\u{1F9E1}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F5A4}','\u{1F90D}','\u{1F90E}','\u{1F494}','\u2763\uFE0F','\u{1F495}','\u{1F49E}','\u{1F493}','\u{1F497}','\u{1F496}','\u{1F498}','\u{1F49D}','\u{1F49F}','\u{1F48C}','\u{1F48B}','\u{1F339}','\u{1F338}','\u{1F490}','\u2728','\u2B50','\u{1F31F}','\u{1F4AB}','\u{1F380}','\u{1F353}','\u{1F352}','\u{1F382}','\u{1F381}','\u{1F389}','\u{1F942}','\u{1F48D}'] },
        { icon: '\u{1F431}', name: 'Cute', list: ['\u{1F431}','\u{1F436}','\u{1F430}','\u{1F43B}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F98A}','\u{1F439}','\u{1F42D}','\u{1F438}','\u{1F435}','\u{1F427}','\u{1F425}','\u{1F984}','\u{1F41D}','\u{1F98B}','\u{1F422}','\u{1F419}','\u{1F433}','\u{1F42C}','\u{1F308}','\u2601\uFE0F','\u{1F319}','\u2600\uFE0F','\u26A1','\u{1F525}','\u2744\uFE0F','\u{1F340}','\u{1F337}','\u{1F33B}','\u{1F344}'] },
        { icon: '\u{1F353}', name: 'Food', list: ['\u{1F34E}','\u{1F353}','\u{1F352}','\u{1F351}','\u{1F370}','\u{1F9C1}','\u{1F369}','\u{1F36A}','\u{1F36B}','\u{1F36C}','\u{1F36D}','\u{1F366}','\u{1F36E}','\u{1F361}','\u{1F359}','\u{1F35C}','\u{1F355}','\u{1F354}','\u{1F35F}','\u{1F32E}','\u{1F363}','\u{1F371}','\u{1F9CB}','\u2615','\u{1F375}','\u{1F964}','\u{1F37A}','\u{1F377}'] },
        { icon: '\u{1F44B}', name: 'Hands', list: ['\u{1F44B}','\u{1F91A}','\u270B','\u{1F44C}','\u{1F90C}','\u270C\uFE0F','\u{1F91E}','\u{1FAF6}','\u{1F91F}','\u{1F918}','\u{1F44D}','\u{1F44E}','\u{1F44F}','\u{1F64C}','\u{1FAC2}','\u{1F64F}','\u{1F4AA}','\u{1FAE1}','\u{1F440}','\u{1F4A4}','\u{1F4A2}','\u{1F4A6}','\u{1F4AD}','\u{1F4AC}'] }
    ];

    function openEmoji() {
        emojiPanel.classList.add('is-open');
        emojiPanel.setAttribute('aria-hidden', 'false');
        emojiBtn.setAttribute('aria-expanded', 'true');
    }

    function closeEmoji() {
        if (!emojiPanel || !emojiBtn) return;
        emojiPanel.classList.remove('is-open');
        emojiPanel.setAttribute('aria-hidden', 'true');
        emojiBtn.setAttribute('aria-expanded', 'false');
    }

    function insertEmoji(emoji) {
        const start = inputField.selectionStart ?? inputField.value.length;
        const end   = inputField.selectionEnd   ?? inputField.value.length;
        inputField.value = inputField.value.slice(0, start) + emoji + inputField.value.slice(end);
        const pos = start + emoji.length;
        inputField.focus();
        inputField.setSelectionRange(pos, pos);
    }

    function showEmojiSet(index) {
        emojiGrid.innerHTML = '';
        emojiGrid.scrollTop = 0;
        emojiTabs.querySelectorAll('.jine-emoji-tab').forEach((tab, i) => {
            tab.classList.toggle('is-active', i === index);
            tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });
        EMOJI_SETS[index].list.forEach((emoji) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'jine-emoji-item';
            b.textContent = emoji;
            b.setAttribute('aria-label', emoji);
            b.addEventListener('click', () => insertEmoji(emoji));
            emojiGrid.appendChild(b);
        });
    }

    if (emojiBtn && emojiPanel && emojiTabs && emojiGrid) {
        EMOJI_SETS.forEach((set, i) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'jine-emoji-tab';
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-label', set.name);
            tab.title = set.name;
            tab.textContent = set.icon;
            tab.addEventListener('click', () => showEmojiSet(i));
            emojiTabs.appendChild(tab);
        });
        showEmojiSet(0);

        // Keep focus (and the caret position) in the text box while clicking around the emoji box
        emojiBtn.addEventListener('mousedown',   (e) => e.preventDefault());
        emojiPanel.addEventListener('mousedown', (e) => e.preventDefault());

        emojiBtn.addEventListener('click', () => {
            if (emojiPanel.classList.contains('is-open')) {
                closeEmoji();
            } else {
                openEmoji();
            }
            inputField.focus();
        });

        // Click outside or Escape closes it
        document.addEventListener('mousedown', (e) => {
            if (!emojiPanel.classList.contains('is-open')) return;
            if (emojiPanel.contains(e.target) || emojiBtn.contains(e.target)) return;
            closeEmoji();
        });
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeEmoji();
        });
    }

    // --- Attachments: pictures / videos the person sends ---
    const MAX_UPLOAD_MB = 10;      // Discord's limit on most servers; keep in step with MAX_UPLOAD_MB in the server's .env
    let pendingFile = null;
    let pendingThumbUrl = null;

    function formatSize(bytes) {
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }

    // Long file names are shortened: first 8 characters + "..." + the extension
    // e.g. ABCDEFGHIJKLMNOPQ.jpg -> ABCDEFGH....jpg
    function shortFileName(name) {
        const dot = name.lastIndexOf('.');
        const hasExt = dot > 0 && dot < name.length - 1;
        const base = hasExt ? name.slice(0, dot) : name;
        const ext  = hasExt ? name.slice(dot) : '';          // includes the dot
        if (base.length <= 8) return name;
        return base.slice(0, 8) + '...' + ext;
    }

    function showNotice(text) {
        const n = document.createElement('div');
        n.className = 'jine-notice';
        n.textContent = text;
        messagesArea.appendChild(n);
        scrollToBottom();
    }

    function clearAttachment() {
        if (pendingThumbUrl) { URL.revokeObjectURL(pendingThumbUrl); pendingThumbUrl = null; }
        pendingFile = null;
        if (fileInput) fileInput.value = '';
        if (attachPreview) attachPreview.hidden = true;
        if (attachThumb) attachThumb.innerHTML = '';
    }

    function setAttachment(file) {
        if (!file || !attachPreview) return;
        const isImage = file.type.startsWith('image/') && !file.type.includes('svg');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) { showNotice('Only pictures and videos can be sent.'); return; }
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
            showNotice('That file is too big. The limit is ' + MAX_UPLOAD_MB + ' MB.');
            if (fileInput) fileInput.value = '';
            return;
        }
        clearAttachment();
        pendingFile = file;
        pendingThumbUrl = URL.createObjectURL(file);

        attachThumb.innerHTML = '';
        let thumb;
        if (isVideo) {
            thumb = document.createElement('video');
            thumb.muted = true; thumb.preload = 'metadata'; thumb.playsInline = true;
            thumb.src = pendingThumbUrl + '#t=0.1';
        } else {
            thumb = document.createElement('img');
            thumb.alt = '';
            thumb.src = pendingThumbUrl;
        }
        attachThumb.appendChild(thumb);
        const fullName = file.name || (isVideo ? 'video' : 'picture');
        attachName.textContent = shortFileName(fullName);
        attachName.title = fullName;                          // full name on hover
        attachSize.textContent = formatSize(file.size);
        attachPreview.hidden = false;
        inputField.focus();
    }

    if (attachBtn && fileInput && attachPreview) {
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => setAttachment(fileInput.files && fileInput.files[0]));
        attachRemove.addEventListener('click', () => { clearAttachment(); inputField.focus(); });

        // Pasting a picture (e.g. a screenshot) into the text box attaches it
        inputField.addEventListener('paste', (e) => {
            const files = e.clipboardData && e.clipboardData.files;
            if (!files || !files.length) return;
            const f = Array.from(files).find((x) => x.type.startsWith('image/') || x.type.startsWith('video/'));
            if (f) { e.preventDefault(); setAttachment(f); }
        });
    }

    // --- Login Logic ---
    const PASSWORD       = '3773<3U';
    const REMEMBER_LOGIN = true;    // true = only ask once per page load (a refresh asks again); false = ask every time JINE is opened
    let isLoggedIn = false;

    const hasLogin = !!(loginContainer && loginFrame && loginField && loginInput && loginMask && loginError);

    function updateMask() {
        loginMask.textContent = '*'.repeat(loginInput.value.length);
    }

    function resetLogin() {
        loginInput.value = '';
        loginError.textContent = '';
        updateMask();
    }

    function openLogin() {
        loginContainer.classList.add('is-visible');
        loginContainer.setAttribute('aria-hidden', 'false');
        loginInput.focus();
    }

    function closeLogin() {
        loginContainer.classList.remove('is-visible');
        loginContainer.setAttribute('aria-hidden', 'true');
        resetLogin();
    }

    function submitPassword() {
        if (loginInput.value === PASSWORD) {
            isLoggedIn = true;
            closeLogin();
            openChat();
        } else {
            loginError.textContent = 'Incorrect password. Try again.';
            loginInput.value = '';
            updateMask();
            loginInput.focus();
        }
    }

    // Clicking JINE (desktop icon / taskbar) goes through the login window
    function launchJine() {
        if (chatContainer.classList.contains('is-visible')) {
            inputField.focus();
            return;
        }
        if (!hasLogin || (REMEMBER_LOGIN && isLoggedIn)) {
            openChat();
            return;
        }
        openLogin();
    }

    if (hasLogin) {
        loginInput.addEventListener('input', () => {
            updateMask();
            loginError.textContent = '';
        });
        loginInput.addEventListener('focus', () => loginField.classList.add('is-focused'));
        loginInput.addEventListener('blur',  () => loginField.classList.remove('is-focused'));
        loginInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitPassword(); }
        });
        // Clicking anywhere on the login image focuses the textbox
        loginFrame.addEventListener('click', () => loginInput.focus());

        // Escape or clicking outside dismisses the login window
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && loginContainer.classList.contains('is-visible')) closeLogin();
        });
        document.addEventListener('mousedown', (e) => {
            if (!loginContainer.classList.contains('is-visible')) return;
            if (loginContainer.contains(e.target)) return;
            if (jineIcon && jineIcon.contains(e.target)) return;
            if (taskbarBtn && taskbarBtn.contains(e.target)) return;
            closeLogin();
        });
    }

    if (jineIcon) jineIcon.addEventListener('click', launchJine);
    if (taskbarBtn) taskbarBtn.addEventListener('click', launchJine);
    closeBtn.addEventListener('click', closeChat);
    closeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeChat(); }
    });

    // --- Socket.IO Logic ---
    if (typeof io === 'undefined') {
        console.warn('[JINE] socket.io library not loaded.');
        return;
    }

    // autoConnect is off: the socket only connects once the person is logged in
    socket = io(SERVER_URL, {
        autoConnect: false,
        transports: ['websocket', 'polling']
    });

    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    let lastSender = null;
    let lastDay = null;

    function parseTime(ts) {
        const d = ts ? new Date(ts) : new Date();
        return isNaN(d.getTime()) ? new Date() : d;
    }

    // --- GIF / media support ---------------------------------------------
    // A message can carry media two ways:
    //   1. the server sends  media: [{ url, type?, width?, height? }]
    //   2. the text itself contains a direct GIF link (.gif / .mp4 / .webm)
    // Tenor/Giphy/Klipy/Twitter *page* links can't be turned into a GIF in the browser, so the
    // server resolves those from Discord's embed and sends them in `media`.
    const URL_RE      = /https?:\/\/[^\s<>]+/gi;
    const MEDIA_EXT   = /\.(gif|webp|png|jpe?g|avif|mp4|webm|mov)$/i;
    // Pages that Discord turns into a GIF embed: Tenor, Giphy, Klipy, and tweets
    const GIF_PAGE_RE = /^https?:\/\/(?:[\w-]+\.)?(?:tenor\.com|giphy\.com|klipy\.com|twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\//i;

    function safeUrl(u) {
        try {
            const p = new URL(u);
            // blob: = a file the person just picked, shown straight away before the server has it
            return (p.protocol === 'http:' || p.protocol === 'https:' || p.protocol === 'blob:') ? p.href : null;
        } catch (e) { return null; }
    }

    function mediaKind(item) {
        const t = (item.type || '').toLowerCase();
        if (t.startsWith('video')) return 'video';
        if (t.startsWith('image')) return 'image';
        let path = '';
        try { path = new URL(item.url).pathname; } catch (e) {}
        return /\.(mp4|webm|mov)$/i.test(path) ? 'video' : 'image';
    }

    // A "looping" video is really a GIF (Tenor/Giphy/Klipy/Twitter GIF): autoplay, muted, loop.
    // Any other video gets a normal player with controls and sound.
    function isLoopingVideo(item) {
        if (typeof item.animated === 'boolean') return item.animated;
        return /(?:^|\.)(?:tenor|giphy|klipy)\.com\/|video\.twimg\.com\/tweet_video\//i.test(item.url.replace(/^https?:\/\//, ''));
    }

    function normalizeMedia(list) {
        if (!Array.isArray(list)) return [];
        const out = [];
        list.forEach((m) => {
            const item = typeof m === 'string' ? { url: m } : m;
            if (!item || !item.url) return;
            const url = safeUrl(item.url);
            if (!url || out.some((o) => o.url === url)) return;
            out.push({ url, type: item.type, width: item.width, height: item.height, animated: item.animated, fallback: safeUrl(item.fallback || '') || undefined });
        });
        return out;
    }

    // Pull direct media links out of the text; tidy leftover page links (Tenor, Twitter, ...)
    // If the server already sent media for this message, links in the text are only removed
    // (never added again), so the same picture can't appear twice.
    function splitTextAndMedia(text, media) {
        const items = normalizeMedia(media);
        const fromServer = items.length > 0;
        let rest = (text || '').replace(URL_RE, (link) => {
            const url = safeUrl(link);
            if (!url) return link;
            let path = '';
            try { path = new URL(url).pathname; } catch (e) {}
            if (MEDIA_EXT.test(path)) {
                if (!fromServer && !items.some((o) => o.url === url)) items.push({ url });
                return '';
            }
            // the media itself is shown, so drop its page link from the text
            if (items.length && GIF_PAGE_RE.test(url)) return '';
            return link;
        });
        rest = rest.replace(/[ \t]+\n/g, '\n').trim();
        return { text: rest, items };
    }

    // Size every picture / GIF / video to fit the chat: scaled down (never up) so it fits both the
    // width of a message bubble and a share of the chat height, keeping its proportions.
    const MEDIA_MAX_W = 240;
    const MEDIA_MAX_H = 240;

    function mediaLimits() {
        const areaW = messagesArea.clientWidth  || 324;   // 0 while the chat is hidden
        const areaH = messagesArea.clientHeight || 300;
        // a bubble is at most 82% of the chat width, minus its padding and the time label beside it
        const maxW = Math.max(60, Math.min(MEDIA_MAX_W, Math.floor(areaW * 0.82) - 58));
        const maxH = Math.max(60, Math.min(MEDIA_MAX_H, Math.floor(areaH * 0.7)));
        return { maxW, maxH };
    }

    function fitMedia(el) {
        let w = el.naturalWidth  || el.videoWidth  || Number(el.dataset.w) || 0;
        let h = el.naturalHeight || el.videoHeight || Number(el.dataset.h) || 0;
        if (!w || !h) { w = 160; h = 120; }                // placeholder until the real size is known
        const { maxW, maxH } = mediaLimits();
        const scale = Math.min(1, maxW / w, maxH / h);
        el.style.width  = Math.max(1, Math.round(w * scale)) + 'px';
        el.style.height = Math.max(1, Math.round(h * scale)) + 'px';
    }

    function fitAllMedia() {
        messagesArea.querySelectorAll('.jine-media').forEach(fitMedia);
    }

    // Re-fit when the chat is shown, hidden or resized
    if (window.ResizeObserver) new ResizeObserver(fitAllMedia).observe(messagesArea);
    window.addEventListener('resize', fitAllMedia);

    function buildMediaElement(item) {
        const kind = mediaKind(item);
        const looping = kind === 'video' && isLoopingVideo(item);
        let el;
        let src = item.url;

        if (kind === 'video') {
            el = document.createElement('video');
            el.playsInline = true;
            el.setAttribute('playsinline', '');
            el.addEventListener('loadedmetadata', () => { fitMedia(el); scrollToBottom(); });
            el.addEventListener('loadeddata', scrollToBottom);
            if (looping) {
                // GIF-style: silent, automatic, endless
                el.muted = true; el.loop = true; el.autoplay = true; el.preload = 'auto';
                el.setAttribute('muted', '');
                el.disablePictureInPicture = true;
                const p = el.play(); if (p && typeof p.catch === 'function') p.catch(() => {});
            } else {
                // Regular video: player with controls, sound on, loads only when played
                el.controls = true; el.preload = 'metadata';
                el.setAttribute('controlslist', 'nodownload noremoteplayback');
                // #t=0.1 makes browsers show the first frame as a thumbnail
                if (!src.includes('#')) src += '#t=0.1';
            }
        } else {
            el = document.createElement('img');
            el.alt = 'Image';
            el.loading = 'eager';
            el.draggable = false;
            el.addEventListener('load', () => { fitMedia(el); scrollToBottom(); });
            // click a picture to open it full size in a new tab
            el.addEventListener('click', () => window.open(item.url, '_blank', 'noopener,noreferrer'));
        }

        el.className = 'jine-media' + (kind === 'video' && !looping ? ' is-player' : kind === 'image' ? ' is-image' : '');
        el.referrerPolicy = 'no-referrer';
        if (item.width && item.height) { el.dataset.w = item.width; el.dataset.h = item.height; }
        fitMedia(el);                                       // right size straight away if the server sent dimensions
        el.src = src;
        let triedBackup = false;
        el.addEventListener('error', () => {
            // first failure: try Discord's backup copy of the file
            if (!triedBackup && item.fallback) {
                triedBackup = true;
                console.warn('[JINE] media failed, trying backup address:', item.url);
                el.src = item.fallback;
                return;
            }
            console.warn('[JINE] media could not be loaded:', item.url);
            const link = document.createElement('a');
            link.className = 'jine-media-fail';
            link.href = item.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const label = kind === 'video' ? (looping ? 'GIF' : 'Video') : (/\.gif(\?|$)/i.test(item.url) ? 'GIF' : 'Image');
            link.textContent = '[' + label + ' unavailable - tap to open]';
            el.replaceWith(link);
        });
        return el;
    }

    function addMessage(text, sender, timestamp = null, media = null) {
        const when = parseTime(timestamp);
        const parts = splitTextAndMedia(text, media);
        text = parts.text;

        // Date divider when the day changes
        const dayKey = when.toDateString();
        if (dayKey !== lastDay) {
            lastDay = dayKey;
            const divider = document.createElement('div');
            divider.className = 'jine-date';
            divider.textContent = when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            messagesArea.appendChild(divider);
            lastSender = null;
        }

        const isFirst = sender !== lastSender;
        lastSender = sender;

        const msgDiv = document.createElement('div');
        msgDiv.className = `jine-msg ${sender}` + (isFirst ? ' is-first' : '');

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'jine-msg-avatar';
        const avatarImg = document.createElement('img');
        avatarImg.src = sender === 'elle' ? 'images/jine/elle.jpg' : 'images/lya_pfp.png';
        avatarDiv.appendChild(avatarImg);

        const main = document.createElement('div');
        main.className = 'jine-msg-main';

        if (sender === 'elle' && isFirst) {
            const name = document.createElement('div');
            name.className = 'jine-msg-name';
            name.textContent = 'Elle';
            main.appendChild(name);
        }

        const row = document.createElement('div');
        row.className = 'jine-msg-row';

        const bubble = document.createElement('div');
        bubble.className = 'jine-bubble';
        bubble.textContent = text;
        if (parts.items.length) {
            bubble.classList.add('has-media');
            if (!text) bubble.classList.add('media-only');
            parts.items.forEach((item) => bubble.appendChild(buildMediaElement(item)));
        }

        const meta = document.createElement('div');
        meta.className = 'jine-meta';
        if (sender === 'lya') {
            const read = document.createElement('span');
            read.textContent = 'Read';
            meta.appendChild(read);
        }
        const time = document.createElement('span');
        time.textContent = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
        meta.appendChild(time);

        row.appendChild(bubble);
        row.appendChild(meta);
        main.appendChild(row);

        msgDiv.appendChild(avatarDiv);
        msgDiv.appendChild(main);
        messagesArea.appendChild(msgDiv);
        scrollToBottom();
    }

    function showTyping() {
        if (document.getElementById('jine-typing-indicator')) return;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'jine-typing';
        typingDiv.id = 'jine-typing-indicator';
        typingDiv.innerHTML = '<div class="jine-dot"></div><div class="jine-dot"></div><div class="jine-dot"></div>';
        messagesArea.appendChild(typingDiv);
        scrollToBottom();
    }

    function removeTyping() {
        const t = document.getElementById('jine-typing-indicator');
        if (t) t.remove();
    }

    let isOffline = false;
    let hasShownOfflineMessage = false;

    socket.on('chat-history', (historyArray) => {
        messagesArea.innerHTML = '';
        lastSender = null;
        lastDay = null;
        historyArray.forEach((msg) => {
            addMessage(msg.text, msg.sender, msg.timestamp, msg.media);
        });
    });

    socket.on('connect', () => {
        console.log('[JINE] Connected to backend.');
        isOffline = false;
    });

    socket.on('connect_error', (err) => {
        console.warn('[JINE] Could not connect to backend at', SERVER_URL, '-', err.message);
        isOffline = true;

        if (!hasShownOfflineMessage) {
            hasShownOfflineMessage = true;
            setTimeout(() => {
                removeTyping();
                addMessage(
                    "Hi, baby! I'm sorry, but I still haven't turned the server on. Go to our Discord DMs for the mean time.", 
                    'elle'
                );
            }, 1000);
        }
    });

    socket.on('discord-message', (data) => {
        removeTyping();
        addMessage(data.text, 'elle', data.timestamp, data.media);
    });

    function sendFile(file, text) {
        // Show it in the chat right away from the local file
        const localUrl = URL.createObjectURL(file);
        addMessage(text, 'lya', null, [{ url: localUrl, type: file.type, animated: false }]);
        inputField.value = '';
        clearAttachment();
        closeEmoji();

        if (!socket.connected) {
            addMessage("I can't receive that right now, baby. The server is offline. Message me on Discord!", 'elle');
            return;
        }

        file.arrayBuffer().then((buf) => {
            socket.timeout(120000).emit(
                'send-media-to-discord',
                { name: file.name, type: file.type, text: text, data: buf },
                (err, res) => {
                    if (err) { showNotice("That took too long and didn't send. Try again."); return; }
                    if (!res || !res.ok) showNotice((res && res.error) || "Couldn't send that file. Try again.");
                }
            );
        }).catch(() => showNotice("Couldn't read that file."));
    }

    function handleSend() {
        const text = inputField.value.trim();
        if (pendingFile) { sendFile(pendingFile, text); return; }
        if (!text) return;

        addMessage(text, 'lya');
        inputField.value = '';
        closeEmoji();

        if (socket.connected) {
            socket.emit('send-to-discord', { text: text });
        } else {
            addMessage("I can't receive that right now, baby. The server is offline. Message me on Discord!", 'elle');
        }
    }

    sendBtn.addEventListener('click', handleSend);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

})();
