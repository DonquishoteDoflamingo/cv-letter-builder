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