// Shared "Install App" logic for both pages.
// Chrome/Edge/Android fire a real 'beforeinstallprompt' event we can hook
// a button to. iOS Safari has no such event — there's no way to trigger
// its install programmatically — so it gets manual instructions instead.
// If the site is already running as an installed app, the whole thing
// hides itself since there's nothing left to offer.

let deferredInstallPrompt = null;

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function showInstallUI() {
    document.querySelectorAll('.install-card').forEach(card => {
        card.style.display = 'flex';
    });
}

function hideInstallUI() {
    document.querySelectorAll('.install-card').forEach(card => {
        card.style.display = 'none';
    });
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!isStandalone()) showInstallUI();
});

window.addEventListener('appinstalled', hideInstallUI);

document.addEventListener('DOMContentLoaded', () => {
    if (isStandalone()) {
        hideInstallUI();
        return;
    }

    // iOS never fires beforeinstallprompt, so show its own instructions
    // right away rather than waiting for an event that will never come.
    if (isIOS()) {
        document.querySelectorAll('.install-ios-steps').forEach(el => { el.style.display = 'block'; });
        document.querySelectorAll('.install-android-btn').forEach(el => { el.style.display = 'none'; });
        showInstallUI();
    }

    document.querySelectorAll('.install-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') hideInstallUI();
            deferredInstallPrompt = null;
        });
    });
});
