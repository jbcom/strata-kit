/**
 * Sandbox Filesystem
 *
 * Provides an isolated filesystem for dry-run executions:
 * - Copies fixtures for testing
 * - Tracks all file modifications
 * - Can compare with expected results
 *
 * Uses memfs for in-memory filesystem or a temp directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

export interface SandboxOptions {
    /** Base directory to clone */
    baseDir: string;
    /** Files/patterns to include */
    include?: string[];
    /** Files/patterns to exclude */
    exclude?: string[];
    /** Use in-memory filesystem */
    inMemory?: boolean;
    /** Fixtures directory to preload */
    fixturesDir?: string;
}

export interface FileChange {
    type: 'create' | 'modify' | 'delete';
    path: string;
    originalContent?: string;
    newContent?: string;
}

/**
 * Sandbox for isolated file operations
 */
export class Sandbox {
    private options: SandboxOptions;
    private tempDir: string;
    private changes: FileChange[] = [];
    private originalFiles: Map<string, string> = new Map();

    constructor(options: SandboxOptions) {
        this.options = options;
        this.tempDir = '';
    }

    /**
     * Initialize the sandbox
     */
    async init(): Promise<string> {
        // Create temp directory
        this.tempDir = path.join(
            os.tmpdir(),
            `triage-sandbox-${crypto.randomBytes(8).toString('hex')}`
        );
        fs.mkdirSync(this.tempDir, { recursive: true });

        // Load fixtures if specified
        if (this.options.fixturesDir && fs.existsSync(this.options.fixturesDir)) {
            await this.copyDir(this.options.fixturesDir, this.tempDir);
        }

        // Copy base directory files
        if (fs.existsSync(this.options.baseDir)) {
            await this.copyDir(this.options.baseDir, this.tempDir);
        }

        // Track original files
        await this.scanOriginalFiles(this.tempDir);

        return this.tempDir;
    }

    /**
     * Get the sandbox root directory
     */
    getRoot(): string {
        return this.tempDir;
    }

    /**
     * Resolve a path within the sandbox
     */
    resolve(...segments: string[]): string {
        return path.join(this.tempDir, ...segments);
    }

    /**
     * Read a file from sandbox
     */
    readFile(filePath: string): string {
        const fullPath = this.resolve(filePath);
        return fs.readFileSync(fullPath, 'utf-8');
    }

    /**
     * Write a file to sandbox
     */
    writeFile(filePath: string, content: string): void {
        const fullPath = this.resolve(filePath);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const originalContent = this.originalFiles.get(filePath);
        const changeType = originalContent === undefined ? 'create' : 'modify';

        this.changes.push({
            type: changeType,
            path: filePath,
            originalContent,
            newContent: content,
        });

        fs.writeFileSync(fullPath, content, 'utf-8');
    }

    /**
     * Delete a file from sandbox
     */
    deleteFile(filePath: string): void {
        const fullPath = this.resolve(filePath);

        if (fs.existsSync(fullPath)) {
            const originalContent = fs.readFileSync(fullPath, 'utf-8');

            this.changes.push({
                type: 'delete',
                path: filePath,
                originalContent,
            });

            fs.unlinkSync(fullPath);
        }
    }

    /**
     * Check if a file exists
     */
    exists(filePath: string): boolean {
        return fs.existsSync(this.resolve(filePath));
    }

    /**
     * List files in a directory
     */
    listFiles(dirPath = ''): string[] {
        const fullPath = this.resolve(dirPath);
        if (!fs.existsSync(fullPath)) return [];

        const results: string[] = [];

        const walk = (dir: string, prefix: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(path.join(dir, entry.name), relativePath);
                } else {
                    results.push(relativePath);
                }
            }
        };

        walk(fullPath, dirPath);
        return results;
    }

    /**
     * Get all changes made in sandbox
     */
    getChanges(): FileChange[] {
        return [...this.changes];
    }

    /**
     * Get diff summary
     */
    getDiffSummary(): string {
        const lines: string[] = [];

        for (const change of this.changes) {
            switch (change.type) {
                case 'create':
                    lines.push(`+ ${change.path}`);
                    break;
                case 'modify':
                    lines.push(`M ${change.path}`);
                    break;
                case 'delete':
                    lines.push(`- ${change.path}`);
                    break;
            }
        }

        return lines.join('\n');
    }

    /**
     * Compare sandbox with expected files
     */
    compareWithExpected(expectedDir: string): ComparisonResult {
        const result: ComparisonResult = {
            matches: [],
            mismatches: [],
            missing: [],
            extra: [],
        };

        const expectedFiles = this.listFilesRecursive(expectedDir);
        const actualFiles = new Set(this.listFiles());

        for (const expectedFile of expectedFiles) {
            if (!actualFiles.has(expectedFile)) {
                result.missing.push(expectedFile);
                continue;
            }

            actualFiles.delete(expectedFile);

            const expectedContent = fs.readFileSync(
                path.join(expectedDir, expectedFile),
                'utf-8'
            );
            const actualContent = this.readFile(expectedFile);

            if (expectedContent === actualContent) {
                result.matches.push(expectedFile);
            } else {
                result.mismatches.push({
                    path: expectedFile,
                    expected: expectedContent,
                    actual: actualContent,
                });
            }
        }

        result.extra = [...actualFiles];

        return result;
    }

    /**
     * Clean up sandbox
     */
    cleanup(): void {
        if (this.tempDir && fs.existsSync(this.tempDir)) {
            fs.rmSync(this.tempDir, { recursive: true, force: true });
        }
        this.tempDir = '';
        this.changes = [];
        this.originalFiles.clear();
    }

    /**
     * Copy directory recursively
     */
    private async copyDir(src: string, dest: string): Promise<void> {
        if (!fs.existsSync(src)) return;

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            // Check exclude patterns
            if (this.shouldExclude(entry.name)) continue;

            if (entry.isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true });
                await this.copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /**
     * Scan and track original files
     */
    private async scanOriginalFiles(dir: string, prefix = ''): Promise<void> {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                await this.scanOriginalFiles(fullPath, relativePath);
            } else {
                const content = fs.readFileSync(fullPath, 'utf-8');
                this.originalFiles.set(relativePath, content);
            }
        }
    }

    /**
     * Check if path should be excluded
     */
    private shouldExclude(name: string): boolean {
        const defaultExclude = ['node_modules', '.git', 'dist', 'coverage'];
        const exclude = this.options.exclude || defaultExclude;

        return exclude.some((pattern) => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(name);
            }
            return name === pattern;
        });
    }

    /**
     * List files recursively
     */
    private listFilesRecursive(dir: string): string[] {
        const results: string[] = [];

        const walk = (currentDir: string, prefix: string) => {
            if (!fs.existsSync(currentDir)) return;

            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(path.join(currentDir, entry.name), relativePath);
                } else {
                    results.push(relativePath);
                }
            }
        };

        walk(dir, '');
        return results;
    }
}

export interface ComparisonResult {
    matches: string[];
    mismatches: Array<{
        path: string;
        expected: string;
        actual: string;
    }>;
    missing: string[];
    extra: string[];
}

/**
 * Create a sandbox with default options
 */
export function createSandbox(baseDir: string, fixturesDir?: string): Sandbox {
    return new Sandbox({
        baseDir,
        fixturesDir,
        exclude: ['node_modules', '.git', 'dist', 'coverage', '*.log'],
    });
}

/**
 * Convenience wrapper for sandboxed execution
 */
export async function withSandbox<T>(
    baseDir: string,
    fn: (sandbox: Sandbox) => Promise<T>,
    fixturesDir?: string
): Promise<{ result: T; changes: FileChange[] }> {
    const sandbox = createSandbox(baseDir, fixturesDir);
    await sandbox.init();

    try {
        const result = await fn(sandbox);
        return { result, changes: sandbox.getChanges() };
    } finally {
        sandbox.cleanup();
    }
}
