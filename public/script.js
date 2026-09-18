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

// Tab Switching Logic
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

// Print trigger
document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
});

// Copy Letter Button
document.getElementById('copyBtn').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab-content.active');
    const text = activeTab.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = document.getElementById('copyBtn').innerText;
        document.getElementById('copyBtn').innerText = 'Copied!';
        setTimeout(() => {
            document.getElementById('copyBtn').innerText = originalText;
        }, 2000);
    });
});

// Submission & Live Generation
document.getElementById('generateBtn').addEventListener('click', async () => {
    const btn = document.getElementById('generateBtn');
    const cvView = document.getElementById('cvView');
    const letterView = document.getElementById('letterView');

    const payload = {
        fullName: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        targetJob: document.getElementById('targetJob').value.trim(),
        company: document.getElementById('company').value.trim(),
        experienceLevel: document.getElementById('experienceLevel').value,
        tone: document.getElementById('tone').value,
        bio: document.getElementById('bio').value.trim(),
    };

    if (!payload.fullName || !payload.targetJob || !payload.bio) {
        alert('Please provide your name, target role, and a few notes about your background.');
        return;
    }
    btn.textContent = 'Crafting tailored documents...';
    btn.disabled = true;

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
            // Enable edit by clicking directly
            cvView.setAttribute('contenteditable', 'true');

            letterView.innerHTML = `<div style="white-space: pre-line;">${data.letter}</div>`;
            letterView.setAttribute('contenteditable', 'true');
        } else {
            alert(data.error || 'Something went wrong.');
        }
    } catch (err) {
        alert('Failed to connect to the server. Check your connection.');
    } finally {
        btn.textContent = 'Generate CV & Letter';
        btn.disabled = false;
    }
});