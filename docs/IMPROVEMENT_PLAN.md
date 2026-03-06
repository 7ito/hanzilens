# HanziLens Improvement Plan

Comprehensive plan for codebase improvements, prioritized by impact.

## Phase 1: Foundational Cleanup (Low Risk, High ROI) - COMPLETED

### 1.1 Extract duplicated frontend utilities
- Create `frontend/src/lib/abort.ts` with `isAbortError()` and `createAbortError()` — remove from `useParse.ts`, `useImageParse.ts`, `useSentenceParseQueue.ts`, `parseSse.ts`
- Create `frontend/src/lib/style-utils.ts` with `setAlpha()` — remove from `ImageResultsView.tsx`, `ParagraphResultsView.tsx`, `SentenceCard.tsx`
- Create shared Chinese char regex constant in both frontend (`lib/chinese.ts`) and backend (`utils/chinese.ts`) — remove 4 inline definitions

### 1.2 Extract `useSegmentHighlight` hook
- Factor the hoveredSegmentId/hoveredPartIndex/highlightedSegmentIds/segmentColorMap/getPartHighlightColor pattern out of `ResultsView`, `SentenceCard`, and `HelpDialog` into a shared hook

### 1.3 Decompose `ImageResultsView.tsx`
- Move text-fitting functions (`fitTranslationToBoxes`, `wrapTextToLines`, `fitWordToWidth`, `splitTranslationIntoBoxes`, `getBoxCapacity`, `truncateAtWordBoundary`, `getMeasurementContext`, `sortBoxesForReading`) to `frontend/src/lib/textFit.ts`
- Move `buildLineRanges`, `computeSentenceBoxes` to `frontend/src/lib/ocrLayout.ts`
- Reduces the component from ~674 lines to ~350 lines

### 1.4 Fix derived state anti-pattern in InputView
- Replace the `useEffect` + `useState` pattern for `isTextValid` with a simple derived `const`

### 1.5 Remove unused scaffolding
- Delete `frontend/src/components/example.tsx` and `component-example.tsx`

### 1.6 Align TypeScript versions
- Update backend to match frontend's `~5.9.3`

---

## Phase 2: Security Hardening - COMPLETED

### 2.1 Sanitize error responses
- Never pass raw `error.message` to clients in route handlers
- Use a whitelist of known safe error types; return generic messages for everything else
- Log full errors server-side only

### 2.2 Fix eval endpoint gating
- Change from `NODE_ENV !== 'production'` to explicit `ENABLE_EVAL=true` env var
- Add rate limiting to eval endpoint

### 2.3 Add API response validation
- Validate full shape of AI responses in `ai.ts:parseNonStreaming` using Zod schemas
- Add validation in frontend `parseSse.ts` before emitting `onPartial` results

### 2.4 Conditional `trust proxy`
- Only set `trust proxy` when `TRUST_PROXY` env var is explicitly set

---

## Phase 3: Testing - COMPLETED (3.1-3.3)

### 3.1 Backend unit tests (high priority) - COMPLETED
- `pinyinCorrection.test.ts` — core product accuracy (26 tests)
- `validation.test.ts` — security boundary (23 tests)
- `streamProcessor.test.ts` — streaming state machine (21 tests)
- Also extracted `streamProcessor.ts` from `parse.ts` for testability

### 3.2 Frontend unit tests (high priority) - COMPLETED
- `pinyin.test.ts` — tone conversion, colors (24 tests)
- `sentenceSplit.test.ts` — sentence splitting (20 tests)
- `validation.test.ts` — parse response validation (35 tests)

### 3.3 Frontend component tests (medium priority) - COMPLETED
- `DictionaryView.test.tsx` (12 tests)
- `Segment.test.tsx` (11 tests)
- `InputView.test.tsx` (17 tests)
- Added `@testing-library/jest-dom` and `@testing-library/user-event` dependencies

### 3.4 Integration tests (lower priority)
- Backend route integration tests with mocked AI service
- Frontend E2E tests for full flows

---

## Phase 4: DX & Tooling

### 4.1 Add backend ESLint
- Create `backend/eslint.config.js` mirroring the frontend's flat config, adapted for Node (no React plugins, `globals.node` instead of `globals.browser`)
- Add `"lint": "eslint ."` script to backend `package.json`

### 4.2 Add CI/CD (GitHub Actions)
- `.github/workflows/ci.yml`:
  - Lint (both packages)
  - Type check (`tsc --noEmit` both packages)
  - Unit tests (both packages)
  - Build (frontend `vite build`, backend `tsc`)
  - E2E tests (Playwright, with backend running)
- Trigger on push to main and PRs

### 4.3 Add Dockerfile and docker-compose
- `Dockerfile` for backend (multi-stage: build + runtime)
- `Dockerfile` for frontend (build + nginx serve)
- `docker-compose.yml` for local development (both services)
- `.dockerignore` files

---

## Phase 5: Features & Performance

### 5.1 Add URL routing and browser navigation
- Use `pushState`/`popState` to reflect view state in the URL
- Handle browser back button

### 5.2 Optimize streaming buffer latency
- Only retain 50-char buffer when inside segments array

### 5.3 Optimize `useIsMobile` hook
- Replace resize listener with `matchMedia` change listener

### 5.4 Conditional PostHog bundle loading
- Dynamic import only when API key is set
- Fix inconsistent direct `posthog.capture()` calls

### 5.5 Fix module-level mutable state
- `measurementCanvas` in ImageResultsView — use WeakRef or React ref
- `zIndex.ts` — add maximum cap

### 5.6 Add request correlation
- `requestId` middleware using `crypto.randomUUID()`

---

## Execution Order

| Priority | Phase | Effort | Risk | Status |
|---|---|---|---|---|
| 1 | Phase 1 (Cleanup) | ~1 day | Low | DONE |
| 2 | Phase 2.1-2.2 (Critical security) | ~2 hours | Low | DONE |
| 3 | Phase 2.3-2.4 (Full security) | ~3 hours | Medium | DONE |
| 4 | Phase 3.1-3.2 (Core tests) | ~1 day | Low | DONE |
| 5 | Phase 3.3 (Component tests) | ~1 day | Low | DONE |
| 6 | Phase 3.4 (Integration tests) | ~1 day | Low | |
| 7 | Phase 4.1-4.2 (Lint + Format) | ~2 hours | Low | |
| 8 | Phase 4.3 (CI/CD) | ~3 hours | Low | |
| 9 | Phase 5.1 (URL routing) | ~4 hours | Medium | |
| 10 | Phase 5.2-5.6 (Performance) | ~3 hours | Low | |
| 11 | Phase 4.4 (Docker) | ~2 hours | Low | |
