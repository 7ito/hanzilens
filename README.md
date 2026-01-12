# HanziLens

A Chinese language learning tool that breaks down sentences into word segments with pinyin pronunciation and definitions.

## Features

- **AI-powered sentence parsing** - Intelligent word segmentation using Xiaomi MiMo (MiMo-V2-Flash)
- **Dictionary lookup** - Click any word to see full dictionary entries
- **Tone-colored pinyin** - Visual indication of tones for easier learning
- **Dark mode** - System preference detection with manual toggle
- **Responsive design** - Works on desktop and mobile

## Quick Start

### Prerequisites

- Node.js 18+
- Xiaomi MiMo API key (from https://platform.xiaomimimo.com)

### Backend Setup

```bash
cd remake/backend

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your MIMO_API_KEY (and optionally OPENROUTER_* for OCR/eval)

# Start development server
npm run dev
```

The backend runs on http://localhost:5000 by default.

### Frontend Setup

```bash
cd remake/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend runs on http://localhost:5174 and connects to the backend automatically.

## Environment Variables

### Backend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 5000) | No |
| `MIMO_API_KEY` | Your Xiaomi MiMo API key | Yes |
| `MIMO_MODEL` | Model ID (e.g., `mimo-v2-flash`) | Yes |
| `OPENROUTER_API_KEY` | OpenRouter API key (optional, for OCR + eval) | No |
| `OPENROUTER_MODEL` | OpenRouter model (optional, for /eval routes) | No |
| `OPENROUTER_VISION_MODEL` | OpenRouter vision model (optional, for OCR) | No |
| `CORS_ORIGINS` | Allowed origins, comma-separated | No |

### Recommended Models

- `mimo-v2-flash` - Fast, strong Chinese segmentation (default)

## API Endpoints

### POST /parse

Parse a Chinese sentence into word segments.

**Request:**
```json
{ "sentence": "你有光明的未来。" }
```

**Response:** SSE stream with segments containing `token`, `pinyin`, and `definition`.

### POST /definitionLookup

Look up a word in the dictionary.

**Request:**
```json
{ "token": "光明" }
```

**Response:**
```json
{
  "entries": [
    {
      "id": 1234,
      "simplified": "光明",
      "traditional": "光明",
      "pinyin": "guang1 ming2",
      "definitions": ["bright", "radiant", "promising"]
    }
  ]
}
```

## Project Structure

```
remake/
├── backend/
│   ├── src/
│   │   ├── app.ts           # Express server
│   │   ├── config/          # Environment config
│   │   ├── middleware/      # Validation, rate limiting, errors
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # AI and dictionary services
│   │   └── types/           # TypeScript types
│   ├── data/
│   │   └── cedict.sqlite    # Dictionary database
│   └── scripts/
│       └── import-cedict.ts # Dictionary import script
└── frontend/
    └── src/
        ├── components/      # React components
        ├── hooks/           # Custom hooks
        ├── lib/             # Utilities
        └── types/           # TypeScript types
```

## License

MIT
