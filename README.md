# HanziLens

A Chinese language learning tool that breaks down sentences into word segments with pinyin pronunciation and definitions.

## Features
- **Sentence parsing** - Word segmentation using Xiaomi's MiMo V2 Flash
- **Dictionary lookup** - Click any word to see full dictionary entries (CC-CEDICT)
- **Tone-colored pinyin** - Colors indicate tones
- **Dark mode** - Follows system preference, with manual toggle
- **Responsive design** - Works on desktop and mobile

## Models Used
- Sentence analysis and parsing: mimo-v2-flash
- VL (OCR) model: Qwen3 VL 30B A3B Instruct

## Stack
- **Frontend**: React
- **Backend**: Express (+ SQLite)

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
