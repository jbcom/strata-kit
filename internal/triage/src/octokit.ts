/**
 * Octokit GitHub API Client
 *
 * Advanced GitHub operations using Octokit SDK + GraphQL:
 * - PR state management (draft/ready/auto-merge)
 * - Review comment handling
 * - Check runs and status
 * - CodeQL security analysis
 * - Code scanning alerts
 */

import { Octokit } from 'octokit';

let _octokit: Octokit | null = null;

/**
 * Get or create Octokit client
 */
export function getOctokit(): Octokit {
    if (_octokit) return _octokit;

    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GH_TOKEN or GITHUB_TOKEN environment variable is required');
    }

    _octokit = new Octokit({
        auth: token,
        userAgent: 'strata-triage/1.0.0',
    });

    return _octokit;
}

/**
 * Get repository context from environment or git
 */
export function getRepoContext(): { owner: string; repo: string } {
    // Try GitHub Actions context first
    const repository = process.env.GITHUB_REPOSITORY;
    if (repository) {
        const [owner, repo] = repository.split('/');
        return { owner, repo };
    }

    // Fallback: try to get from git remote
    try {
        const { execFileSync } = require('child_process');
        const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim();
        const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (match) {
            return { owner: match[1], repo: match[2] };
        }
    } catch {
        // Ignore
    }

    throw new Error('Could not determine repository context');
}

// ============================================
// PR STATE MANAGEMENT
// ============================================

/**
 * Convert PR to draft
 */
export async function convertPRToDraft(prNumber: number): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    // Need to get PR node ID first
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

    await octokit.graphql(`
        mutation($pullRequestId: ID!) {
            convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
                pullRequest {
                    isDraft
                }
            }
        }
    `, {
        pullRequestId: pr.node_id,
    });
}

/**
 * Enable auto-merge for a PR
 */
export async function enableAutoMerge(
    prNumber: number,
    mergeMethod: 'MERGE' | 'SQUASH' | 'REBASE' = 'SQUASH'
): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

    await octokit.graphql(`
        mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
            enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
                pullRequest {
                    autoMergeRequest {
                        enabledAt
                    }
                }
            }
        }
    `, {
        pullRequestId: pr.node_id,
        mergeMethod,
    });
}

/**
 * Disable auto-merge for a PR
 */
export async function disableAutoMerge(prNumber: number): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

    await octokit.graphql(`
        mutation($pullRequestId: ID!) {
            disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {
                pullRequest {
                    autoMergeRequest {
                        enabledAt
                    }
                }
            }
        }
    `, {
        pullRequestId: pr.node_id,
    });
}

// ============================================
// REVIEW COMMENTS
// ============================================

export interface ReviewComment {
    id: number;
    body: string;
    path: string;
    line?: number;
    user: string;
    createdAt: string;
    state?: string;
}

/**
 * Get all review comments on a PR
 */
export async function getPRReviewComments(prNumber: number): Promise<ReviewComment[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const comments = await octokit.paginate(octokit.rest.pulls.listReviewComments, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
    });

    return comments.map((c) => ({
        id: c.id,
        body: c.body,
        path: c.path,
        line: c.line ?? undefined,
        user: c.user?.login ?? 'unknown',
        createdAt: c.created_at,
    }));
}

/**
 * Get all reviews on a PR
 */
export async function getPRReviews(prNumber: number): Promise<Array<{
    id: number;
    user: string;
    state: string;
    body: string;
    submittedAt: string;
}>> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
    });

    return reviews.map((r) => ({
        id: r.id,
        user: r.user?.login ?? 'unknown',
        state: r.state,
        body: r.body ?? '',
        submittedAt: r.submitted_at ?? '',
    }));
}

/**
 * Reply to a review comment
 */
export async function replyToReviewComment(
    prNumber: number,
    commentId: number,
    body: string
): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    await octokit.rest.pulls.createReplyForReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        comment_id: commentId,
        body,
    });
}

/**
 * Submit a PR review
 */
export async function submitPRReview(
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string
): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event,
        body,
    });
}

// ============================================
// CHECK RUNS & STATUS
// ============================================

export interface CheckRun {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    startedAt: string;
    completedAt: string | null;
    url: string;
}

/**
 * Get check runs for a commit/PR
 */
export async function getCheckRuns(ref: string): Promise<CheckRun[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const { data } = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref,
        per_page: 100,
    });

    return data.check_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        startedAt: run.started_at ?? '',
        completedAt: run.completed_at,
        url: run.html_url ?? '',
    }));
}

/**
 * Check if all required checks pass
 */
export async function areAllChecksPassing(ref: string): Promise<{
    passing: boolean;
    pending: number;
    failed: string[];
}> {
    const checks = await getCheckRuns(ref);

    const pending = checks.filter((c) => c.status !== 'completed').length;
    const failed = checks
        .filter((c) => c.conclusion && !['success', 'neutral', 'skipped'].includes(c.conclusion))
        .map((c) => c.name);

    return {
        passing: pending === 0 && failed.length === 0,
        pending,
        failed,
    };
}

/**
 * Create a check run
 */
export async function createCheckRun(
    name: string,
    headSha: string,
    options: {
        status?: 'queued' | 'in_progress' | 'completed';
        conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
        title?: string;
        summary?: string;
        text?: string;
    } = {}
): Promise<number> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const { data } = await octokit.rest.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: options.status,
        conclusion: options.conclusion,
        output: options.title ? {
            title: options.title,
            summary: options.summary ?? '',
            text: options.text,
        } : undefined,
    });

    return data.id;
}

// ============================================
// CODE SCANNING / CODEQL
// ============================================

export interface CodeScanningAlert {
    number: number;
    rule: {
        id: string;
        name?: string;
        severity: string;
        description: string;
    };
    state: string;
    tool: string;
    createdAt: string;
    url: string;
    location?: {
        path: string;
        startLine: number;
        endLine: number;
    };
}

/**
 * Get code scanning alerts for the repository
 */
export async function getCodeScanningAlerts(
    state: 'open' | 'dismissed' | 'fixed' = 'open'
): Promise<CodeScanningAlert[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    try {
        const alerts = await octokit.paginate(octokit.rest.codeScanning.listAlertsForRepo, {
            owner,
            repo,
            state,
            per_page: 100,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (alerts as any[]).map((alert) => ({
            number: alert.number,
            rule: {
                id: alert.rule?.id ?? 'unknown',
                severity: alert.rule?.severity ?? 'unknown',
                description: alert.rule?.description ?? '',
            },
            state: alert.state ?? 'unknown',
            tool: alert.tool?.name ?? 'unknown',
            createdAt: alert.created_at,
            url: alert.html_url,
            location: alert.most_recent_instance?.location ? {
                path: alert.most_recent_instance.location.path ?? '',
                startLine: alert.most_recent_instance.location.start_line ?? 0,
                endLine: alert.most_recent_instance.location.end_line ?? 0,
            } : undefined,
        }));
    } catch (error) {
        // Code scanning might not be enabled
        if ((error as { status?: number }).status === 404) {
            return [];
        }
        throw error;
    }
}

/**
 * Get code scanning alerts for a PR
 */
export async function getPRCodeScanningAlerts(prNumber: number): Promise<CodeScanningAlert[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    try {
        const alerts = await octokit.paginate(octokit.rest.codeScanning.listAlertsForRepo, {
            owner,
            repo,
            ref: `refs/pull/${prNumber}/head`,
            per_page: 100,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (alerts as any[]).map((alert) => ({
            number: alert.number,
            rule: {
                id: alert.rule?.id ?? 'unknown',
                severity: alert.rule?.severity ?? 'unknown',
                description: alert.rule?.description ?? '',
            },
            state: alert.state ?? 'unknown',
            tool: alert.tool?.name ?? 'unknown',
            createdAt: alert.created_at,
            url: alert.html_url,
            location: alert.most_recent_instance?.location ? {
                path: alert.most_recent_instance.location.path ?? '',
                startLine: alert.most_recent_instance.location.start_line ?? 0,
                endLine: alert.most_recent_instance.location.end_line ?? 0,
            } : undefined,
        }));
    } catch (error) {
        if ((error as { status?: number }).status === 404) {
            return [];
        }
        throw error;
    }
}

// ============================================
// DEPENDABOT / SECURITY ADVISORIES
// ============================================

export interface DependabotAlert {
    number: number;
    state: string;
    dependency: {
        package: string;
        ecosystem: string;
        manifestPath: string;
    };
    securityAdvisory: {
        ghsaId: string;
        severity: string;
        summary: string;
    };
    securityVulnerability: {
        severity: string;
        vulnerableVersionRange: string;
        firstPatchedVersion?: string;
    };
    createdAt: string;
    url: string;
}

/**
 * Get Dependabot alerts
 */
export async function getDependabotAlerts(
    state: 'open' | 'dismissed' | 'fixed' = 'open'
): Promise<DependabotAlert[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    try {
        const alerts = await octokit.paginate(octokit.rest.dependabot.listAlertsForRepo, {
            owner,
            repo,
            state,
            per_page: 100,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (alerts as any[]).map((alert) => ({
            number: alert.number,
            state: alert.state,
            dependency: {
                package: alert.dependency?.package?.name ?? 'unknown',
                ecosystem: alert.dependency?.package?.ecosystem ?? 'unknown',
                manifestPath: alert.dependency?.manifest_path ?? '',
            },
            securityAdvisory: {
                ghsaId: alert.security_advisory?.ghsa_id ?? '',
                severity: alert.security_advisory?.severity ?? 'unknown',
                summary: alert.security_advisory?.summary ?? '',
            },
            securityVulnerability: {
                severity: alert.security_vulnerability?.severity ?? 'unknown',
                vulnerableVersionRange: alert.security_vulnerability?.vulnerable_version_range ?? '',
                firstPatchedVersion: alert.security_vulnerability?.first_patched_version?.identifier,
            },
            createdAt: alert.created_at,
            url: alert.html_url,
        }));
    } catch (error) {
        if ((error as { status?: number }).status === 404) {
            return [];
        }
        throw error;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Wait for all checks to complete on a PR
 */
export async function waitForChecks(
    ref: string,
    options: { timeout?: number; pollInterval?: number } = {}
): Promise<{ passing: boolean; failed: string[] }> {
    const { timeout = 600000, pollInterval = 30000 } = options; // 10 min timeout, 30s poll

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const result = await areAllChecksPassing(ref);

        if (result.pending === 0) {
            return { passing: result.failed.length === 0, failed: result.failed };
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for checks on ${ref}`);
}

/**
 * Format alerts for AI analysis
 */
export function formatAlertsForAI(
    codeScanning: CodeScanningAlert[],
    dependabot: DependabotAlert[]
): string {
    const lines: string[] = [];

    if (codeScanning.length > 0) {
        lines.push('## Code Scanning Alerts');
        for (const alert of codeScanning) {
            lines.push(`- **${alert.rule.id}** (${alert.rule.severity}): ${alert.rule.description}`);
            if (alert.location) {
                lines.push(`  - Location: ${alert.location.path}:${alert.location.startLine}`);
            }
        }
        lines.push('');
    }

    if (dependabot.length > 0) {
        lines.push('## Dependabot Alerts');
        for (const alert of dependabot) {
            lines.push(`- **${alert.dependency.package}** (${alert.securityVulnerability.severity})`);
            lines.push(`  - ${alert.securityAdvisory.summary}`);
            if (alert.securityVulnerability.firstPatchedVersion) {
                lines.push(`  - Fix: Upgrade to ${alert.securityVulnerability.firstPatchedVersion}`);
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ============================================
// REVIEW THREADS (GraphQL)
// ============================================

export interface ReviewThread {
    id: string;
    isResolved: boolean;
    isOutdated: boolean;
    path: string;
    line: number | null;
    comments: Array<{
        id: string;
        body: string;
        author: string;
        createdAt: string;
    }>;
}

/**
 * Get all review threads on a PR via GraphQL
 */
export async function getPRReviewThreads(prNumber: number): Promise<ReviewThread[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $prNumber) {
                    reviewThreads(first: 100) {
                        nodes {
                            id
                            isResolved
                            isOutdated
                            path
                            line
                            comments(first: 10) {
                                nodes {
                                    id
                                    body
                                    author { login }
                                    createdAt
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    const result = await octokit.graphql<{
        repository: {
            pullRequest: {
                reviewThreads: {
                    nodes: Array<{
                        id: string;
                        isResolved: boolean;
                        isOutdated: boolean;
                        path: string;
                        line: number | null;
                        comments: {
                            nodes: Array<{
                                id: string;
                                body: string;
                                author: { login: string } | null;
                                createdAt: string;
                            }>;
                        };
                    }>;
                };
            };
        };
    }>(query, { owner, repo, prNumber });

    return result.repository.pullRequest.reviewThreads.nodes.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        path: thread.path,
        line: thread.line,
        comments: thread.comments.nodes.map((c) => ({
            id: c.id,
            body: c.body,
            author: c.author?.login ?? 'unknown',
            createdAt: c.createdAt,
        })),
    }));
}

/**
 * Resolve a review thread via GraphQL mutation
 */
export async function resolveReviewThread(threadId: string): Promise<boolean> {
    const octokit = getOctokit();

    try {
        const mutation = `
            mutation($threadId: ID!) {
                resolveReviewThread(input: { threadId: $threadId }) {
                    thread { isResolved }
                }
            }
        `;

        const result = await octokit.graphql<{
            resolveReviewThread: { thread: { isResolved: boolean } } | null;
        }>(mutation, { threadId });

        return result.resolveReviewThread?.thread?.isResolved ?? false;
    } catch (error) {
        // Some threads (like code scanning) can't be resolved manually
        return false;
    }
}

/**
 * Mark PR as ready for review (remove draft status)
 */
export async function markPRReadyForReview(prNumber: number): Promise<boolean> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    // First get the PR node ID
    const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $prNumber) {
                    id
                    isDraft
                }
            }
        }
    `;

    const prData = await octokit.graphql<{
        repository: {
            pullRequest: { id: string; isDraft: boolean };
        };
    }>(query, { owner, repo, prNumber });

    if (!prData.repository.pullRequest.isDraft) {
        return true; // Already ready for review
    }

    const mutation = `
        mutation($prId: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
                pullRequest { isDraft }
            }
        }
    `;

    const result = await octokit.graphql<{
        markPullRequestReadyForReview: {
            pullRequest: { isDraft: boolean };
        };
    }>(mutation, { prId: prData.repository.pullRequest.id });

    return !result.markPullRequestReadyForReview.pullRequest.isDraft;
}
