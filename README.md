# HanziLens

A Chinese language learning tool that breaks down sentences into word segments with pinyin pronunciation and definitions.

## Features
- **Sentence parsing** - Word segmentation using Xiaomi's MiMo V2 Flash
- **Dictionary lookup** - Click any word to see full dictionary entries (CC-CEDICT)
- **Tone-colored pinyin** - Colors indicate tones
- **Paragraph mode** - Long inputs are split into sentences with shared context
- **Image OCR mode** - Extracts text from images and parses per sentence
- **Dark mode** - Follows system preference, with manual toggle
- **Responsive design** - Works on desktop and mobile

## Models Used
- Sentence analysis and parsing: MiMo V2 Flash
- Image OCR: Google Cloud Vision

## Stack
- **Frontend**: React
- **Backend**: Express (+ SQLite)

## Configuration

Backend image OCR now uses Google Cloud Vision. Configure one of these:

- `GOOGLE_CLOUD_VISION_API_KEY`
- `GOOGLE_CLOUD_VISION_CREDENTIALS_JSON`
- `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account JSON file

Text parsing still requires:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

## Project Structure
```
hanzilens/
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
