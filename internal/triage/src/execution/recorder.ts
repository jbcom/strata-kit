/**
 * VCR-style HTTP Recording and Playback
 *
 * Records HTTP interactions for reproducible testing:
 * - Ollama API calls
 * - GitHub API calls
 * - Any external HTTP
 *
 * Uses nock under the hood for interception.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface Recording {
    id: string;
    createdAt: string;
    description: string;
    interactions: RecordedInteraction[];
}

export interface RecordedInteraction {
    id: string;
    timestamp: string;
    request: RecordedRequest;
    response: RecordedResponse;
    duration: number;
}

export interface RecordedRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    bodyHash?: string;
}

export interface RecordedResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

export interface RecorderOptions {
    /** Directory to store recordings */
    fixturesDir: string;
    /** Recording mode */
    mode: 'record' | 'playback' | 'passthrough';
    /** Hosts to record/intercept */
    hosts: string[];
    /** Whether to update recordings on mismatch */
    updateOnMismatch?: boolean;
    /** Redact sensitive headers */
    redactHeaders?: string[];
}

const DEFAULT_REDACT_HEADERS = [
    'authorization',
    'x-api-key',
    'cookie',
    'set-cookie',
];

/**
 * HTTP Recorder for VCR-style testing
 */
export class HttpRecorder {
    private options: RecorderOptions;
    private recording: Recording | null = null;
    private playbackIndex = 0;
    private originalFetch: typeof fetch | null = null;

    constructor(options: RecorderOptions) {
        this.options = {
            ...options,
            redactHeaders: options.redactHeaders || DEFAULT_REDACT_HEADERS,
        };
    }

    /**
     * Start recording or playback
     */
    start(description: string): void {
        if (this.options.mode === 'passthrough') {
            return;
        }

        const recordingPath = this.getRecordingPath(description);

        if (this.options.mode === 'playback') {
            this.loadRecording(recordingPath);
        } else {
            this.recording = {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                description,
                interactions: [],
            };
        }

        this.interceptFetch();
    }

    /**
     * Stop recording and save
     */
    stop(): void {
        this.restoreFetch();

        if (this.options.mode === 'record' && this.recording) {
            this.saveRecording();
        }

        this.recording = null;
        this.playbackIndex = 0;
    }

    /**
     * Get path for a recording
     */
    private getRecordingPath(description: string): string {
        const safeName = description
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        return path.join(this.options.fixturesDir, `${safeName}.json`);
    }

    /**
     * Load existing recording
     */
    private loadRecording(recordingPath: string): void {
        if (!fs.existsSync(recordingPath)) {
            throw new Error(`Recording not found: ${recordingPath}`);
        }
        const content = fs.readFileSync(recordingPath, 'utf-8');
        this.recording = JSON.parse(content) as Recording;
    }

    /**
     * Save current recording
     */
    private saveRecording(): void {
        if (!this.recording) return;

        const recordingPath = this.getRecordingPath(this.recording.description);
        const dir = path.dirname(recordingPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(recordingPath, JSON.stringify(this.recording, null, 2));
    }

    /**
     * Intercept global fetch
     */
    private interceptFetch(): void {
        this.originalFetch = global.fetch;
        const self = this;

        global.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            const request = new Request(input, init);
            const url = new URL(request.url);

            // Check if this host should be intercepted
            const shouldIntercept = self.options.hosts.some(
                (host) => url.hostname.includes(host) || host === '*'
            );

            if (!shouldIntercept) {
                return self.originalFetch!(input, init);
            }

            if (self.options.mode === 'playback') {
                return self.playback(request);
            } else {
                return self.record(request);
            }
        };
    }

    /**
     * Restore original fetch
     */
    private restoreFetch(): void {
        if (this.originalFetch) {
            global.fetch = this.originalFetch;
            this.originalFetch = null;
        }
    }

    /**
     * Record a request/response
     */
    private async record(request: Request): Promise<Response> {
        const startTime = Date.now();

        // Make the actual request
        const response = await this.originalFetch!(request.clone());

        // Clone response to read body
        const responseClone = response.clone();
        const responseBody = await this.parseResponseBody(responseClone);

        // Record the interaction
        const interaction: RecordedInteraction = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            request: {
                method: request.method,
                url: request.url,
                headers: this.redactHeaders(Object.fromEntries(request.headers)),
                body: await this.parseRequestBody(request),
            },
            response: {
                status: response.status,
                headers: Object.fromEntries(response.headers),
                body: responseBody,
            },
            duration: Date.now() - startTime,
        };

        this.recording?.interactions.push(interaction);

        return response;
    }

    /**
     * Playback a recorded response
     */
    private async playback(request: Request): Promise<Response> {
        if (!this.recording || this.playbackIndex >= this.recording.interactions.length) {
            throw new Error(
                `No recorded interaction for request: ${request.method} ${request.url}`
            );
        }

        const interaction = this.recording.interactions[this.playbackIndex];
        this.playbackIndex++;

        // Verify request matches (loosely)
        if (
            interaction.request.method !== request.method ||
            !request.url.includes(new URL(interaction.request.url).pathname)
        ) {
            if (this.options.updateOnMismatch) {
                // Fall back to live request and update recording
                console.warn(`Recording mismatch, making live request: ${request.url}`);
                return this.record(request);
            }
            throw new Error(
                `Request mismatch: expected ${interaction.request.method} ${interaction.request.url}, got ${request.method} ${request.url}`
            );
        }

        // Simulate network delay (reduced)
        await new Promise((resolve) => setTimeout(resolve, Math.min(interaction.duration, 100)));

        // Return recorded response
        return new Response(JSON.stringify(interaction.response.body), {
            status: interaction.response.status,
            headers: interaction.response.headers,
        });
    }

    /**
     * Parse request body
     */
    private async parseRequestBody(request: Request): Promise<unknown> {
        try {
            const clone = request.clone();
            const text = await clone.text();
            if (!text) return undefined;
            return JSON.parse(text);
        } catch {
            return undefined;
        }
    }

    /**
     * Parse response body
     */
    private async parseResponseBody(response: Response): Promise<unknown> {
        try {
            const text = await response.text();
            if (!text) return undefined;
            return JSON.parse(text);
        } catch {
            return undefined;
        }
    }

    /**
     * Redact sensitive headers
     */
    private redactHeaders(headers: Record<string, string>): Record<string, string> {
        const redacted = { ...headers };
        for (const key of Object.keys(redacted)) {
            if (this.options.redactHeaders?.includes(key.toLowerCase())) {
                redacted[key] = '[REDACTED]';
            }
        }
        return redacted;
    }
}

/**
 * Create a recorder instance with default settings
 */
export function createRecorder(
    fixturesDir: string,
    mode: RecorderOptions['mode'] = 'passthrough'
): HttpRecorder {
    return new HttpRecorder({
        fixturesDir,
        mode,
        hosts: ['api.ollama.com', 'api.github.com', 'ollama.com'],
    });
}

/**
 * Convenience wrapper for recording a test
 */
export async function withRecording<T>(
    description: string,
    fixturesDir: string,
    mode: RecorderOptions['mode'],
    fn: () => Promise<T>
): Promise<T> {
    const recorder = createRecorder(fixturesDir, mode);
    recorder.start(description);

    try {
        return await fn();
    } finally {
        recorder.stop();
    }
}
