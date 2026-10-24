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
    }, 1600);
})();

/* ============================================
   RANDOM BACKGROUND IMAGE
   ============================================ */

(function () {
    const left  = document.getElementById('slideshow-left');
    const right = document.getElementById('slideshow-right');
    if (!left || !right) return;

    const images = [
        'images/slides/slide_1.png',
        'images/slides/slide_2.png',
        'images/slides/slide_3.png',
    ];

    if (images.length === 0) return;

    const pick = images[Math.floor(Math.random() * images.length)];
    const url = `url('${pick}')`;
    left.style.backgroundImage  = url;
    right.style.backgroundImage = url;
})();

/* ============================================
   KEYBOARD SUPPORT for role="button"
   ============================================ */

document.querySelectorAll('[role="button"][tabindex="0"]').forEach((el) => {
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
        }
    });
});

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
    const icon     = document.getElementById(iconId);
    const windowEl = document.getElementById(windowId);
    const closeBtn = document.getElementById(closeId);
    const frame    = windowEl && windowEl.querySelector('.window');
    const titlebar = frame && frame.querySelector('.window-titlebar');

    if (!icon || !windowEl || !closeBtn || !frame || !titlebar) return null;

    const setActive = (active) => {
        frame.classList.toggle('is-inactive', !active);
    };

    let isDragging = false;
    let startPointerX = 0, startPointerY = 0;
    let startOffsetX = 0,  startOffsetY = 0;
    let offsetX = 0, offsetY = 0;

    const applyTransform = () => {
        frame.style.transform =
            `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    };

    const resetPosition = () => {
        offsetX = 0;
        offsetY = 0;
        frame.style.transform = '';
    };

    const onPointerDown = (e) => {
        if (e.target.closest('.window-close')) return;
        if (e.button !== 0) return;
        isDragging = true;
        startPointerX = e.clientX;
        startPointerY = e.clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
        titlebar.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;

        let newOffsetX = startOffsetX + (e.clientX - startPointerX);
        let newOffsetY = startOffsetY + (e.clientY - startPointerY);

        const overlayRect = windowEl.getBoundingClientRect();
        const winW = frame.offsetWidth;
        const winH = frame.offsetHeight;

        const minOffsetX = -overlayRect.width / 2 + winW / 2;
        const maxOffsetX =  overlayRect.width / 2 - winW / 2;
        const minOffsetY = -overlayRect.height / 2 + winH / 2;
        const maxOffsetY =  overlayRect.height / 2 - winH / 2;

        if (minOffsetX > maxOffsetX) {
            newOffsetX = (minOffsetX + maxOffsetX) / 2;
        } else {
            newOffsetX = Math.max(minOffsetX, Math.min(newOffsetX, maxOffsetX));
        }
        if (minOffsetY > maxOffsetY) {
            newOffsetY = (minOffsetY + maxOffsetY) / 2;
        } else {
            newOffsetY = Math.max(minOffsetY, Math.min(newOffsetY, maxOffsetY));
        }

        offsetX = newOffsetX;
        offsetY = newOffsetY;
        applyTransform();
    };

    const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        if (titlebar.hasPointerCapture(e.pointerId)) {
            titlebar.releasePointerCapture(e.pointerId);
        }
    };

    titlebar.addEventListener('pointerdown', onPointerDown);
    titlebar.addEventListener('pointermove', onPointerMove);
    titlebar.addEventListener('pointerup', onPointerUp);
    titlebar.addEventListener('pointercancel', onPointerUp);

    const setOpen = (open) => {
        if (open) {
            if (!options.keepOthers) {
                closeOtherWindows(windowId);
            } else {
                document.querySelectorAll('.window-overlay.is-open').forEach((el) => {
                    if (el.id === windowId) return;
                    const f = el.querySelector('.window');
                    if (f) f.classList.add('is-inactive');
                });
            }
            windowEl.classList.add('is-open');
            windowEl.setAttribute('aria-hidden', 'false');
            setActive(true);
            closeBtn.focus();
        } else {
            windowEl.classList.remove('is-open');
            windowEl.setAttribute('aria-hidden', 'true');
            resetPosition();
            icon.focus();
        }
    };

    icon.addEventListener('click', () => setOpen(true));

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(false);
    });

    frame.addEventListener('mousedown', () => setActive(true));

    windowEl.addEventListener('click', (e) => {
        if (e.target === windowEl) setActive(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && windowEl.classList.contains('is-open')) {
            setOpen(false);
        }
    });

    return { setOpen };
}

setupDraggableWindow('folder-window',       'for-lya-icon',     'folder-close');
setupDraggableWindow('letter-window',       'letter-item',      'letter-close',       { keepOthers: true });
setupDraggableWindow('three-months-window', 'three-months-item', 'three-months-close', { keepOthers: true });
setupDraggableWindow('reminder-window',     'reminder-icon',    'reminder-close');
setupDraggableWindow('heart-window',        'heart-clicker',    'heart-close');

/* ============================================
   HEART CLICKER — spawn floating heart sprites + SFX
   ============================================ */

(function () {
    const content = document.getElementById('heart-clicker-content');
    if (!content) return;

    const hint     = content.querySelector('.heart-clicker-hint');
    const bigHeart = content.querySelector('.heart-big');

    const HEART_SRC   = 'images/desktop/heart.png';
    const SFX_SRC     = 'audio/per.mp3';
    const SFX_VOLUME  = 0.6;
    const LIFETIME_MS = 1500;

    const sfxTemplate = new Audio();
    sfxTemplate.src = SFX_SRC;
    sfxTemplate.preload = 'auto';
    sfxTemplate.volume = SFX_VOLUME;

    let hintHidden = false;

    const rand = (min, max) => min + Math.random() * (max - min);

    const playSfx = () => {
        const sfx = sfxTemplate.cloneNode();
        sfx.volume = SFX_VOLUME;
        const p = sfx.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {});
        }
    };

    content.addEventListener('click', (e) => {
        playSfx();

        if (!hintHidden && hint) {
            hint.classList.add('is-hidden');
            hintHidden = true;
        }

        const rect = content.getBoundingClientRect();
        const baseX = e.clientX - rect.left;
        const baseY = e.clientY - rect.top;

        const count = Math.random() < 0.35 ? 2 : 1;

        for (let i = 0; i < count; i++) {
            const offsetX = count > 1 ? rand(-12, 12) : 0;
            spawnHeart(baseX + offsetX, baseY + rand(-8, 8));
        }
    });

    if (bigHeart) {
        bigHeart.addEventListener('click', () => {
            bigHeart.classList.remove('is-tapped');
            void bigHeart.offsetWidth;
            bigHeart.classList.add('is-tapped');
        });
    }

    function spawnHeart(x, y) {
        const heart = document.createElement('img');
        heart.className = 'floating-heart';
        heart.src = HEART_SRC;
        heart.alt = '';

        const size = rand(12, 48).toFixed(0);
        heart.style.width  = size + 'px';
        heart.style.height = size + 'px';
        heart.style.left = x + 'px';
        heart.style.top  = y + 'px';
        heart.style.setProperty('--rot', rand(-20, 20).toFixed(1) + 'deg');

        content.appendChild(heart);

        setTimeout(() => {
            if (heart.parentNode) heart.parentNode.removeChild(heart);
        }, LIFETIME_MS);
    }
})();

/* ============================================
   START MENU
   ============================================ */

const startBtn  = document.querySelector('.start-btn');
const startMenu = document.getElementById('start-menu');

if (startBtn && startMenu) {
    const setMenuOpen = (open) => {
        startMenu.classList.toggle('is-open', open);
        startBtn.classList.toggle('is-pressed', open);
        startBtn.setAttribute('aria-pressed', String(open));
    };

    startBtn.addEventListener('click', () => {
        setMenuOpen(!startMenu.classList.contains('is-open'));
    });

    document.addEventListener('click', (e) => {
        if (startBtn.contains(e.target)) return;
        if (startMenu.contains(e.target)) return;
        setMenuOpen(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setMenuOpen(false);
    });
}

/* ============================================
   RESTART BUTTON
   ============================================ */

const restartBtn = document.getElementById('restart-btn');

if (restartBtn) {
    let navigating = false;

    restartBtn.addEventListener('click', () => {
        if (navigating) return;
        navigating = true;

        restartBtn.classList.add('is-pressed');

        setTimeout(() => {
            restartBtn.classList.remove('is-pressed');

            setTimeout(() => {
                window.location.href = 'index.html';
            }, 100);
        }, 150);
    });
}

/* ============================================
   BACKGROUND MUSIC
   ============================================ */

const bgMusic = document.getElementById('bg-music');

if (bgMusic) {
    bgMusic.volume = 0.05;
    bgMusic.play().catch(() => {});

    document.addEventListener('pointerdown', () => {
        if (bgMusic.paused) bgMusic.play().catch(() => {});
    }, { once: true });
}
