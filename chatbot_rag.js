const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class ChatbotRagEngine {
    constructor(dataDir) {
        this.dataDir = dataDir || process.env.WAPP_DATA_PATH || process.cwd();
        this.sourcesFile = path.join(this.dataDir, 'rag_sources.json');
        this.chunksFile = path.join(this.dataDir, 'rag_chunks.json');
        this.learnedFile = path.join(this.dataDir, 'learned_knowledge.json');
        this.settingsFile = path.join(this.dataDir, 'chatbot_settings.json');

        // Sliding window of recent incoming inquiries from contacts (phone -> { text, timestamp })
        this.pendingInquiries = new Map();

        // In-memory caches
        this.sources = [];
        this.chunks = [];
        this.learnedPairs = [];
        this.settings = {
            autoLearn: true,          // Automatically learn from outgoing replies
            autoReply: true,          // Automatically reply when matching knowledge
            useRag: true,             // Use website/document chunks for answers
            similarityThreshold: 0.45,// Minimum score (0.0 to 1.0) to trigger auto-reply
            maxResponseLength: 400    // Cap response length
        };

        this.loadAll();
    }

    loadAll() {
        try {
            if (fs.existsSync(this.sourcesFile)) {
                this.sources = JSON.parse(fs.readFileSync(this.sourcesFile, 'utf8'));
            }
            if (fs.existsSync(this.chunksFile)) {
                this.chunks = JSON.parse(fs.readFileSync(this.chunksFile, 'utf8'));
            }
            if (fs.existsSync(this.learnedFile)) {
                this.learnedPairs = JSON.parse(fs.readFileSync(this.learnedFile, 'utf8'));
            } else {
                // Pre-seed from chatbot_templates.json if available
                const templatePath = path.join(process.cwd(), 'chatbot_templates.json');
                if (fs.existsSync(templatePath)) {
                    try {
                        const tmpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
                        if (Array.isArray(tmpl.templates)) {
                            this.learnedPairs = tmpl.templates.map((t, idx) => ({
                                id: `tmpl_${idx}`,
                                question: t.keyword,
                                answer: t.response,
                                source: 'template',
                                uses: 0,
                                createdAt: new Date().toISOString()
                            }));
                            this.saveLearned();
                        }
                    } catch {}
                }
            }
            if (fs.existsSync(this.settingsFile)) {
                this.settings = { ...this.settings, ...JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')) };
            }
        } catch (e) {
            console.error('[ChatbotRag] Error loading data:', e.message);
        }
    }

    saveSources() {
        fs.writeFileSync(this.sourcesFile, JSON.stringify(this.sources, null, 2));
    }

    saveChunks() {
        fs.writeFileSync(this.chunksFile, JSON.stringify(this.chunks, null, 2));
    }

    saveLearned() {
        fs.writeFileSync(this.learnedFile, JSON.stringify(this.learnedPairs, null, 2));
    }

    saveSettings() {
        fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2));
    }

    // ─── Tokenization & Similarity ─────────────────────────────────────────────
    tokenize(text) {
        if (!text) return [];
        return text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
    }

    stem(word) {
        if (!word || word.length <= 3) return word;
        return word
            .replace(/(ing|tion|tions|ment|ments|ies|es|s|ed|er|ers)$/i, '')
            .trim();
    }

    tokensMatch(t1, t2) {
        if (t1 === t2) return true;
        const s1 = this.stem(t1);
        const s2 = this.stem(t2);
        if (s1 === s2) return true;
        if (s1.length >= 4 && s2.length >= 4 && (s1.startsWith(s2) || s2.startsWith(s1))) return true;
        return false;
    }

    calculateSimilarity(query, targetText) {
        if (!query || !targetText) return 0;
        const rawQueryTokens = this.tokenize(query);
        const rawTargetTokens = this.tokenize(targetText);
        if (rawQueryTokens.length === 0 || rawTargetTokens.length === 0) return 0;

        const STOP_WORDS = new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'between', 'into', 'through',
            'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over',
            'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
            'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
            'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should',
            'now', 'do', 'does', 'did', 'have', 'has', 'had', 'you', 'your', 'we', 'our', 'my', 'me', 'it', 'its',
            'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'ce', 'cette', 'ces', 'et', 'ou', 'mais',
            'est', 'sont', 'dans', 'en', 'sur', 'pour', 'avec', 'par', 'que', 'qui', 'quoi', 'comment'
        ]);

        let querySig = rawQueryTokens.filter(t => !STOP_WORDS.has(t));
        if (querySig.length === 0) querySig = rawQueryTokens;

        let matched = 0;
        for (const qToken of querySig) {
            if (rawTargetTokens.some(tToken => this.tokensMatch(qToken, tToken))) {
                matched++;
            }
        }

        const coverage = matched / querySig.length;

        // Substring bonus
        const cleanQ = query.toLowerCase().trim();
        const cleanT = targetText.toLowerCase().trim();
        if (cleanQ === cleanT) return 1.0;
        if (cleanT.includes(cleanQ) || cleanQ.includes(cleanT)) {
            return Math.max(coverage, 0.90);
        }

        return coverage;
    }

    // ─── Conversation Learning ────────────────────────────────────────────────
    recordIncoming(senderId, text) {
        if (!text || text.trim().length < 2) return;
        this.pendingInquiries.set(senderId, {
            text: text.trim(),
            timestamp: Date.now()
        });
    }

    recordOutgoing(recipientId, replyText) {
        if (!this.settings.autoLearn) return;
        if (!replyText || replyText.trim().length < 2) return;

        const pending = this.pendingInquiries.get(recipientId);
        if (!pending) return;

        // Only pair if reply was within 15 minutes
        const diffMinutes = (Date.now() - pending.timestamp) / (1000 * 60);
        if (diffMinutes > 15) {
            this.pendingInquiries.delete(recipientId);
            return;
        }

        const question = pending.text;
        const answer = replyText.trim();
        this.pendingInquiries.delete(recipientId);

        // Check if we already have a very similar question
        const existing = this.learnedPairs.find(p => this.calculateSimilarity(p.question, question) > 0.85);
        if (existing) {
            existing.answer = answer; // Update with latest answer
            existing.uses = (existing.uses || 0) + 1;
            existing.updatedAt = new Date().toISOString();
        } else {
            this.learnedPairs.push({
                id: `learned_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                question,
                answer,
                source: 'conversation',
                uses: 1,
                createdAt: new Date().toISOString()
            });
        }
        this.saveLearned();
        console.log(`[ChatbotRag] Learned new conversation pair: "${question.substring(0, 30)}..." -> "${answer.substring(0, 30)}..."`);
    }

    // ─── Query / Answer Matching ──────────────────────────────────────────────
    findBestAnswer(query) {
        if (!query) return null;

        // 1. First priority: Check Learned Q&A pairs
        let bestPair = null;
        let bestScore = 0;

        for (const pair of this.learnedPairs) {
            const score = this.calculateSimilarity(query, pair.question);
            if (score > bestScore) {
                bestScore = score;
                bestPair = pair;
            }
        }

        if (bestPair && bestScore >= this.settings.similarityThreshold) {
            bestPair.uses = (bestPair.uses || 0) + 1;
            this.saveLearned();
            return {
                answer: bestPair.answer,
                score: Math.round(bestScore * 100),
                sourceType: 'learned',
                sourceTitle: `Learned: "${bestPair.question}"`
            };
        }

        // 2. Second priority: Check RAG Website & Document Chunks
        if (this.settings.useRag && this.chunks.length > 0) {
            let bestChunk = null;
            let bestChunkScore = 0;

            for (const chunk of this.chunks) {
                const score = this.calculateSimilarity(query, chunk.text);
                if (score > bestChunkScore) {
                    bestChunkScore = score;
                    bestChunk = chunk;
                }
            }

            if (bestChunk && bestChunkScore >= (this.settings.similarityThreshold * 0.75)) {
                return {
                    answer: bestChunk.text.substring(0, this.settings.maxResponseLength),
                    score: Math.round(bestChunkScore * 100),
                    sourceType: 'website',
                    sourceTitle: bestChunk.sourceTitle || bestChunk.url || 'Website Knowledge'
                };
            }
        }

        return null;
    }

    // ─── Website Crawling & Ingestion (Puppeteer) ───────────────────────────────
    async ingestUrl(url, chromePath) {
        if (!url || !url.startsWith('http')) {
            throw new Error('Valid HTTP/HTTPS URL is required');
        }

        console.log(`[ChatbotRag] Crawling website: ${url}`);
        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: true,
                executablePath: chromePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Extract title and text content, stripping ads, nav, scripts
            const result = await page.evaluate(() => {
                const title = document.title || '';
                // Remove noisy elements
                const selectorsToRemove = ['script', 'style', 'nav', 'footer', 'iframe', 'noscript', '.cookie-banner', '#cookie-notice'];
                selectorsToRemove.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                });

                // Gather text blocks from headings and paragraphs
                const elements = document.querySelectorAll('h1, h2, h3, h4, p, li, blockquote');
                const texts = [];
                elements.forEach(el => {
                    const t = el.innerText ? el.innerText.trim() : '';
                    if (t.length > 20) texts.push(t);
                });

                return {
                    title,
                    text: texts.join('\n\n')
                };
            });

            await browser.close();
            browser = null;

            if (!result.text || result.text.length < 50) {
                throw new Error('Could not extract meaningful content from the webpage');
            }

            return this.ingestText(result.title || url, result.text, url);
        } catch (e) {
            if (browser) await browser.close();
            throw e;
        }
    }

    ingestText(title, rawText, sourceUrl = '') {
        const sourceId = `src_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        // Split text into semantic chunks of roughly 150-300 words
        const paragraphs = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 30);
        const newChunks = [];

        let currentChunk = '';
        for (const para of paragraphs) {
            if ((currentChunk + '\n\n' + para).length > 800) {
                if (currentChunk.trim().length > 30) {
                    newChunks.push({
                        id: `chunk_${Date.now()}_${newChunks.length}`,
                        sourceId,
                        sourceTitle: title,
                        url: sourceUrl,
                        text: currentChunk.trim()
                    });
                }
                currentChunk = para;
            } else {
                currentChunk = currentChunk ? (currentChunk + '\n\n' + para) : para;
            }
        }
        if (currentChunk.trim().length > 30) {
            newChunks.push({
                id: `chunk_${Date.now()}_${newChunks.length}`,
                sourceId,
                sourceTitle: title,
                url: sourceUrl,
                text: currentChunk.trim()
            });
        }

        const sourceRecord = {
            id: sourceId,
            title,
            url: sourceUrl,
            chunkCount: newChunks.length,
            characterCount: rawText.length,
            createdAt: new Date().toISOString()
        };

        this.sources.push(sourceRecord);
        this.chunks.push(...newChunks);
        this.saveSources();
        this.saveChunks();

        console.log(`[ChatbotRag] Ingested "${title}": ${newChunks.length} chunks created`);
        return { success: true, source: sourceRecord, chunkCount: newChunks.length };
    }

    deleteSource(sourceId) {
        this.sources = this.sources.filter(s => s.id !== sourceId);
        this.chunks = this.chunks.filter(c => c.sourceId !== sourceId);
        this.saveSources();
        this.saveChunks();
        return { success: true };
    }

    deleteLearnedPair(id) {
        this.learnedPairs = this.learnedPairs.filter(p => p.id !== id);
        this.saveLearned();
        return { success: true };
    }

    addLearnedPair(question, answer) {
        const id = `learned_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        this.learnedPairs.unshift({
            id,
            question: question.trim(),
            answer: answer.trim(),
            source: 'manual',
            uses: 0,
            createdAt: new Date().toISOString()
        });
        this.saveLearned();
        return { success: true, id };
    }
}

module.exports = ChatbotRagEngine;
