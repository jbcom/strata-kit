/**
 * AI Client using Vercel AI SDK with Ollama provider
 *
 * Uses ollama-ai-provider (ai-sdk-ollama) for Ollama integration.
 * Configured via environment variables:
 * - OLLAMA_API_KEY: API key for Ollama Cloud (optional for local)
 * - OLLAMA_MODEL: Model to use (default: qwen2.5)
 * - OLLAMA_HOST: Host URL (default: http://localhost:11434/api for local)
 */

import { ollama, createOllama } from 'ai-sdk-ollama';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

// Use a looser type for tools to avoid version incompatibilities between
// @ai-sdk/mcp and the ai package
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;

// Default model - glm-4.6:cloud on Ollama Cloud has good tool support
export const DEFAULT_MODEL = 'glm-4.6:cloud';
export const CLOUD_HOST = 'https://ollama.com';
export const LOCAL_HOST = 'http://localhost:11434/api';

export interface AIConfig {
    apiKey?: string;
    model?: string;
    host?: string;
}

// Cached provider instance
let _customProvider: ReturnType<typeof createOllama> | null = null;

/**
 * Get or create a custom Ollama provider instance
 * Uses the default `ollama` export for local, or createOllama for cloud
 */
export function getProvider(config: AIConfig = {}) {
    const apiKey = config.apiKey || process.env.OLLAMA_API_KEY;
    const host = config.host || process.env.OLLAMA_HOST;

    // If no custom config needed, use default provider
    if (!apiKey && !host) {
        return ollama;
    }

    // Create custom provider with auth headers for cloud
    if (!_customProvider) {
        _customProvider = createOllama({
            baseURL: host || (apiKey ? CLOUD_HOST : LOCAL_HOST),
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        });
    }

    return _customProvider;
}

/**
 * Get the model ID to use
 */
export function getModel(config: AIConfig = {}): string {
    return config.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

export interface GenerateOptions {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Generate text using the AI model (no tools)
 */
export async function generate(
    prompt: string,
    options: GenerateOptions = {}
): Promise<string> {
    const provider = getProvider();
    const modelId = getModel();

    const result = await generateText({
        model: provider(modelId),
        system: options.systemPrompt,
        prompt,
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
    });

    return result.text;
}

export interface GenerateWithToolsOptions extends GenerateOptions {
    maxSteps?: number;
    onStepFinish?: (step: { toolCalls?: unknown[]; toolResults?: unknown[]; text?: string }) => void;
}

export interface GenerateWithToolsResult {
    text: string;
    toolCalls: unknown[];
    toolResults: unknown[];
    steps: unknown[];
    finishReason: string;
}

/**
 * Generate text with tools - uses AI SDK's built-in multi-step support
 *
 * This properly integrates with the Vercel AI SDK's agentic loop via stopWhen
 */
export async function generateWithTools(
    prompt: string,
    tools: ToolSet,
    options: GenerateWithToolsOptions = {}
): Promise<GenerateWithToolsResult> {
    const provider = getProvider();
    const modelId = getModel();
    const maxSteps = options.maxSteps ?? 10;

    const result = await generateText({
        model: provider(modelId),
        system: options.systemPrompt,
        prompt,
        tools,
        stopWhen: stepCountIs(maxSteps),
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        onStepFinish: options.onStepFinish ? (step) => {
            options.onStepFinish?.({
                toolCalls: step.toolCalls,
                toolResults: step.toolResults,
                text: step.text,
            });
        } : undefined,
    });

    // Collect all tool calls and results from all steps
    const allToolCalls: unknown[] = [];
    const allToolResults: unknown[] = [];

    if (result.steps) {
        for (const step of result.steps) {
            if (step.toolCalls) {
                allToolCalls.push(...step.toolCalls);
            }
            if (step.toolResults) {
                allToolResults.push(...step.toolResults);
            }
        }
    }

    return {
        text: result.text,
        toolCalls: allToolCalls,
        toolResults: allToolResults,
        steps: result.steps || [],
        finishReason: result.finishReason,
    };
}

/**
 * Create a simple tool definition helper
 * Wraps the AI SDK's tool() function for convenience
 */
export function createTool<T extends z.ZodType>(config: {
    description: string;
    inputSchema: T;
    execute: (input: z.infer<T>) => Promise<unknown>;
}) {
    return tool({
        description: config.description,
        inputSchema: config.inputSchema,
        execute: config.execute,
    });
}

// Re-export useful types and functions from ai package
export { tool, stepCountIs } from 'ai';
export { z } from 'zod';
