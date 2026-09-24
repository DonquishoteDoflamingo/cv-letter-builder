document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});

// Splash screen: shows every visit ("feels pro and normal" per your call),
// tied to real page load rather than a blind timer, with a floor so it
// never flashes and a ceiling so it can never get stuck.
(function () {
    const MIN_DISPLAY_MS = 3000;
    const MAX_DISPLAY_MS = 7000;
    const start = Date.now();
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    document.body.classList.add('splash-active');

    function hideSplash() {
        splash.classList.add('hide');
        document.body.classList.remove('splash-active');
    }

    function readyToHide() {
        const elapsed = Date.now() - start;
        setTimeout(hideSplash, Math.max(MIN_DISPLAY_MS - elapsed, 0));
    }

    if (document.readyState === 'complete') {
        readyToHide();
    } else {
        window.addEventListener('load', readyToHide);
    }

    setTimeout(hideSplash, MAX_DISPLAY_MS);
})();
