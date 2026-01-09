#!/usr/bin/env npx tsx
/**
 * CLI runner for model evaluation
 * 
 * Tests the full HanziLens parsing pipeline including pinyin-pro correction.
 * Requires the backend server to be running.
 * 
 * Usage:
 *   npm run eval:model -- -m <model-id>
 *   npm run eval:model -- --models <model1>,<model2>
 *   npm run eval:model -- -m <model-id> --no-semantic
 *   npm run eval:model -- -m <model-id> --quick
 */

import { parseArgs } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { testSentences, getQuickTestSentences } from './test-sentences.js';
import { evaluateModel, printSummary, compareResults, checkServerHealth } from './evaluator.js';
import type { EvaluationResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, 'results');
const DEFAULT_SERVER_URL = 'http://localhost:5000';

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    model: {
      type: 'string',
      short: 'm',
      description: 'Model ID to evaluate (OpenRouter slug)',
    },
    models: {
      type: 'string',
      description: 'Comma-separated list of model IDs to compare',
    },
    'server-url': {
      type: 'string',
      default: DEFAULT_SERVER_URL,
      description: 'Backend server URL',
    },
    provider: {
      type: 'string',
      short: 'p',
      description: 'OpenRouter provider slug (e.g., fireworks, together, deepinfra)',
    },
    'no-semantic': {
      type: 'boolean',
      default: false,
      description: 'Skip semantic judging (faster, cheaper)',
    },
    quick: {
      type: 'boolean',
      short: 'q',
      default: false,
      description: 'Run quick test with 10 sentences',
    },
    output: {
      type: 'string',
      short: 'o',
      description: 'Custom output file path',
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
      description: 'Show help',
    },
  },
  strict: true,
  allowPositionals: false,
});

function showHelp(): void {
  console.log(`
Model Evaluation Runner

Tests the full HanziLens parsing pipeline including pinyin-pro correction.
Requires the backend server to be running.

Usage:
  npm run eval:model -- [options]

Options:
  -m, --model <id>       Model to evaluate (OpenRouter slug, e.g., qwen/qwen-2.5-7b-instruct)
  --models <ids>         Comma-separated list of models to compare
  -p, --provider <slug>  OpenRouter provider slug (e.g., fireworks, together, deepinfra)
  --server-url <url>     Backend server URL (default: ${DEFAULT_SERVER_URL})
  --no-semantic          Skip semantic judging (faster, cheaper)
  -q, --quick            Run quick test with 10 sentences (default: all ${testSentences.length})
  -o, --output <path>    Custom output file path
  -h, --help             Show this help

Examples:
  # Start the backend first (in another terminal)
  cd backend && npm run dev

  # Then run evaluation
  npm run eval:model -- -m qwen/qwen-2.5-72b-instruct
  npm run eval:model -- -m qwen/qwen-2.5-72b-instruct -p fireworks
  npm run eval:model -- --models qwen/qwen-2.5-7b-instruct,google/gemini-flash-1.5
  npm run eval:model -- -m qwen/qwen-2.5-7b-instruct --quick --no-semantic

Output:
  - Results are saved to tests/model-eval/results/
  - Shows both raw AI pinyin accuracy and corrected (post pinyin-pro) accuracy
  - Helps compare model quality vs system quality
`);
}

async function ensureResultsDir(): Promise<void> {
  if (!existsSync(RESULTS_DIR)) {
    await mkdir(RESULTS_DIR, { recursive: true });
  }
}

function generateOutputPath(modelId: string): string {
  const sanitizedModel = modelId.replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(RESULTS_DIR, `${sanitizedModel}-${timestamp}.json`);
}

function formatProgress(completed: number, total: number, sentence: string): string {
  const pct = ((completed / total) * 100).toFixed(0);
  const truncated = sentence.length > 30 ? sentence.slice(0, 30) + '...' : sentence;
  return `  [${completed}/${total}] ${pct}% - ${truncated}`;
}

async function main(): Promise<void> {
  // Show help if requested
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Get server URL
  const serverUrl = values['server-url'] || DEFAULT_SERVER_URL;

  // Get model list
  let modelIds: string[] = [];

  if (values.models) {
    modelIds = values.models.split(',').map(m => m.trim()).filter(Boolean);
  } else if (values.model) {
    modelIds = [values.model];
  }

  if (modelIds.length === 0) {
    console.error('Error: No model specified. Use -m <model-id> or --models <model1>,<model2>');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  // Check server health
  console.log('='.repeat(60));
  console.log('Model Evaluation Runner');
  console.log('='.repeat(60));
  console.log(`\nChecking server at ${serverUrl}...`);
  
  const isHealthy = await checkServerHealth(serverUrl);
  if (!isHealthy) {
    console.error(`\nError: Server not reachable at ${serverUrl}`);
    console.error('\nMake sure the backend is running:');
    console.error('  cd backend && npm run dev');
    console.error('\nThen run the evaluation again.');
    process.exit(1);
  }
  console.log('Server is healthy!');

  // Get test sentences
  const sentences = values.quick ? getQuickTestSentences(10) : testSentences;
  const enableSemanticJudging = !values['no-semantic'];

  console.log(`\nModels to evaluate: ${modelIds.length}`);
  if (values.provider) {
    console.log(`Provider: ${values.provider}`);
  }
  console.log(`Test sentences: ${sentences.length}`);
  console.log(`Semantic judging: ${enableSemanticJudging ? 'enabled' : 'disabled'}`);

  // Ensure results directory exists
  await ensureResultsDir();

  // Run evaluations
  const results: EvaluationResult[] = [];

  for (const modelId of modelIds) {
    try {
      const result = await evaluateModel({
        modelId,
        serverUrl,
        provider: values.provider,
        sentences,
        enableSemanticJudging,
        onProgress: (completed, total, sentence) => {
          process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
          process.stdout.write(formatProgress(completed, total, sentence));
        },
      });

      // Clear progress line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');

      // Print summary
      printSummary(result);

      // Save result
      const outputPath = values.output || generateOutputPath(modelId);
      await writeFile(outputPath, JSON.stringify(result, null, 2));
      console.log(`Results saved to: ${outputPath}`);

      results.push(result);
    } catch (error) {
      console.error(`\nError evaluating ${modelId}:`, error);
    }
  }

  // Print comparison if multiple models
  if (results.length > 1) {
    compareResults(results);
  }

  console.log('\nEvaluation complete!');
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
