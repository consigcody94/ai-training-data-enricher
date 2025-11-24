import { Actor } from 'apify';
import { log } from 'crawlee';
import natural from 'natural';
import compromise from 'compromise';
import FuzzySet from 'fuzzyset';
import { validate as validateEmail } from 'email-validator';
import { z } from 'zod';

// Type definitions
interface Input {
    datasetId: string;
    textField: string;
    enrichmentOptions: {
        sentiment: boolean;
        entities: boolean;
        keywords: boolean;
        language: boolean;
        readability: boolean;
    };
    validationOptions: {
        detectDuplicates: boolean;
        duplicateSimilarityThreshold: number;
        detectPII: boolean;
        minTextLength: number;
        maxTextLength: number;
    };
    schemaValidation: object;
    outputOptions: {
        includeOriginal: boolean;
        flagOnly: boolean;
        removePII: boolean;
    };
    maxItems: number;
}

interface EnrichmentResult {
    sentiment?: {
        score: number;
        comparative: number;
        positive: string[];
        negative: string[];
    };
    entities?: {
        people: string[];
        places: string[];
        organizations: string[];
        dates: string[];
        values: string[];
    };
    keywords?: string[];
    language?: string;
    readability?: {
        wordCount: number;
        sentenceCount: number;
        avgWordsPerSentence: number;
        avgWordLength: number;
    };
}

interface ValidationResult {
    isValid: boolean;
    isDuplicate: boolean;
    duplicateOf?: number;
    hasPII: boolean;
    piiTypes?: string[];
    lengthValid: boolean;
    schemaValid: boolean;
    schemaErrors?: string[];
}

interface ProcessedItem {
    id: number;
    originalText: string;
    processedText?: string;
    enrichment: EnrichmentResult;
    validation: ValidationResult;
    [key: string]: any;
}

// Initialize NLP tools
const tokenizer = new natural.WordTokenizer();
const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
const tfidf = new natural.TfIdf();

// PII detection patterns
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

// Main Actor entry point
async function main() {
    await Actor.init();

    try {
        const input = await Actor.getInput<Input>();

        if (!input?.datasetId) {
            throw new Error('Missing required input: datasetId');
        }

        log.info('Starting AI Training Data Enricher & Validator', { input });

        // Open input dataset
        const inputDataset = await Actor.openDataset(input.datasetId);
        const { items } = await inputDataset.getData({ limit: input.maxItems || undefined });

        log.info(`Loaded ${items.length} items from input dataset`);

        if (items.length === 0) {
            log.warning('Input dataset is empty');
            await Actor.exit();
            return;
        }

    // Initialize fuzzy matching for duplicate detection
    let fuzzySet: FuzzySet | null = null;
    const seenTexts: Map<string, number> = new Map();

    if (input.validationOptions.detectDuplicates) {
        const textField = input.textField || 'text';
        const allTexts = items
            .map((item: any) => item[textField])
            .filter(Boolean);
        fuzzySet = FuzzySet(allTexts);
        log.info('Initialized fuzzy matching for duplicate detection');
    }

    // Process each item
    const processedItems: ProcessedItem[] = [];
    let validCount = 0;
    let duplicateCount = 0;
    let piiCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const textField = input.textField || 'text';
        const originalText = item[textField];

        if (!originalText) {
            log.warning(`Item ${i} missing text field '${textField}'`, { item });
            continue;
        }

        log.info(`Processing item ${i + 1}/${items.length}`);

        // Initialize result object
        const result: ProcessedItem = {
            id: i,
            originalText,
            enrichment: {},
            validation: {
                isValid: true,
                isDuplicate: false,
                hasPII: false,
                lengthValid: true,
                schemaValid: true,
            },
        };

        // Include original data if requested
        if (input.outputOptions.includeOriginal) {
            Object.assign(result, item);
        }

        // ENRICHMENT PHASE

        // Sentiment Analysis
        if (input.enrichmentOptions.sentiment) {
            const tokens = tokenizer.tokenize(originalText.toLowerCase());
            if (tokens) {
                const sentimentScore = analyzer.getSentiment(tokens);

                // Count positive and negative words
                const positive: string[] = [];
                const negative: string[] = [];

                tokens.forEach(token => {
                    const score = (natural.SentimentAnalyzer as any).afinn[token];
                    if (score > 0) positive.push(token);
                    if (score < 0) negative.push(token);
                });

                result.enrichment.sentiment = {
                    score: sentimentScore,
                    comparative: sentimentScore / (tokens.length || 1),
                    positive,
                    negative,
                };
            }
        }

        // Named Entity Recognition
        if (input.enrichmentOptions.entities) {
            const doc = compromise(originalText);

            result.enrichment.entities = {
                people: doc.people().out('array') as string[],
                places: doc.places().out('array') as string[],
                organizations: doc.organizations().out('array') as string[],
                dates: doc.match('#Date').out('array') as string[],
                values: doc.money().out('array') as string[],
            };
        }

        // Keyword Extraction
        if (input.enrichmentOptions.keywords) {
            tfidf.addDocument(originalText);
            const keywords: string[] = [];
            try {
                const docs = (tfidf as any).documents;
                if (Array.isArray(docs) && docs.length > 0) {
                    const documentIndex = tfidf.listTerms(docs.length - 1);
                    documentIndex.slice(0, 10).forEach((item: any) => {
                        keywords.push(item.term);
                    });
                }
            } catch (e) {
                // If TF-IDF fails, continue without keywords
            }

            result.enrichment.keywords = keywords;
        }

        // Language Detection
        if (input.enrichmentOptions.language) {
            const languages = ['english', 'spanish', 'french', 'german', 'portuguese'];
            let detectedLang = 'unknown';
            let maxCount = 0;

            for (const lang of languages) {
                const langTokenizer = new natural.WordTokenizer();
                const tokens = langTokenizer.tokenize(originalText.toLowerCase().substring(0, 500));
                const langWordCount = tokens ? tokens.filter(token => {
                    // Simple heuristic: check if word exists in language-specific stopwords
                    return natural.stopwords.some(sw => sw === token);
                }).length : 0;

                if (langWordCount > maxCount) {
                    maxCount = langWordCount;
                    detectedLang = lang;
                }
            }

            result.enrichment.language = detectedLang;
        }

        // Readability Metrics
        if (input.enrichmentOptions.readability) {
            const sentences = originalText.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
            const words = tokenizer.tokenize(originalText);
            const wordCount = words ? words.length : 0;
            const sentenceCount = sentences.length;
            const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
            const avgWordLength = words ? words.reduce((sum, word) => sum + word.length, 0) / (wordCount || 1) : 0;

            result.enrichment.readability = {
                wordCount,
                sentenceCount,
                avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
                avgWordLength: Math.round(avgWordLength * 10) / 10,
            };
        }

        // VALIDATION PHASE

        // Length validation
        const textLength = originalText.length;
        if (input.validationOptions.minTextLength > 0 && textLength < input.validationOptions.minTextLength) {
            result.validation.lengthValid = false;
            result.validation.isValid = false;
        }
        if (input.validationOptions.maxTextLength > 0 && textLength > input.validationOptions.maxTextLength) {
            result.validation.lengthValid = false;
            result.validation.isValid = false;
        }

        // Duplicate detection
        if (input.validationOptions.detectDuplicates && fuzzySet) {
            const matches = fuzzySet.get(originalText);
            if (matches && matches.length > 0) {
                const [similarity, matchText] = matches[0];
                if (similarity >= input.validationOptions.duplicateSimilarityThreshold) {
                    // Check if this is not the first occurrence
                    const duplicateIndex = seenTexts.get(matchText);
                    if (duplicateIndex !== undefined && duplicateIndex !== i) {
                        result.validation.isDuplicate = true;
                        result.validation.duplicateOf = duplicateIndex;
                        result.validation.isValid = false;
                        duplicateCount++;
                    } else {
                        seenTexts.set(originalText, i);
                    }
                }
            }
        }

        // PII Detection
        if (input.validationOptions.detectPII) {
            const piiTypes: string[] = [];
            let processedText = originalText;

            // Email detection
            if (EMAIL_REGEX.test(originalText)) {
                piiTypes.push('email');
                if (input.outputOptions.removePII) {
                    processedText = processedText.replace(EMAIL_REGEX, '[EMAIL_REDACTED]');
                }
            }

            // Phone number detection
            if (PHONE_REGEX.test(originalText)) {
                piiTypes.push('phone');
                if (input.outputOptions.removePII) {
                    processedText = processedText.replace(PHONE_REGEX, '[PHONE_REDACTED]');
                }
            }

            // SSN detection
            if (SSN_REGEX.test(originalText)) {
                piiTypes.push('ssn');
                if (input.outputOptions.removePII) {
                    processedText = processedText.replace(SSN_REGEX, '[SSN_REDACTED]');
                }
            }

            // Credit card detection
            if (CREDIT_CARD_REGEX.test(originalText)) {
                piiTypes.push('credit_card');
                if (input.outputOptions.removePII) {
                    processedText = processedText.replace(CREDIT_CARD_REGEX, '[CC_REDACTED]');
                }
            }

            if (piiTypes.length > 0) {
                result.validation.hasPII = true;
                result.validation.piiTypes = piiTypes;
                piiCount++;

                if (input.outputOptions.removePII) {
                    result.processedText = processedText;
                }

                if (!input.outputOptions.flagOnly) {
                    result.validation.isValid = false;
                }
            }
        }

        // Schema validation
        if (input.schemaValidation && Object.keys(input.schemaValidation).length > 0) {
            try {
                const schema = z.object(input.schemaValidation as any);
                schema.parse(item);
            } catch (error) {
                result.validation.schemaValid = false;
                result.validation.schemaErrors = [(error as Error).message];
                result.validation.isValid = false;
            }
        }

        // Track statistics
        if (result.validation.isValid) {
            validCount++;
        }

        // Add to results (filter or flag based on settings)
        if (input.outputOptions.flagOnly || result.validation.isValid) {
            processedItems.push(result);
        }
    }

    // Output results
    await Actor.pushData(processedItems);

    // Log summary statistics
    const summary = {
        totalProcessed: items.length,
        validItems: validCount,
        duplicatesFound: duplicateCount,
        itemsWithPII: piiCount,
        outputItems: processedItems.length,
        rejectedItems: items.length - processedItems.length,
    };

    log.info('Processing complete', summary);
    await Actor.setValue('SUMMARY', summary);

    log.info('✅ Actor finished successfully');

    } catch (error) {
        log.error('Actor failed with error', { error });
        throw error;
    }

    await Actor.exit();
}

// Run the actor
main();
