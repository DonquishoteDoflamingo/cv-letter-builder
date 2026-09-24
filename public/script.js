// Splash screen: shows every visit, tied to real page load rather than a
// blind timer, with a floor (never flashes) and ceiling (never stuck).
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

// Storage Keys
const DRAFT_KEY = 'recol_form_draft';
const HISTORY_KEY = 'recol_saved_history';

// DOM Elements
const inputs = ['fullName', 'email', 'phoneNumber', 'targetJob', 'company', 'experienceLevel', 'tone', 'bio'];
const cvView = document.getElementById('cvView');
const letterView = document.getElementById('letterView');
const generateBtn = document.getElementById('generateBtn');
const templateSelect = document.getElementById('templateTheme');
const historyModal = document.getElementById('historyModal');
const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const historyBtn = document.getElementById('historyBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const atsInsightsBar = document.getElementById('atsInsightsBar');
const atsScoreValue = document.getElementById('atsScoreValue');
const atsKeywords = document.getElementById('atsKeywords');
const atsTip = document.getElementById('atsTip');

// 1. AUTOSAVE & RESTORE INPUTS
function saveDraft() {
    const draft = {};
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) draft[id] = el.value;
    });
    const countrySelect = document.getElementById('countryCode');
    if (countrySelect && countrySelect.selectedOptions[0]) {
        draft.countryIso = countrySelect.selectedOptions[0].dataset.iso;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restoreDraft() {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
        try {
            const draft = JSON.parse(saved);
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el && draft[id]) el.value = draft[id];
            });
        } catch (e) {
            console.error(e);
        }
    }
}
restoreDraft();

// Attach listener to every input field
inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', saveDraft);
        el.addEventListener('change', saveDraft);
    }
});

// Clear Form
const resetFormBtn = document.getElementById('resetFormBtn');
if (resetFormBtn) {
    resetFormBtn.addEventListener('click', () => {
        if (confirm('Clear all fields?')) {
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            localStorage.removeItem(DRAFT_KEY);
        }
    });
}

// COUNTRY CODE SELECTOR
// Flag emojis are built from two Unicode "regional indicator" characters —
// no image files needed.
function isoToFlag(iso) {
    return iso
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function populateCountrySelect(defaultIso) {
    const select = document.getElementById('countryCode');
    if (!select || typeof COUNTRY_CODES === 'undefined') return;

    const sorted = [...COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = '';
    sorted.forEach(country => {
        const option = document.createElement('option');
        option.value = country.dial;
        option.dataset.iso = country.iso;
        option.textContent = `${country.dial}  ${isoToFlag(country.iso)} ${country.name}`;
        select.appendChild(option);
    });

    const isoToUse = defaultIso || 'CM';
    const defaultIndex = sorted.findIndex(c => c.iso === isoToUse);
    if (defaultIndex > -1) select.selectedIndex = defaultIndex;
}

// Ask the server which country this visitor is probably in (see
// /api/geo in server.js). Fails open: any problem just resolves to null,
// and populateCountrySelect() falls back to its own default.
async function detectVisitorCountry() {
    try {
        const res = await fetch('/api/geo');
        const data = await res.json();
        return data.country || null;
    } catch {
        return null;
    }
}

const countryCodeSelect = document.getElementById('countryCode');
if (countryCodeSelect) {
    countryCodeSelect.addEventListener('change', saveDraft);

    (async () => {
        let savedDraft = {};
        try {
            savedDraft = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
        } catch { /* ignore corrupt draft */ }

        // A country the person already picked before wins over a fresh
        // geo-guess — never override an explicit choice.
        const isoToUse = savedDraft.countryIso || await detectVisitorCountry();
        populateCountrySelect(isoToUse);
    })();
}

// 2. TEMPLATE THEME + INDEPENDENT COLOR CONTROLS
// Background, heading color, and text color are fully independent now —
// applied as CSS custom properties (--doc-bg / --doc-heading / --doc-text)
// directly on the element, rather than baked into fixed combo classes.
// Each one is remembered separately, so any combination is possible: a
// sky blue background with green headings and black body text, etc.
const bgColorSelect = document.getElementById('bgColor');
const headingColorSelect = document.getElementById('headingColor');
const textColorSelect = document.getElementById('textColor');

let currentTheme = localStorage.getItem('recol_theme') || 'theme-modern';
let currentBg = localStorage.getItem('recol_bg_color') || '#ffffff';
let currentHeading = localStorage.getItem('recol_heading_color') || '#0284c7';
let currentText = localStorage.getItem('recol_text_color') || '#1e293b';

function applyDocStyles() {
    [cvView, letterView].forEach(view => {
        const isActive = view.classList.contains('active');
        view.className = `tab-content doc-sheet ${currentTheme} ${isActive ? 'active' : ''}`.trim();
        view.style.setProperty('--doc-bg', currentBg);
        view.style.setProperty('--doc-heading', currentHeading);
        view.style.setProperty('--doc-text', currentText);
    });
}

if (templateSelect) {
    templateSelect.value = currentTheme;
    templateSelect.addEventListener('change', (e) => {
        currentTheme = e.target.value;
        localStorage.setItem('recol_theme', currentTheme);
        applyDocStyles();
    });
}

if (bgColorSelect) {
    bgColorSelect.value = currentBg;
    bgColorSelect.addEventListener('change', (e) => {
        currentBg = e.target.value;
        localStorage.setItem('recol_bg_color', currentBg);
        applyDocStyles();
    });
}

if (headingColorSelect) {
    headingColorSelect.value = currentHeading;
    headingColorSelect.addEventListener('change', (e) => {
        currentHeading = e.target.value;
        localStorage.setItem('recol_heading_color', currentHeading);
        applyDocStyles();
    });
}

if (textColorSelect) {
    textColorSelect.value = currentText;
    textColorSelect.addEventListener('change', (e) => {
        currentText = e.target.value;
        localStorage.setItem('recol_text_color', currentText);
        applyDocStyles();
    });
}

applyDocStyles();

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
}

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Updates / News feed
async function loadNews() {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;
    try {
        const res = await fetch('/api/news');
        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) throw new Error('empty');

        grid.innerHTML = items.map(item => {
            const tag = item.url ? 'a' : 'div';
            const linkAttrs = item.url ? `href="${item.url}" target="_blank" rel="noopener noreferrer"` : '';
            const thumb = item.thumbnail ? `<img src="${item.thumbnail}" alt="" class="news-thumb" loading="lazy"/>` : '';
            return `
                <${tag} class="news-card" ${linkAttrs}>
                    ${thumb}
                    <span class="news-tag">${item.tag || 'Update'}</span>
                    <h3>${item.title}</h3>
                    <p>${item.summary}</p>
                    <div class="news-meta">${item.source || 'Recol Builder Assist'}${item.date ? ' · ' + item.date : ''}</div>
                </${tag}>
            `;
        }).join('');
    } catch (err) {
        grid.innerHTML = '<div class="news-card news-skeleton">Updates are unavailable right now. Check back soon.</div>';
    }
}
loadNews();

// 3. TAB SWITCHING LOGIC
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// 4. Print trigger
const printBtn = document.getElementById('printBtn');
if (printBtn) printBtn.addEventListener('click', () => window.print());

// Copy Button
const copyBtn = document.getElementById('copyBtn');
if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab-content.active');
        const text = activeTab.innerText;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = 'Copied!';
            setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
        });
    });
}

// WhatsApp share — opens a chat with the active document's text prefilled,
// letting the person pick who to send it to (an HR contact, themselves, etc.)
const whatsappBtn = document.getElementById('whatsappBtn');
if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab-content.active');
        const text = activeTab.innerText.trim();
        if (!text) {
            alert('Generate your CV or letter first.');
            return;
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    });
}

// Save as Word (.doc) — a well-established, dependency-free trick: Word
// opens HTML files saved with a .doc extension and the right MIME type
// just fine. No library, no server round-trip, no CDN script needed.
// Word ignores our CSS variables, so the three chosen colors are baked
// in directly: background/text on the body, heading color applied to
// every heading tag via a cloned copy of the document.
const wordBtn = document.getElementById('wordBtn');
if (wordBtn) {
    wordBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || !activeTab.innerText.trim()) {
            alert('Generate your CV or letter first.');
            return;
        }

        const isLetter = activeTab.id === 'letterView';

        // The letter is plain text with soft line breaks handled by CSS
        // (white-space: pre-line) — Word doesn't reliably honor that
        // property, so breaks are turned into real <p> tags for export.
        let contentHtml;
        if (isLetter) {
            contentHtml = activeTab.innerText.trim().split('\n').map(line => `<p style="margin:0 0 8px;">${line || '&nbsp;'}</p>`).join('');
        } else {
            const clone = activeTab.cloneNode(true);
            clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
                h.style.color = currentHeading;
            });
            contentHtml = clone.innerHTML;
        }

        const fullHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset="utf-8"><title>Export</title></head>
            <body style="background:${currentBg}; color:${currentText}; padding:40px; font-family:Calibri, Arial, sans-serif; line-height:1.5;">
                ${contentHtml}
            </body></html>`;

        const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);

        const nameForFile = (document.getElementById('fullName').value.trim() || 'Document').replace(/\s+/g, '_');
        const label = isLetter ? 'Cover_Letter' : 'CV';

        const link = document.createElement('a');
        link.href = url;
        link.download = `${nameForFile}_${label}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}

// 5. HISTORY MANAGEMENT
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
        return [];
    }
}

function updateHistoryBadge() {
    if (historyCount) historyCount.innerText = getHistory().length;
}

function saveToHistory(item) {
    const list = getHistory();
    list.unshift(item);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 15))); // Keep last 15
    updateHistoryBadge();
}

function renderHistoryModal() {
    const list = getHistory();
    if (list.length === 0) {
        historyList.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 2rem;">No saved applications yet.</p>';
        return;
    }

    historyList.innerHTML = list.map((item, idx) => `
    <div class="history-item">
    <div class="history-info">
    <h4>${item.targetJob} ${item.company ? '@ ' + item.company : ''}</h4>
    <p>${new Date(item.date).toLocaleDateString()} &bull; ${item.fullName}</p>
    </div>
    <div class="history-item-actions">
    <button class="btn-secondary" onclick="loadHistoryItem(${idx})">Load</button>
    <button class="btn-text" onclick="deleteHistoryItem(${idx})" style="color: #f87171;">Delete</button>
    </div>
    </div>`
).join('');
}

window.loadHistoryItem = function(index) {
    const list = getHistory();
    const item = list[index];
    if (!item) return;

    inputs.forEach(id => {
        if (item.inputs && item.inputs[id]) {
            const el = document.getElementById(id);
            if (el) el.value = item.inputs[id];
        }
    });

    if (item.inputs && item.inputs.countryIso) {
        const select = document.getElementById('countryCode');
        if (select) {
            const match = [...select.options].find(o => o.dataset.iso === item.inputs.countryIso);
            if (match) select.value = match.value;
        }
    }

    cvView.innerHTML = item.cv;
    cvView.setAttribute('contenteditable', 'true');
    letterView.innerHTML = `<div style="white-space: pre-line;">${item.letter}</div>`;
    letterView.setAttribute('contenteditable', 'true');

    saveDraft();
    historyModal.classList.remove('show');
};

window.deleteHistoryItem = function(index) {
    const list = getHistory();
    list.splice(index, 1);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    updateHistoryBadge();
    renderHistoryModal();
};

if (historyBtn && historyModal) {
    historyBtn.addEventListener('click', () => {
        renderHistoryModal();
        historyModal.classList.add('show');
    });
}

if (closeHistoryBtn && historyModal) {
    closeHistoryBtn.addEventListener('click', () => {
        historyModal.classList.remove('show');
    });
}

updateHistoryBadge();

// 6. ATS INSIGHTS
function renderAtsInsights(data) {
    if (!atsInsightsBar) return;
    if (typeof data.atsScore !== 'number') {
        atsInsightsBar.style.display = 'none';
        return;
    }
    atsInsightsBar.style.display = 'flex';
    atsScoreValue.textContent = `${data.atsScore}%`;
    atsKeywords.innerHTML = (data.atsKeywords || [])
        .map(kw => `<span class="keyword-chip">${kw}</span>`)
        .join('');
    atsTip.textContent = data.atsTip || '';
}

// Submission & Live Generation
generateBtn.addEventListener('click', async () => {
    const countryCodeVal = document.getElementById('countryCode').value;
    const phoneNumberVal = document.getElementById('phoneNumber').value.trim();
    const countryIsoVal = document.getElementById('countryCode').selectedOptions[0]?.dataset.iso;

    const payload = {
        fullName: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: [countryCodeVal, phoneNumberVal].filter(Boolean).join(' '),
        phoneNumber: phoneNumberVal,       // kept only so history can restore the split field later
        countryIso: countryIsoVal,          // same purpose — not read by the server
        targetJob: document.getElementById('targetJob').value.trim(),
        company: document.getElementById('company').value.trim(),
        experienceLevel: document.getElementById('experienceLevel').value,
        tone: document.getElementById('tone').value,
        bio: document.getElementById('bio').value.trim(),
        language: window.RECOL_LANG || 'en',
    };

    if (!payload.fullName || !payload.targetJob || !payload.bio) {
        alert('Please provide your name, target role, and a few notes about your background.');
        return;
    }
    generateBtn.textContent = 'Crafting tailored documents...';
    generateBtn.disabled = true;

    cvView.innerHTML = '<div class="placeholder-state">Building ATS-optimized CV...</div>';
    letterView.innerHTML = '<div class="placeholder-state">Writing personalized application letter...</div>';

    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            cvView.innerHTML = data.cv;
            cvView.setAttribute('contenteditable', 'true');

            letterView.innerHTML = `<div style="white-space: pre-line;">${data.letter}</div>`;
            letterView.setAttribute('contenteditable', 'true');

            renderAtsInsights(data);

            saveToHistory({
                date: Date.now(),
                fullName: payload.fullName,
                targetJob: payload.targetJob,
                company: payload.company,
                inputs: payload,
                cv: data.cv,
                letter: data.letter
            });
        } else {
            alert(data.error || 'Something went wrong.');
        }
    } catch (err) {
        alert('Failed to connect to the server. Check your connection.');
    } finally {
        generateBtn.textContent = 'Generate CV & Letter';
        generateBtn.disabled = false;
    }
});