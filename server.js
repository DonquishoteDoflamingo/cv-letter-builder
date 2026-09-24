const express = require('express');
const path = require('path');
const OpenAI =  require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route so "/app" resolves cleanly (the static middleware alone
// won't map a path with no extension to app.html).
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Initializing AI Client
const isGroq = process.env.AI_PROVIDER === 'groq';
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined
});

const MODEL = isGroq ? 'openai/gpt-oss-120b' : 'gpt-4o-mini';

// Language names for the AI prompt, keyed by the same codes the frontend uses.
const LANGUAGE_NAMES = {
    en: 'English',
    fr: 'French'
};

// Small, dependency-free per-IP rate limiter for the AI endpoint specifically
// — that's the one that costs real money/quota per call, unlike static
// pages. 8 requests per 10 minutes per IP is generous for a real user
// trying the tool, but stops a script from burning your daily Groq quota
// in seconds.
const rateLimitHits = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 8;

function isRateLimited(ip) {
    const now = Date.now();
    const hits = (rateLimitHits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    hits.push(now);
    rateLimitHits.set(ip, hits);
    return hits.length > RATE_LIMIT_MAX;
}

// Shared helper: the real visitor IP, respecting Render's proxy header.
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

// --- Visitor country auto-detect (for pre-selecting the phone code) ---
// Done server-side on purpose: the server already sees the real client IP
// from the request itself, so nothing needs exposing in the browser, and
// nothing the client sends can be spoofed to fake a different country.
//
// Design choices, deliberately conservative:
// - ipapi.co over ip-api.com: it supports HTTPS, keeping the whole request
//   encrypted end to end.
// - Fails open everywhere: any error, timeout, or rate limit just returns
//   { country: null } so the page's own default silently takes over. This
//   endpoint should never be able to break or slow down the form.
// - Per-IP cache (6h) so a visitor reloading the page doesn't trigger a
//   fresh lookup every time.
// - A global hourly cap protects the shared free quota even if someone
//   spoofs many different IPs to bypass the per-IP cache.
// - Nothing is logged or persisted beyond this in-memory cache, which
//   clears on every restart.
const geoCache = new Map(); // ip -> { country, timestamp }
const GEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GEO_GLOBAL_MAX_PER_HOUR = 200;
let geoCallsThisHour = 0;
let geoWindowStart = Date.now();

app.get('/api/geo', async (req, res) => {
    const ip = getClientIp(req);

    // Local/dev traffic has no public IP to look up — nothing to detect.
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) {
        return res.json({ country: null });
    }

    const cached = geoCache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < GEO_CACHE_TTL_MS) {
        return res.json({ country: cached.country });
    }

    if (Date.now() - geoWindowStart > 60 * 60 * 1000) {
        geoCallsThisHour = 0;
        geoWindowStart = Date.now();
    }
    if (geoCallsThisHour >= GEO_GLOBAL_MAX_PER_HOUR) {
        return res.json({ country: null });
    }
    geoCallsThisHour++;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
        clearTimeout(timeout);

        if (!geoRes.ok) throw new Error(`Geo API responded ${geoRes.status}`);
        const data = await geoRes.json();
        const country = data.country_code || null;

        geoCache.set(ip, { country, timestamp: Date.now() });
        res.json({ country });
    } catch (error) {
        console.error('Geo lookup error:', error.message);
        res.json({ country: null });
    }
});

// Curated fallback content — shown if the news feed fails to load for any
// reason (outage, network hiccup, unexpected format change, etc.).
const FALLBACK_UPDATES = [
    {
        tag: 'Resume tip',
        title: 'Quantify your impact, not just your duties',
        summary: 'Hiring managers skim. Numbers ("cut costs 18%", "led team of 6") catch the eye far faster than a list of responsibilities.',
        source: 'Recol Builder Assist'
    },
    {
        tag: 'Job market',
        title: 'ATS systems now read structure, not just keywords',
        summary: 'Modern applicant-tracking software increasingly parses headings and bullet structure — clean formatting matters as much as wording.',
        source: 'Recol Builder Assist'
    },
    {
        tag: 'Cover letters',
        title: 'Shorter is working better in 2026',
        summary: 'Recruiters report skimming cover letters in under 20 seconds. Three tight paragraphs beat one dense page.',
        source: 'Recol Builder Assist'
    }
];

// Tiny helper: pulls one tag's text out of a chunk of XML, strips CDATA
// wrappers, decodes the handful of entities RSS actually uses, and strips
// any nested HTML tags. Good enough for Google News' feed shape — no XML
// parsing library needed.
function extractTag(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    if (!match) return '';
    return match[1]
        .replace('<![CDATA[', '').replace(']]>', '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '')
        .trim();
}

// Google News' RSS search feed — a plain public URL, no key, no signup,
// no console. It's unofficial (Google doesn't document or guarantee it),
// so we always have FALLBACK_UPDATES ready in case it ever changes shape.
async function fetchNewsFromGoogleNews() {
    const query = encodeURIComponent('job search tips OR resume advice OR career advice');
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Google News feed responded ${res.status}`);
    const xml = await res.text();

    const rawItems = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 3);
    if (rawItems.length === 0) throw new Error('No items in feed');

    return rawItems.map(itemXml => {
        const rawTitle = extractTag(itemXml, 'title');
        // Google News titles are usually "Headline - Source Name"
        const splitAt = rawTitle.lastIndexOf(' - ');
        const title = splitAt > -1 ? rawTitle.slice(0, splitAt) : rawTitle;
        const source = splitAt > -1 ? rawTitle.slice(splitAt + 3) : 'Google News';
        const pubDate = extractTag(itemXml, 'pubDate');

        return {
            tag: 'News',
            title,
            summary: `Full story via ${source}.`,
            source,
            date: pubDate ? new Date(pubDate).toLocaleDateString() : '',
            url: extractTag(itemXml, 'link')
        };
    });
}

// Server-side cache: one feed fetch per 24h, no matter how many visitors
// load the page — naturally delivers "a few updates per day" and is
// gentle to Google's servers.
let newsCache = { data: null, timestamp: 0 };
const NEWS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

app.get('/api/news', async (req, res) => {
    const now = Date.now();

    if (newsCache.data && (now - newsCache.timestamp) < NEWS_CACHE_TTL_MS) {
        return res.json(newsCache.data);
    }

    try {
        const items = await fetchNewsFromGoogleNews();
        newsCache = { data: items, timestamp: now };
        res.json(items);
    } catch (error) {
        console.error('News fetch error:', error);
        newsCache = { data: FALLBACK_UPDATES, timestamp: now };
        res.json(FALLBACK_UPDATES);
    }
});

// Generation endpoint
app.post('/api/generate', async (req, res) => {
    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    }

    const {
        fullName,
        email,
        phone,
        bio,
        targetJob,
        company,
        experienceLevel,
        tone,
        language
    } = req.body;

    if (!fullName || !bio || !targetJob) {
        return res.status(400).json({ error: 'Please provide at least your name, background, and target job.'});
    }

    // Cap input length: protects against runaway token costs and
    // prompt-injection attempts hidden in a huge paste.
    const MAX_BIO_LENGTH = 4000;
    const MAX_SHORT_FIELD_LENGTH = 200;
    if (bio.length > MAX_BIO_LENGTH) {
        return res.status(400).json({ error: `Please keep your background notes under ${MAX_BIO_LENGTH} characters.` });
    }
    for (const [label, value] of Object.entries({ fullName, targetJob, company, phone, email })) {
        if (value && value.length > MAX_SHORT_FIELD_LENGTH) {
            return res.status(400).json({ error: `${label} is too long.` });
        }
    }

    const languageName = LANGUAGE_NAMES[language] || 'English';

    const systemInstruction = `You are an elite universal career consultant and hiring manager. Your job is to transform raw, messy user input into:
    1. A world-class, ATS-compliant CV formatted in clean HTML.
    2. A compelling, non-robotic or non-generic Letter of Submission / Cover Letter.
    3. A quick, honest ATS-compatibility self-assessment of what you produced.

    UNIVERSAL ADAPTABILITY RULES:
    - For Entry-Level / Students: Focus on transferable skills, coursework, informal work, enthusiasm, and rapid learning ability. Just arrange the content and language to make it feel professional and credible, but do not overdo it, and neither should you use overly complex language, or add what has not been specified by the user, especially for experience, company or institution.
    - For Trades / Service / Blue-Collar: Focus on reliability, hands-on skills, safety, speed, and proven output.
    - For Mid/Senior / Tech / Corporate: Use active verbs, quantified results (Example: "improved by X%", "managed team of Y"), and strategic leadership keywords.
    - Tone: Natural, confident, and human. Avoid clichés like "I am writing with immense delight" or "I am a motivated self-starter".
    - Write everything — the CV, the letter, and the ATS tip — entirely in ${languageName}. Keep the JSON keys themselves in English exactly as specified below.

    CRITICAL: Return ONLY a valid JSON object matching this exact schema:
    {
    "cv": "<div class='cv-rendered'>...HTML with <h3>, <p>, <ul>, <li>, <strong> tags...</div>",
    "letter": "Text of the letter with standard spacing...",
    "atsScore": 0-100 integer estimating how well this CV would pass an ATS scan for the target role,
    "atsKeywords": ["3 to 6 short keywords/phrases from the target role that this CV successfully includes"],
    "atsTip": "One short, specific sentence suggesting the single highest-impact improvement"
    }`;

    const userPrompt = `
    - Full Name: ${fullName}
    - Email: ${email || 'Not specified'}
    - Phone / Location: ${phone || 'Not specified'}
    - Target Job / post: ${targetJob}
    - Company / Target Place: ${company || 'Hiring Manager / Committee'}
    - Experience Level: ${experienceLevel}
    - Desired Tone: ${tone}

    Raw Background / Skills Provided:
    """
    ${bio}
    """
    `;

    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            response_format: { type: 'json_object'},
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7
        });

        const parsedResult = JSON.parse(response.choices[0].message.content);
        res.json(parsedResult);
    } catch (error) {
        console.error('AI Generation Error:', error);
        res.status(500).json({ error: 'Failed to generate documents. Please, check your API Key'});
    }
    });

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});