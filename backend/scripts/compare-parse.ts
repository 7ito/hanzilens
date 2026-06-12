/**
 * Compare latency of the v1 (/parse) and v2 (/parse2) pipelines.
 *
 * Usage:
 *   tsx scripts/compare-parse.ts [sentence] [--url http://localhost:3000] [--runs 3]
 *
 * Measured per run:
 *   - ttfb:        first byte of the SSE response
 *   - first-paint: first moment the client could render word chips
 *                  (v1: first "token" in the LLM stream; v2: provisional event)
 *   - first-llm:   first LLM content delta (v2 only differs from first-paint)
 *   - total:       stream end ([DONE])
 */

interface RunMetrics {
  ttfbMs: number;
  firstPaintMs: number;
  firstLlmTokenMs: number;
  totalMs: number;
  grammarPoints?: unknown[];
}

function parseArgs(): { sentence: string; baseUrl: string; runs: number } {
  const args = process.argv.slice(2);
  let sentence = '我是去年来北京的，可是我的中文还没有他说得那么好。';
  let baseUrl = 'http://localhost:3000';
  let runs = 3;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') {
      baseUrl = args[++i];
    } else if (args[i] === '--runs') {
      runs = parseInt(args[++i], 10);
    } else {
      sentence = args[i];
    }
  }
  return { sentence, baseUrl, runs };
}

async function timeEndpoint(baseUrl: string, path: string, sentence: string): Promise<RunMetrics> {
  const start = performance.now();
  let ttfbMs = -1;
  let firstPaintMs = -1;
  let firstLlmTokenMs = -1;
  let grammarPoints: unknown[] | undefined;

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`${path} responded ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let llmContent = '';
  let pendingEvent: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const now = performance.now() - start;
    if (ttfbMs < 0) ttfbMs = now;

    raw += decoder.decode(value, { stream: true });
    const lines = raw.split('\n');
    raw = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('event: ')) {
        pendingEvent = trimmed.slice(7);
        continue;
      }

      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;

      if (pendingEvent === 'provisional') {
        if (firstPaintMs < 0) firstPaintMs = now;
        pendingEvent = null;
        continue;
      }
      if (pendingEvent === 'grammar') {
        try {
          grammarPoints = JSON.parse(payload).grammarPoints;
        } catch { /* ignore */ }
        pendingEvent = null;
        continue;
      }
      pendingEvent = null;

      try {
        const content = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          if (firstLlmTokenMs < 0) firstLlmTokenMs = now;
          llmContent += content;
          if (firstPaintMs < 0 && llmContent.includes('"token"')) {
            firstPaintMs = now;
          }
        }
      } catch { /* not a delta line */ }
    }
  }

  return {
    ttfbMs,
    firstPaintMs,
    firstLlmTokenMs,
    totalMs: performance.now() - start,
    grammarPoints,
  };
}

function fmt(ms: number): string {
  return ms < 0 ? '   n/a' : `${ms.toFixed(0).padStart(5)}ms`;
}

function average(values: number[]): number {
  const valid = values.filter((v) => v >= 0);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : -1;
}

async function main() {
  const { sentence, baseUrl, runs } = parseArgs();

  console.log(`Sentence: ${sentence}`);
  console.log(`Base URL: ${baseUrl}, runs per endpoint: ${runs}\n`);
  console.log('endpoint  run    ttfb  first-paint  first-llm    total');

  for (const path of ['/parse', '/parse2']) {
    const metrics: RunMetrics[] = [];
    for (let i = 0; i < runs; i++) {
      try {
        const m = await timeEndpoint(baseUrl, path, sentence);
        metrics.push(m);
        console.log(
          `${path.padEnd(9)} ${String(i + 1).padStart(3)} ${fmt(m.ttfbMs)}      ${fmt(m.firstPaintMs)}    ${fmt(m.firstLlmTokenMs)}  ${fmt(m.totalMs)}`
        );
      } catch (error) {
        console.error(`${path} run ${i + 1} failed:`, error instanceof Error ? error.message : error);
      }
    }

    if (metrics.length > 0) {
      console.log(
        `${path.padEnd(9)} avg ${fmt(average(metrics.map((m) => m.ttfbMs)))}      ${fmt(average(metrics.map((m) => m.firstPaintMs)))}    ${fmt(average(metrics.map((m) => m.firstLlmTokenMs)))}  ${fmt(average(metrics.map((m) => m.totalMs)))}`
      );
      const lastGrammar = metrics[metrics.length - 1].grammarPoints;
      if (lastGrammar) {
        console.log(`${path} grammar points: ${JSON.stringify(lastGrammar, null, 2)}`);
      }
      console.log('');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
