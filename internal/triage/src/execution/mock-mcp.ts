/**
 * Mock MCP Provider
 *
 * Provides MCP-compatible tools that operate on fixtures:
 * - Filesystem operations go to fixture directory
 * - Git operations are real but isolated
 * - GitHub API returns mock data
 *
 * The AI has no idea it's not talking to a real system.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
    type FixtureRepo,
    type FixtureIssue,
    type FixturePR,
    loadMockIssues,
    loadMockPRs,
} from './fixtures.js';

export interface MockMCPOptions {
    /** The fixture repository to operate on */
    fixture: FixtureRepo;
    /** Whether to track all operations */
    trackOperations?: boolean;
    /** Whether to allow real network calls */
    allowNetwork?: boolean;
}

export interface TrackedOperation {
    timestamp: string;
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
}

/**
 * Mock MCP Provider
 *
 * Creates tools that look exactly like real MCP tools
 * but operate on fixtures instead.
 */
export class MockMCPProvider {
    private fixture: FixtureRepo;
    private operations: TrackedOperation[] = [];
    private trackOperations: boolean;
    private mockIssues: FixtureIssue[];
    private mockPRs: FixturePR[];
    private issueComments: Map<number, Array<{ author: string; body: string }>> = new Map();
    private issueLabels: Map<number, Set<string>> = new Map();

    constructor(options: MockMCPOptions) {
        this.fixture = options.fixture;
        this.trackOperations = options.trackOperations ?? true;
        this.mockIssues = loadMockIssues(options.fixture.root);
        this.mockPRs = loadMockPRs(options.fixture.root);

        // Initialize labels from issues
        for (const issue of this.mockIssues) {
            this.issueLabels.set(issue.number, new Set(issue.labels));
            this.issueComments.set(issue.number, [...(issue.comments || [])]);
        }
    }

    /**
     * Get all tracked operations
     */
    getOperations(): TrackedOperation[] {
        return [...this.operations];
    }

    /**
     * Get tools in the format expected by AI SDK
     */
    getTools(): Record<string, MockTool> {
        return {
            // Filesystem tools (redirect to fixture)
            read_file: this.createFilesystemTool('read_file', (args) => this.readFile(args as { path: string })),
            write_file: this.createFilesystemTool('write_file', (args) => this.writeFile(args as { path: string; content: string })),
            list_files: this.createFilesystemTool('list_files', (args) => this.listFiles(args as { path?: string })),
            search_files: this.createFilesystemTool('search_files', (args) => this.searchFiles(args as { pattern: string; path?: string })),
            delete_file: this.createFilesystemTool('delete_file', (args) => this.deleteFile(args as { path: string })),

            // Git tools (real but isolated)
            git_status: this.createGitTool('git_status', () => this.gitStatus()),
            git_diff: this.createGitTool('git_diff', (args) => this.gitDiff(args as { staged?: boolean })),
            git_add: this.createGitTool('git_add', (args) => this.gitAdd(args as { path: string })),
            git_commit: this.createGitTool('git_commit', (args) => this.gitCommit(args as { message: string })),
            git_log: this.createGitTool('git_log', (args) => this.gitLog(args as { count?: number })),

            // GitHub tools (mock data)
            github_get_issue: this.createGitHubTool('github_get_issue', (args) => this.getIssue(args as { number: number })),
            github_add_labels: this.createGitHubTool('github_add_labels', (args) => this.addLabels(args as { number: number; labels: string[] })),
            github_comment: this.createGitHubTool('github_comment', (args) => this.addComment(args as { number: number; body: string })),
            github_get_pr: this.createGitHubTool('github_get_pr', (args) => this.getPR(args as { number: number })),
            github_list_issues: this.createGitHubTool('github_list_issues', (args) => this.listIssues(args as { state?: string; labels?: string[] })),
        };
    }

    // ==================== FILESYSTEM TOOLS ====================

    private readFile(args: { path: string }): string {
        const fullPath = this.resolvePath(args.path);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${args.path}`);
        }
        return fs.readFileSync(fullPath, 'utf-8');
    }

    private writeFile(args: { path: string; content: string }): { success: boolean } {
        const fullPath = this.resolvePath(args.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, args.content, 'utf-8');
        return { success: true };
    }

    private listFiles(args: { path?: string }): string[] {
        const fullPath = this.resolvePath(args.path || '.');
        if (!fs.existsSync(fullPath)) return [];

        const results: string[] = [];
        const walk = (dir: string, prefix: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;
                if (entry.name === 'node_modules') continue;

                const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(path.join(dir, entry.name), relativePath);
                } else {
                    results.push(relativePath);
                }
            }
        };
        walk(fullPath, args.path || '');
        return results;
    }

    private searchFiles(args: { pattern: string; path?: string }): Array<{ file: string; line: number; content: string }> {
        const files = this.listFiles({ path: args.path });
        const results: Array<{ file: string; line: number; content: string }> = [];
        const regex = new RegExp(args.pattern, 'gi');

        for (const file of files) {
            try {
                const content = this.readFile({ path: file });
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (regex.test(lines[i])) {
                        results.push({ file, line: i + 1, content: lines[i] });
                    }
                }
            } catch {
                // Skip binary/unreadable files
            }
        }
        return results;
    }

    private deleteFile(args: { path: string }): { success: boolean } {
        const fullPath = this.resolvePath(args.path);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
        return { success: true };
    }

    // ==================== GIT TOOLS ====================

    private gitStatus(): { staged: string[]; modified: string[]; untracked: string[] } {
        const output = execFileSync('git', ['status', '--porcelain'], {
            cwd: this.fixture.root,
            encoding: 'utf-8',
        });

        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];

        for (const line of output.split('\n').filter(Boolean)) {
            const status = line.slice(0, 2);
            const file = line.slice(3);

            if (status.startsWith('A') || status.startsWith('M')) {
                if (status[0] !== ' ') staged.push(file);
            }
            if (status[1] === 'M') modified.push(file);
            if (status === '??') untracked.push(file);
        }

        return { staged, modified, untracked };
    }

    private gitDiff(args: { staged?: boolean }): string {
        const gitArgs = args.staged ? ['diff', '--staged'] : ['diff'];
        return execFileSync('git', gitArgs, { cwd: this.fixture.root, encoding: 'utf-8' });
    }

    private gitAdd(args: { path: string }): { success: boolean } {
        execFileSync('git', ['add', args.path], { cwd: this.fixture.root, stdio: 'pipe' });
        return { success: true };
    }

    private gitCommit(args: { message: string }): { success: boolean; hash: string } {
        execFileSync('git', ['commit', '-m', args.message], { cwd: this.fixture.root, stdio: 'pipe' });
        const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: this.fixture.root,
            encoding: 'utf-8',
        }).trim();
        return { success: true, hash };
    }

    private gitLog(args: { count?: number }): Array<{ hash: string; message: string; date: string }> {
        const count = args.count || 10;
        const output = execFileSync('git', ['log', `-${count}`, '--format=%H|%s|%aI'], {
            cwd: this.fixture.root,
            encoding: 'utf-8',
        });

        return output
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                const [hash, message, date] = line.split('|');
                return { hash, message, date };
            });
    }

    // ==================== GITHUB TOOLS ====================

    private getIssue(args: { number: number }): FixtureIssue | null {
        const issue = this.mockIssues.find((i) => i.number === args.number);
        if (!issue) return null;

        // Return with current state (labels may have changed)
        return {
            ...issue,
            labels: [...(this.issueLabels.get(args.number) || issue.labels)],
            comments: this.issueComments.get(args.number) || issue.comments,
        };
    }

    private addLabels(args: { number: number; labels: string[] }): { success: boolean } {
        const labelSet = this.issueLabels.get(args.number) || new Set();
        for (const label of args.labels) {
            labelSet.add(label);
        }
        this.issueLabels.set(args.number, labelSet);
        return { success: true };
    }

    private addComment(args: { number: number; body: string }): { success: boolean; id: number } {
        const comments = this.issueComments.get(args.number) || [];
        comments.push({ author: 'triage-bot', body: args.body });
        this.issueComments.set(args.number, comments);
        return { success: true, id: comments.length };
    }

    private getPR(args: { number: number }): FixturePR | null {
        return this.mockPRs.find((pr) => pr.number === args.number) || null;
    }

    private listIssues(args: { state?: string; labels?: string[] }): FixtureIssue[] {
        return this.mockIssues.filter((issue) => {
            if (args.state && issue.state !== args.state) return false;
            if (args.labels) {
                const issueLabels = this.issueLabels.get(issue.number) || new Set(issue.labels);
                if (!args.labels.every((l) => issueLabels.has(l))) return false;
            }
            return true;
        });
    }

    // ==================== HELPERS ====================

    private resolvePath(relativePath: string): string {
        // Prevent escaping fixture directory
        const resolved = path.resolve(this.fixture.root, relativePath);
        if (!resolved.startsWith(this.fixture.root)) {
            throw new Error(`Path escapes fixture: ${relativePath}`);
        }
        return resolved;
    }

    private createFilesystemTool(name: string, fn: (args: unknown) => unknown): MockTool {
        return this.createTrackedTool(name, 'filesystem', fn);
    }

    private createGitTool(name: string, fn: (args: unknown) => unknown): MockTool {
        return this.createTrackedTool(name, 'git', fn);
    }

    private createGitHubTool(name: string, fn: (args: unknown) => unknown): MockTool {
        return this.createTrackedTool(name, 'github', fn);
    }

    private createTrackedTool(name: string, category: string, fn: (args: unknown) => unknown): MockTool {
        const self = this;

        return {
            name,
            category,
            execute: async (args: Record<string, unknown>) => {
                const result = fn(args);

                if (self.trackOperations) {
                    self.operations.push({
                        timestamp: new Date().toISOString(),
                        tool: name,
                        args,
                        result,
                    });
                }

                return result;
            },
        };
    }

    /**
     * Get current state for assertions
     */
    getState(): MockState {
        return {
            issueLabels: Object.fromEntries(
                [...this.issueLabels.entries()].map(([k, v]) => [k, [...v]])
            ),
            issueComments: Object.fromEntries(this.issueComments.entries()),
            files: this.listFiles({}),
            gitLog: this.gitLog({ count: 10 }),
        };
    }

    /**
     * Verify expectations
     */
    verifyExpectations(): VerificationResult {
        const expectations = this.fixture.expectations;
        const state = this.getState();
        const errors: string[] = [];

        // Check created files
        if (expectations.createdFiles) {
            for (const file of expectations.createdFiles) {
                if (!state.files.includes(file)) {
                    errors.push(`Expected file to be created: ${file}`);
                }
            }
        }

        // Check labels added
        if (expectations.labelsAdded) {
            for (const issue of this.mockIssues) {
                const labels = this.issueLabels.get(issue.number) || new Set();
                for (const expectedLabel of expectations.labelsAdded) {
                    if (!labels.has(expectedLabel)) {
                        errors.push(`Expected label '${expectedLabel}' on issue #${issue.number}`);
                    }
                }
            }
        }

        // Check comments contain expected strings
        if (expectations.commentContains) {
            for (const issue of this.mockIssues) {
                const comments = this.issueComments.get(issue.number) || [];
                const allCommentText = comments.map((c) => c.body).join(' ');

                for (const expected of expectations.commentContains) {
                    if (!allCommentText.toLowerCase().includes(expected.toLowerCase())) {
                        errors.push(`Expected comment containing '${expected}' on issue #${issue.number}`);
                    }
                }
            }
        }

        return {
            passed: errors.length === 0,
            errors,
            state,
        };
    }
}

export interface MockTool {
    name: string;
    category: string;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface MockState {
    issueLabels: Record<number, string[]>;
    issueComments: Record<number, Array<{ author: string; body: string }>>;
    files: string[];
    gitLog: Array<{ hash: string; message: string; date: string }>;
}

export interface VerificationResult {
    passed: boolean;
    errors: string[];
    state: MockState;
}

/**
 * Create a mock MCP provider for a fixture
 */
export function createMockMCP(fixture: FixtureRepo): MockMCPProvider {
    return new MockMCPProvider({ fixture, trackOperations: true });
}
