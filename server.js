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
