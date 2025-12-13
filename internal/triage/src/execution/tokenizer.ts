/**
 * Token Estimation and Plan Splitting
 *
 * Uses tiktoken-compatible encoding to:
 * - Estimate token costs before execution
 * - Split large operations into manageable chunks
 * - Optimize for context windows
 */

import { DEFAULT_MODEL } from '../ai.js';

// Simple token estimation without external dependencies
// Based on GPT-4 tokenization patterns (roughly 4 chars per token for English)
// For production, consider using 'gpt-tokenizer' or 'tiktoken'

const CHARS_PER_TOKEN = 4;
const CODE_CHARS_PER_TOKEN = 3.5; // Code is denser

// Model context windows and costs
export interface ModelConfig {
    name: string;
    contextWindow: number;
    inputCostPer1k: number;  // USD per 1k tokens
    outputCostPer1k: number;
}

export const MODELS: Record<string, ModelConfig> = {
    [DEFAULT_MODEL]: {
        name: 'GLM-4.6',
        contextWindow: 128000,
        inputCostPer1k: 0.0001,  // Very cheap for local/cloud Ollama
        outputCostPer1k: 0.0002,
    },
    'llama3.2:latest': {
        name: 'Llama 3.2',
        contextWindow: 128000,
        inputCostPer1k: 0.0001,
        outputCostPer1k: 0.0002,
    },
    'qwen2.5:latest': {
        name: 'Qwen 2.5',
        contextWindow: 32768,
        inputCostPer1k: 0.0001,
        outputCostPer1k: 0.0002,
    },
    'gpt-4o': {
        name: 'GPT-4o',
        contextWindow: 128000,
        inputCostPer1k: 0.005,
        outputCostPer1k: 0.015,
    },
    'claude-3-5-sonnet': {
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015,
    },
};

/**
 * Estimate tokens for a string
 */
export function estimateTokens(text: string, isCode = false): number {
    if (!text) return 0;
    const charsPerToken = isCode ? CODE_CHARS_PER_TOKEN : CHARS_PER_TOKEN;
    return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a file based on extension
 */
export function estimateFileTokens(content: string, filename: string): number {
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'];
    const isCode = codeExtensions.some((ext) => filename.endsWith(ext));
    return estimateTokens(content, isCode);
}

/**
 * Estimate cost for a prompt
 */
export function estimateCost(
    inputTokens: number,
    outputTokens: number,
    model = DEFAULT_MODEL
): number {
    const config = MODELS[model] || MODELS[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1000) * config.inputCostPer1k;
    const outputCost = (outputTokens / 1000) * config.outputCostPer1k;
    return inputCost + outputCost;
}

/**
 * Check if content fits in context window
 */
export function fitsInContext(
    tokens: number,
    model = DEFAULT_MODEL,
    reserveForOutput = 4096
): boolean {
    const config = MODELS[model] || MODELS[DEFAULT_MODEL];
    return tokens + reserveForOutput <= config.contextWindow;
}

/**
 * Split content into chunks that fit in context
 */
export function splitForContext(
    content: string,
    model = DEFAULT_MODEL,
    reserveForOutput = 4096,
    overlapTokens = 100
): string[] {
    const config = MODELS[model] || MODELS[DEFAULT_MODEL];
    const maxTokensPerChunk = config.contextWindow - reserveForOutput - overlapTokens;
    const maxCharsPerChunk = maxTokensPerChunk * CHARS_PER_TOKEN;

    if (content.length <= maxCharsPerChunk) {
        return [content];
    }

    const chunks: string[] = [];
    let start = 0;
    const overlapChars = overlapTokens * CHARS_PER_TOKEN;

    while (start < content.length) {
        let end = start + maxCharsPerChunk;

        // Try to split at a natural boundary
        if (end < content.length) {
            // Look for paragraph break
            const paragraphBreak = content.lastIndexOf('\n\n', end);
            if (paragraphBreak > start + maxCharsPerChunk * 0.5) {
                end = paragraphBreak + 2;
            } else {
                // Look for line break
                const lineBreak = content.lastIndexOf('\n', end);
                if (lineBreak > start + maxCharsPerChunk * 0.5) {
                    end = lineBreak + 1;
                }
            }
        }

        chunks.push(content.slice(start, end));
        start = end - overlapChars; // Overlap for continuity
    }

    return chunks;
}

export interface SplitResult {
    chunks: ContentChunk[];
    totalTokens: number;
    estimatedCost: number;
}

export interface ContentChunk {
    index: number;
    content: string;
    tokens: number;
    startOffset: number;
    endOffset: number;
}

/**
 * Split content and provide detailed chunk info
 */
export function splitWithMetadata(
    content: string,
    model = DEFAULT_MODEL,
    reserveForOutput = 4096
): SplitResult {
    const chunks = splitForContext(content, model, reserveForOutput);
    let offset = 0;
    let totalTokens = 0;

    const detailedChunks: ContentChunk[] = chunks.map((chunk, index) => {
        const tokens = estimateTokens(chunk);
        totalTokens += tokens;
        const result: ContentChunk = {
            index,
            content: chunk,
            tokens,
            startOffset: offset,
            endOffset: offset + chunk.length,
        };
        offset += chunk.length;
        return result;
    });

    return {
        chunks: detailedChunks,
        totalTokens,
        estimatedCost: estimateCost(totalTokens, totalTokens * 0.5, model),
    };
}

/**
 * Group files by directory for parallel processing
 */
export function groupFilesByDirectory(files: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const file of files) {
        const dir = file.split('/').slice(0, -1).join('/') || '.';
        if (!groups.has(dir)) {
            groups.set(dir, []);
        }
        groups.get(dir)!.push(file);
    }

    return groups;
}

/**
 * Estimate tokens for a plan step
 */
export function estimateStepTokens(step: { type: string; config: unknown }): number {
    const config = step.config as Record<string, unknown>;

    switch (step.type) {
        case 'ai-generate':
            return (
                estimateTokens(String(config.systemPrompt || '')) +
                estimateTokens(String(config.userPrompt || '')) +
                (Number(config.maxTokens) || 1000)
            );

        case 'ai-tool-call':
            return (
                estimateTokens(String(config.systemPrompt || '')) +
                estimateTokens(String(config.userPrompt || '')) +
                500 * (Number(config.maxSteps) || 5) // Rough estimate per tool call
            );

        case 'file-read':
            return 100; // Metadata only, content loaded at runtime

        case 'file-write':
            return estimateTokens(String(config.content || ''), true);

        default:
            return 10; // Minimal overhead for other operations
    }
}

/**
 * Suggest plan splits based on token analysis
 */
export interface PlanSplitSuggestion {
    shouldSplit: boolean;
    reason?: string;
    suggestedSplits: {
        stepRange: [number, number];
        estimatedTokens: number;
        description: string;
    }[];
}

export function analyzePlanForSplitting(
    steps: Array<{ type: string; config: unknown; description: string }>,
    model = DEFAULT_MODEL
): PlanSplitSuggestion {
    const config = MODELS[model] || MODELS[DEFAULT_MODEL];
    const maxTokensPerExecution = config.contextWindow * 0.7; // 70% utilization

    let currentTokens = 0;
    let splitStart = 0;
    const suggestedSplits: PlanSplitSuggestion['suggestedSplits'] = [];

    for (let i = 0; i < steps.length; i++) {
        const stepTokens = estimateStepTokens(steps[i]);
        currentTokens += stepTokens;

        if (currentTokens > maxTokensPerExecution) {
            suggestedSplits.push({
                stepRange: [splitStart, i - 1],
                estimatedTokens: currentTokens - stepTokens,
                description: `Steps ${splitStart + 1} to ${i}: ${steps[splitStart].description} → ${steps[i - 1].description}`,
            });
            splitStart = i;
            currentTokens = stepTokens;
        }
    }

    // Add final split
    if (splitStart < steps.length) {
        suggestedSplits.push({
            stepRange: [splitStart, steps.length - 1],
            estimatedTokens: currentTokens,
            description: `Steps ${splitStart + 1} to ${steps.length}: ${steps[splitStart].description} → ${steps[steps.length - 1].description}`,
        });
    }

    return {
        shouldSplit: suggestedSplits.length > 1,
        reason: suggestedSplits.length > 1
            ? `Plan exceeds context window, recommend ${suggestedSplits.length} separate executions`
            : undefined,
        suggestedSplits,
    };
}
