const express = require('express');
const path = require('path');
const OpenAI =  require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initializing AI Client
const isGroq = process.env.AI_PROVIDER === 'groq';
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined
});

const MODEL = isGroq ? 'openai/gpt-oss-120b' : 'gpt-4o-mini';

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
    const {
        fullName,
        email,
        phone,
        bio,
        targetJob,
        company,
        experienceLevel,
        tone
    } = req.body;

    if (!fullName || !bio || !targetJob) {
        return res.status(400).json({ error: 'Please provide at least your name, background, and target job.'});
    }

    const systemInstruction = `You are an elite universal career consultant and hiring manager. Your job is to transform raw, messy user input into:
    1. A world-class, ATS-compliant CV formatted in clean HTML.
    2. A compelling, non-robotic or non-generic Letter of Submission / Cover Letter.
    
    UNIVERSAL ADAPTABILITY RULES:
    - For Entry-Level / Students: Focus on transferable skills, coursework, informal work, enthusiasm, and rapid learning ability.
    - For Trades / Service / Blue-Collar: Focus on reliability, hands-on skills, safety, speed, and proven output.
    - For Mid/Senior / Tech / Corporate: Use active verbs, quantified results (Example: "improved by X%", "managed team of Y"), and strategic leadership keywords.
    - Tone: Natural, confident, and human. Avoid clichés like "I am writing with immense delight" or "I am a motivated self-starter".
    
    CRITICAL: Return ONLY a valid JSON object matching this exact schema:
    {
    "cv": "<div class='cv-rendered'>...HTML with <h3>, <p>, <ul>, <li>, <strong> tags...</div>",
    "letter": "Text of the letter with standard spacing..."
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