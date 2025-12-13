/**
 * AI Client using Vercel AI SDK with Ollama provider
 *
 * Uses ai-sdk-ollama for Ollama Cloud integration.
 * Configured via environment variables:
 * - OLLAMA_API_KEY: API key for Ollama Cloud
 * - OLLAMA_MODEL: Model to use (default: glm-4.6:cloud)
 */

import { createOllama, type OllamaProvider } from 'ai-sdk-ollama';
import { generateText } from 'ai';

export const DEFAULT_MODEL = 'glm-4.6:cloud';
export const CLOUD_HOST = 'https://ollama.com';

export interface AIConfig {
    apiKey?: string;
    model?: string;
    host?: string;
}

let _provider: OllamaProvider | null = null;

/**
 * Get or create the Ollama provider instance
 */
export function getProvider(config: AIConfig = {}): OllamaProvider {
    if (_provider) return _provider;

    const apiKey = config.apiKey || process.env.OLLAMA_API_KEY;
    const host = config.host || process.env.OLLAMA_HOST || CLOUD_HOST;

    if (!apiKey) {
        throw new Error('OLLAMA_API_KEY environment variable is required');
    }

    _provider = createOllama({
        baseURL: host,
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    return _provider;
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
 * Generate text using the AI model
 */
export async function generate(
    prompt: string,
    options: GenerateOptions = {}
): Promise<string> {
    const provider = getProvider();
    const modelId = getModel();

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const result = await generateText({
        model: provider(modelId),
        messages,
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
    });

    return result.text;
}

/**
 * Generate text with tools
 */
export async function generateWithTools(
    prompt: string,
    tools: Record<string, unknown>,
    options: GenerateOptions = {}
): Promise<{ text: string; toolCalls: unknown[]; toolResults: unknown[] }> {
    const provider = getProvider();
    const modelId = getModel();

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const result = await generateText({
        model: provider(modelId),
        messages,
        tools: tools as Parameters<typeof generateText>[0]['tools'],
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
    });

    return {
        text: result.text,
        toolCalls: result.toolCalls || [],
        toolResults: result.toolResults || [],
    };
}
