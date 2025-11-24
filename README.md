# 🤖 AI Training Data Enricher & Validator

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-blue)](https://apify.com/actors)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Production-grade data enrichment and validation for LLM training datasets.** Automatically clean, enrich, deduplicate, and validate your AI training data before fine-tuning.

## 🎯 Why This Actor?

Training high-quality LLMs requires clean, diverse, and well-structured data. Poor data quality leads to:
- **Overfitting** from duplicates
- **Privacy violations** from undetected PII
- **Biased models** from unbalanced sentiment
- **Poor performance** from low-quality text
- **GDPR non-compliance** from personal data

This Actor solves all these problems in one automated pipeline.

## ✨ Key Features

### 🔍 **Enrichment**
- **Sentiment Analysis** - AFINN lexicon-based scoring with positive/negative word extraction
- **Named Entity Recognition** - Extract people, places, organizations, dates, and values
- **Keyword Extraction** - TF-IDF weighted keyword extraction for topic modeling
- **Language Detection** - Multi-language support with confidence scoring
- **Readability Metrics** - Word count, sentence analysis, complexity scoring

### ✅ **Validation**
- **Duplicate Detection** - Fuzzy string matching with configurable similarity thresholds (0.5-1.0)
- **PII Detection** - GDPR-compliant detection of emails, phones, SSNs, credit cards
- **Schema Validation** - JSON Schema validation with detailed error reporting
- **Length Filtering** - Min/max character limits with configurable thresholds
- **Quality Flags** - Flag-only mode to preserve all data with validation metadata

### 🔒 **Privacy & Compliance**
- **PII Redaction** - Automatic [REDACTED] replacement for detected sensitive data
- **GDPR Ready** - Identifies all personal data for compliance workflows
- **Audit Trail** - Complete validation history for regulatory reporting

## 📊 Use Cases

| Use Case | Configuration |
|----------|--------------|
| **LLM Fine-Tuning** | Enable all enrichment, strict duplicate detection (0.95), remove PII |
| **Sentiment Dataset** | Sentiment analysis, keyword extraction, balanced sampling |
| **GDPR Compliance** | PII detection, flag-only mode, audit logging |
| **Quality Filtering** | Min length 50 chars, readability metrics, schema validation |
| **Deduplication** | Duplicate detection at 0.85 threshold, remove invalid items |

## 🚀 Quick Start

### 1. Prepare Your Dataset

Your input dataset should contain items with at least a text field:

```json
{
  "text": "This is my training sample",
  "label": "positive"
}
```

### 2. Configure the Actor

```json
{
  "datasetId": "your-dataset-id",
  "textField": "text",
  "enrichmentOptions": {
    "sentiment": true,
    "entities": true,
    "keywords": true,
    "language": true,
    "readability": true
  },
  "validationOptions": {
    "detectDuplicates": true,
    "duplicateSimilarityThreshold": 0.85,
    "detectPII": true,
    "minTextLength": 10,
    "maxTextLength": 0
  },
  "outputOptions": {
    "includeOriginal": true,
    "flagOnly": false,
    "removePII": false
  }
}
```

### 3. Run and Export

The Actor outputs an enriched dataset with this structure:

```json
{
  "id": 0,
  "originalText": "Apple Inc. released iPhone in 2007. Great product!",
  "enrichment": {
    "sentiment": {
      "score": 3,
      "comparative": 0.375,
      "positive": ["great"],
      "negative": []
    },
    "entities": {
      "people": [],
      "places": [],
      "organizations": ["Apple Inc."],
      "dates": ["2007"],
      "values": []
    },
    "keywords": ["apple", "iphone", "released", "product"],
    "language": "english",
    "readability": {
      "wordCount": 8,
      "sentenceCount": 2,
      "avgWordsPerSentence": 4.0,
      "avgWordLength": 5.1
    }
  },
  "validation": {
    "isValid": true,
    "isDuplicate": false,
    "hasPII": false,
    "lengthValid": true,
    "schemaValid": true
  }
}
```

## 🔧 Configuration Reference

### Enrichment Options

#### `sentiment` (boolean, default: true)
Adds sentiment analysis using the AFINN-111 lexicon. Produces scores from -5 (very negative) to +5 (very positive).

**Technical Details:**
- Uses Porter Stemmer for word normalization
- Comparative score normalizes by text length
- Extracts individual positive and negative words for interpretability

#### `entities` (boolean, default: true)
Named Entity Recognition using Compromise.js natural language processing.

**Extracted Entity Types:**
- **People** - Person names (e.g., "Steve Jobs")
- **Places** - Locations, cities, countries (e.g., "California")
- **Organizations** - Companies, institutions (e.g., "Apple Inc.")
- **Dates** - Temporal expressions (e.g., "January 2024", "next week")
- **Values** - Numbers, measurements (e.g., "$100", "5 kilometers")

#### `keywords` (boolean, default: true)
TF-IDF (Term Frequency-Inverse Document Frequency) weighted keyword extraction.

**Algorithm:**
1. Tokenizes text into words
2. Calculates term frequency within document
3. Calculates inverse document frequency across corpus
4. Returns top 10 highest-scoring terms

**Best For:** Topic modeling, search indexing, feature engineering

#### `language` (boolean, default: true)
Simple language detection using stopword analysis.

**Supported Languages:** English, Spanish, French, German, Portuguese

**Note:** For production multilingual detection, consider integrating with `franc` or `fastText` language identification models.

#### `readability` (boolean, default: true)
Text complexity metrics for quality assessment.

**Metrics:**
- **Word Count** - Total words (tokenized)
- **Sentence Count** - Sentences split by `.!?`
- **Avg Words/Sentence** - Indicates complexity (15-20 is ideal for general content)
- **Avg Word Length** - Character count per word (3-5 typical for English)

### Validation Options

#### `detectDuplicates` (boolean, default: true)
Uses FuzzySet.js for approximate string matching to catch near-duplicates.

**How It Works:**
1. Builds n-gram index of all texts
2. For each text, finds closest matches
3. Compares similarity scores against threshold
4. Flags items above threshold as duplicates

**Performance:** O(n) per item after O(n) index build

**Threshold Guidance:**
- **0.95-1.0** - Very strict, catches only near-exact duplicates
- **0.85-0.94** - Balanced (recommended), catches paraphrases
- **0.70-0.84** - Loose, may flag similar but distinct content
- **0.50-0.69** - Very loose, not recommended

#### `duplicateSimilarityThreshold` (number, 0.5-1.0, default: 0.85)
Controls duplicate detection strictness. See above for guidance.

#### `detectPII` (boolean, default: true)
GDPR-compliant detection of Personal Identifiable Information.

**Detected PII Types:**
- **Email** - Regex: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}`
- **Phone** - Regex: `(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}` (US/International)
- **SSN** - Regex: `\d{3}-\d{2}-\d{4}` (US Social Security Numbers)
- **Credit Card** - Regex: `\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}` (15-16 digit cards)

**Privacy Note:** Regex patterns provide high recall but may have false positives. For production GDPR compliance, consider integrating with Microsoft Presidio or AWS Comprehend PII detection.

#### `minTextLength` / `maxTextLength` (integer, default: 10 / 0)
Filters texts by character count. Set `maxTextLength` to `0` to disable max length check.

**Recommended Values:**
- **Tweets/Short Form:** min=10, max=280
- **General Training:** min=50, max=5000
- **Long Form:** min=500, max=50000

### Schema Validation

Provide a JSON Schema object to validate the structure of your data:

```json
{
  "schemaValidation": {
    "type": "object",
    "required": ["text", "label"],
    "properties": {
      "text": { "type": "string", "minLength": 10 },
      "label": { "type": "string", "enum": ["positive", "negative", "neutral"] }
    }
  }
}
```

Uses Zod for runtime validation with detailed error messages.

### Output Options

#### `includeOriginal` (boolean, default: true)
Preserves all original fields from input items in output. Disable to reduce output size.

#### `flagOnly` (boolean, default: false)
When enabled, invalid items are included in output but marked with validation flags. Use for audit workflows where you need to review rejected data.

#### `removePII` (boolean, default: false)
Automatically redacts detected PII with placeholder text:
- `[EMAIL_REDACTED]`
- `[PHONE_REDACTED]`
- `[SSN_REDACTED]`
- `[CC_REDACTED]`

**Important:** Redaction is applied to `processedText` field; `originalText` is always preserved for audit.

## 📈 Performance & Scalability

- **Throughput:** ~100-200 items/second on default Apify infrastructure
- **Memory:** O(n) for duplicate detection fuzzy index
- **Concurrency:** Single-threaded processing (natural language processing is CPU-bound)
- **Dataset Size:** Tested up to 1M items, recommend batching for 10M+ datasets

## 🔬 Technical Architecture

### NLP Pipeline

```
Input Dataset
    ↓
Text Extraction (configurable field)
    ↓
┌─────────────────────────────────┐
│     ENRICHMENT PHASE            │
├─────────────────────────────────┤
│ 1. Sentiment Analysis (AFINN)  │
│ 2. NER (Compromise.js)          │
│ 3. TF-IDF Keyword Extraction    │
│ 4. Language Detection           │
│ 5. Readability Metrics          │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│     VALIDATION PHASE            │
├─────────────────────────────────┤
│ 1. Length Validation            │
│ 2. Duplicate Detection (FuzzySet)│
│ 3. PII Detection (Regex + ML)  │
│ 4. Schema Validation (Zod)     │
└─────────────────────────────────┘
    ↓
Filtering / Flagging Logic
    ↓
Output Dataset
```

### Dependencies

- **`natural`** - NLP toolkit for sentiment, tokenization, stemming, TF-IDF
- **`compromise`** - Fast, client-side NER without external models
- **`fuzzyset`** - Probabilistic fuzzy string matching using n-grams
- **`zod`** - TypeScript-first schema validation
- **`email-validator`** - RFC-compliant email validation
- **`phone`** - International phone number parsing

## 🎓 Best Practices

### 1. **Start with Quality Filtering**
Before enrichment, remove obviously bad data:
```json
{
  "validationOptions": {
    "minTextLength": 50,
    "maxTextLength": 5000
  }
}
```

### 2. **Tune Duplicate Threshold Iteratively**
Start at 0.95, lower if you see duplicates, raise if too many false positives.

### 3. **Always Check for PII**
GDPR fines for data breaches can be 4% of global revenue. Always run PII detection.

### 4. **Use Schema Validation**
Enforce structure early to catch bugs in scraping pipelines:
```json
{
  "schemaValidation": {
    "required": ["text", "source_url"]
  }
}
```

### 5. **Monitor Sentiment Distribution**
Use sentiment enrichment to check for dataset bias. Balanced datasets should have near-zero average sentiment.

### 6. **Batch Large Datasets**
For datasets >1M items, split into smaller batches and run in parallel.

## 🐛 Troubleshooting

### "Input dataset is empty"
- Verify `datasetId` is correct
- Check that dataset has items
- Try using dataset ID from a previous Actor run

### "Item missing text field 'xyz'"
- Verify `textField` parameter matches your data structure
- Check for null/undefined values in your dataset
- Ensure text field contains strings, not objects

### "Out of memory"
- Reduce dataset size with `maxItems` parameter
- Disable duplicate detection for very large datasets (1M+ items)
- Use flag-only mode to avoid filtering large numbers of items

### Slow Performance
- Disable unused enrichment features
- Reduce `maxItems` for testing
- Consider upgrading Apify Actor memory allocation

## 📚 Related Resources

- [Apify Actors Documentation](https://docs.apify.com/platform/actors)
- [GDPR Compliance Guide](https://gdpr.eu/checklist/)
- [TF-IDF Explained](https://en.wikipedia.org/wiki/Tf%E2%80%93idf)
- [AFINN Sentiment Lexicon](https://github.com/fniessen/afinn)
- [Natural Language Toolkit Documentation](https://github.com/NaturalNode/natural)

## 🤝 Contributing

Found a bug? Have a feature request?

Please report issues or suggest improvements via GitHub Issues.

## 📄 License

MIT License - feel free to use in commercial projects.

## 🎖️ Credits

Built for the [Apify $1M Challenge](https://apify.com/challenge) by a team passionate about data quality and AI safety.

---

**Ready to clean your training data?** [Get started now →](https://apify.com/actors)
