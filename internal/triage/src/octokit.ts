/**
 * GitHub Operations via MCP
 *
 * All GitHub operations using GitHub MCP - no HTTP/fetch from this process.
 * The MCP server handles HTTP to GitHub API via subprocess communication.
 *
 * This module provides:
 * - Singleton GitHub MCP client management
 * - Convenience wrappers around MCP tool calls
 * - Repository context from git/environment
 */

import { execSync } from 'node:child_process';
import { createGitHubClient, createGraphQLClient, type MCPClient } from './mcp.js';

// Singleton MCP clients
let _githubClient: MCPClient | null = null;
let _clientPromise: Promise<MCPClient> | null = null;
let _graphqlClient: MCPClient | null = null;
let _graphqlPromise: Promise<MCPClient> | null = null;

/**
 * Get or create the singleton GitHub MCP client
 */
export async function getGitHubMCPClient(): Promise<MCPClient> {
    if (_githubClient) return _githubClient;

    if (!_clientPromise) {
        _clientPromise = createGitHubClient().then((client) => {
            _githubClient = client;
            return client;
        });
    }

    return _clientPromise;
}

/**
 * Close the GitHub MCP client (call on shutdown)
 */
export async function closeGitHubClient(): Promise<void> {
    if (_githubClient) {
        await _githubClient.close();
        _githubClient = null;
        _clientPromise = null;
    }
}

/**
 * Get or create the singleton GraphQL MCP client
 */
export async function getGraphQLMCPClient(): Promise<MCPClient> {
    if (_graphqlClient) return _graphqlClient;

    if (!_graphqlPromise) {
        _graphqlPromise = createGraphQLClient().then((client) => {
            _graphqlClient = client;
            return client;
        });
    }

    return _graphqlPromise;
}

/**
 * Close the GraphQL MCP client (call on shutdown)
 */
export async function closeGraphQLClient(): Promise<void> {
    if (_graphqlClient) {
        await _graphqlClient.close();
        _graphqlClient = null;
        _graphqlPromise = null;
    }
}

/**
 * Close all MCP clients (call on shutdown)
 */
export async function closeAllClients(): Promise<void> {
    await Promise.all([closeGitHubClient(), closeGraphQLClient()]);
}

/**
 * Execute a GraphQL query/mutation via MCP
 *
 * @param query - The GraphQL query or mutation string
 * @param variables - Variables for the query
 * @returns The query result data
 */
export async function executeGraphQL<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
): Promise<T> {
    const client = await getGraphQLMCPClient();
    const tools = await client.tools();

    // mcp-graphql exposes a 'graphql' tool for executing queries
    const tool = tools['graphql'] || tools['execute'] || tools['query'];
    if (!tool) {
        throw new Error('GraphQL MCP tool not found. Available tools: ' + Object.keys(tools).join(', '));
    }

    if (typeof tool.execute === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (tool.execute as any)({ query, variables });
        if (result.errors && result.errors.length > 0) {
            throw new Error(`GraphQL error: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
        }
        return result.data as T;
    }

    throw new Error('GraphQL MCP tool is not executable');
}

/**
 * Call a GitHub MCP tool
 */
async function callGitHubTool(
    toolName: string,
    args: Record<string, unknown>
): Promise<unknown> {
    const client = await getGitHubMCPClient();
    const tools = await client.tools();

    const tool = tools[toolName];
    if (!tool) {
        throw new Error(`GitHub MCP tool '${toolName}' not found`);
    }

    // Call the tool's execute function
    // Use type assertion since MCP tools have different signatures
    if (typeof tool.execute === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (tool.execute as any)(args);
    }

    throw new Error(`GitHub MCP tool '${toolName}' is not executable`);
}

/**
 * Get repository context from environment or git
 * This does NOT require MCP - uses local git commands
 */
export function getRepoContext(): { owner: string; repo: string } {
    // First try environment variable (CI environments)
    const repository = process.env.GITHUB_REPOSITORY;
    if (repository) {
        const [owner, repo] = repository.split('/');
        return { owner, repo };
    }

    // Fall back to git remote
    try {
        const remote = execSync('git remote get-url origin', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        // Parse GitHub URL formats:
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git
        const httpsMatch = remote.match(/github\.com\/([^/]+)\/([^/.]+)/);
        const sshMatch = remote.match(/github\.com:([^/]+)\/([^/.]+)/);

        const match = httpsMatch || sshMatch;
        if (match) {
            return { owner: match[1], repo: match[2] };
        }
    } catch {
        // Git command failed
    }

    throw new Error(
        'Could not determine repository context. Set GITHUB_REPOSITORY or ensure git remote is configured.'
    );
}

// Re-export for compatibility
export function getOctokit(): never {
    throw new Error(
        'Octokit is deprecated. Use GitHub MCP functions instead:\n' +
            '- getGitHubMCPClient() for direct MCP access\n' +
            '- callGitHubTool() for tool invocation\n' +
            '- Or use runAgenticTask() from mcp.ts for AI-driven operations'
    );
}

// ============================================
// HIGH-LEVEL GITHUB MCP WRAPPERS
// ============================================

/**
 * Get issue details via MCP
 */
export async function getIssue(
    issueNumber: number
): Promise<{
    number: number;
    title: string;
    body: string;
    state: string;
    labels: string[];
}> {
    const { owner, repo } = getRepoContext();
    const result = (await callGitHubTool('get_issue', {
        owner,
        repo,
        issue_number: issueNumber,
    })) as {
        number: number;
        title: string;
        body: string;
        state: string;
        labels?: Array<{ name: string }>;
    };

    return {
        number: result.number,
        title: result.title,
        body: result.body || '',
        state: result.state,
        labels: result.labels?.map((l) => l.name) || [],
    };
}

/**
 * Create a comment on an issue via MCP
 */
export async function createIssueComment(
    issueNumber: number,
    body: string
): Promise<void> {
    const { owner, repo } = getRepoContext();
    await callGitHubTool('create_issue_comment', {
        owner,
        repo,
        issue_number: issueNumber,
        body,
    });
}

/**
 * Update an issue via MCP
 */
export async function updateIssue(
    issueNumber: number,
    updates: {
        title?: string;
        body?: string;
        state?: 'open' | 'closed';
        labels?: string[];
        assignees?: string[];
    }
): Promise<void> {
    const { owner, repo } = getRepoContext();
    await callGitHubTool('update_issue', {
        owner,
        repo,
        issue_number: issueNumber,
        ...updates,
    });
}

/**
 * Search issues via MCP
 */
export async function searchIssues(
    query: string
): Promise<
    Array<{
        number: number;
        title: string;
        state: string;
        labels: string[];
    }>
> {
    const { owner, repo } = getRepoContext();
    const fullQuery = `repo:${owner}/${repo} ${query}`;

    const result = (await callGitHubTool('search_issues', {
        query: fullQuery,
    })) as {
        items?: Array<{
            number: number;
            title: string;
            state: string;
            labels?: Array<{ name: string }>;
        }>;
    };

    return (result.items || []).map((item) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        labels: item.labels?.map((l) => l.name) || [],
    }));
}

/**
 * Get pull request details via MCP
 */
export async function getPullRequest(prNumber: number): Promise<{
    number: number;
    title: string;
    body: string;
    state: string;
    head: { ref: string; sha: string };
    base: { ref: string };
    draft: boolean;
    mergeable: boolean | null;
}> {
    const { owner, repo } = getRepoContext();
    const result = (await callGitHubTool('get_pull_request', {
        owner,
        repo,
        pull_number: prNumber,
    })) as {
        number: number;
        title: string;
        body: string;
        state: string;
        head: { ref: string; sha: string };
        base: { ref: string };
        draft: boolean;
        mergeable: boolean | null;
    };

    return result;
}

/**
 * List commits on a branch via MCP
 */
export async function listCommits(
    branch: string,
    options: { per_page?: number } = {}
): Promise<
    Array<{
        sha: string;
        message: string;
        author: string;
    }>
> {
    const { owner, repo } = getRepoContext();
    const result = (await callGitHubTool('list_commits', {
        owner,
        repo,
        sha: branch,
        per_page: options.per_page || 30,
    })) as Array<{
        sha: string;
        commit: { message: string };
        author?: { login: string };
    }>;

    return result.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.author?.login || 'unknown',
    }));
}

/**
 * Get file contents via MCP
 */
export async function getFileContents(
    path: string,
    options: { ref?: string } = {}
): Promise<string> {
    const { owner, repo } = getRepoContext();
    const result = (await callGitHubTool('get_file_contents', {
        owner,
        repo,
        path,
        ref: options.ref,
    })) as { content?: string; encoding?: string };

    if (result.content && result.encoding === 'base64') {
        return Buffer.from(result.content, 'base64').toString('utf-8');
    }

    return result.content || '';
}

// ============================================
// LEGACY COMPATIBILITY - Async Versions
// ============================================

// These maintain the same signatures but are async and use MCP

export interface ReviewComment {
    id: number;
    nodeId: string;
    body: string;
    path: string;
    line?: number;
    user: string;
    createdAt: string;
    state?: string;
}

export interface CheckRun {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    startedAt: string;
    completedAt: string | null;
    url: string;
}

export interface CodeScanningAlert {
    number: number;
    rule: { id: string; name?: string; severity: string; description: string };
    state: string;
    tool: string;
    createdAt: string;
    url: string;
    location?: { path: string; startLine: number; endLine: number };
}

export interface DependabotAlert {
    number: number;
    state: string;
    dependency: { package: string; ecosystem: string; manifestPath: string };
    securityAdvisory: { ghsaId: string; severity: string; summary: string };
    securityVulnerability: {
        severity: string;
        vulnerableVersionRange: string;
        firstPatchedVersion?: string;
    };
    createdAt: string;
    url: string;
}

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

// ============================================
// GRAPHQL OPERATIONS (via mcp-graphql)
// ============================================

/**
 * Get the node ID for a pull request (needed for GraphQL mutations)
 */
async function getPRNodeId(prNumber: number): Promise<string> {
    const { owner, repo } = getRepoContext();
    const query = `
        query GetPRNodeId($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                    id
                }
            }
        }
    `;
    const result = await executeGraphQL<{
        repository: { pullRequest: { id: string } };
    }>(query, { owner, repo, number: prNumber });
    return result.repository.pullRequest.id;
}

/**
 * Convert a PR to draft status
 */
export async function convertPRToDraft(prNumber: number): Promise<void> {
    const pullRequestId = await getPRNodeId(prNumber);
    const mutation = `
        mutation ConvertToDraft($pullRequestId: ID!) {
            convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
                pullRequest {
                    isDraft
                }
            }
        }
    `;
    await executeGraphQL(mutation, { pullRequestId });
}

/**
 * Enable auto-merge on a PR
 */
export async function enableAutoMerge(
    prNumber: number,
    mergeMethod: 'MERGE' | 'SQUASH' | 'REBASE' = 'SQUASH'
): Promise<void> {
    const pullRequestId = await getPRNodeId(prNumber);
    const mutation = `
        mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
            enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
                pullRequest {
                    autoMergeRequest {
                        enabledAt
                    }
                }
            }
        }
    `;
    await executeGraphQL(mutation, { pullRequestId, mergeMethod });
}

/**
 * Disable auto-merge on a PR
 */
export async function disableAutoMerge(prNumber: number): Promise<void> {
    const pullRequestId = await getPRNodeId(prNumber);
    const mutation = `
        mutation DisableAutoMerge($pullRequestId: ID!) {
            disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {
                pullRequest {
                    autoMergeRequest {
                        enabledAt
                    }
                }
            }
        }
    `;
    await executeGraphQL(mutation, { pullRequestId });
}

/**
 * Get review comments on a PR
 */
export async function getPRReviewComments(
    prNumber: number
): Promise<ReviewComment[]> {
    const { owner, repo } = getRepoContext();
    const query = `
        query GetReviewComments($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                    reviewThreads(first: 100) {
                        nodes {
                            path
                            line
                            comments(first: 50) {
                                nodes {
                                    id
                                    databaseId
                                    body
                                    author {
                                        login
                                    }
                                    createdAt
                                    state
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    const result = await executeGraphQL<{
        repository: {
            pullRequest: {
                reviewThreads: {
                    nodes: Array<{
                        path: string;
                        line: number | null;
                        comments: {
                            nodes: Array<{
                                id: string;
                                databaseId: number;
                                body: string;
                                author: { login: string } | null;
                                createdAt: string;
                                state: string;
                            }>;
                        };
                    }>;
                };
            };
        };
    }>(query, { owner, repo, number: prNumber });

    const comments: ReviewComment[] = [];
    for (const thread of result.repository.pullRequest.reviewThreads.nodes) {
        for (const c of thread.comments.nodes) {
            comments.push({
                id: c.databaseId,
                nodeId: c.id,
                body: c.body,
                path: thread.path,
                line: thread.line ?? undefined,
                user: c.author?.login || 'unknown',
                createdAt: c.createdAt,
                state: c.state,
            });
        }
    }
    return comments;
}

/**
 * Get reviews on a PR
 */
export async function getPRReviews(prNumber: number): Promise<
    Array<{
        id: number;
        user: string;
        state: string;
        body: string;
        submittedAt: string;
    }>
> {
    const { owner, repo } = getRepoContext();
    const query = `
        query GetReviews($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                    reviews(first: 100) {
                        nodes {
                            databaseId
                            author {
                                login
                            }
                            state
                            body
                            submittedAt
                        }
                    }
                }
            }
        }
    `;
    const result = await executeGraphQL<{
        repository: {
            pullRequest: {
                reviews: {
                    nodes: Array<{
                        databaseId: number;
                        author: { login: string } | null;
                        state: string;
                        body: string;
                        submittedAt: string;
                    }>;
                };
            };
        };
    }>(query, { owner, repo, number: prNumber });

    return result.repository.pullRequest.reviews.nodes.map((r) => ({
        id: r.databaseId,
        user: r.author?.login || 'unknown',
        state: r.state,
        body: r.body || '',
        submittedAt: r.submittedAt,
    }));
}

/**
 * Reply to a review comment
 *
 * @param prNumber - The PR number
 * @param commentNodeId - The GraphQL node ID of the comment to reply to (from ReviewComment.nodeId)
 * @param body - The reply body
 */
export async function replyToReviewComment(
    prNumber: number,
    commentNodeId: string,
    body: string
): Promise<void> {
    const pullRequestId = await getPRNodeId(prNumber);
    const mutation = `
        mutation ReplyToComment($pullRequestId: ID!, $body: String!, $inReplyTo: ID!) {
            addPullRequestReviewComment(input: {
                pullRequestId: $pullRequestId,
                body: $body,
                inReplyTo: $inReplyTo
            }) {
                comment {
                    id
                }
            }
        }
    `;
    await executeGraphQL(mutation, {
        pullRequestId,
        body,
        inReplyTo: commentNodeId,
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
    const pullRequestId = await getPRNodeId(prNumber);
    const mutation = `
        mutation SubmitReview($pullRequestId: ID!, $event: PullRequestReviewEvent!, $body: String!) {
            addPullRequestReview(input: {
                pullRequestId: $pullRequestId,
                event: $event,
                body: $body
            }) {
                pullRequestReview {
                    id
                    state
                }
            }
        }
    `;
    await executeGraphQL(mutation, { pullRequestId, event, body });
}

/**
 * Get check runs for a ref
 */
export async function getCheckRuns(ref: string): Promise<CheckRun[]> {
    const { owner, repo } = getRepoContext();
    const query = `
        query GetCheckRuns($owner: String!, $repo: String!, $ref: String!) {
            repository(owner: $owner, name: $repo) {
                object(expression: $ref) {
                    ... on Commit {
                        checkSuites(first: 20) {
                            nodes {
                                checkRuns(first: 50) {
                                    nodes {
                                        databaseId
                                        name
                                        status
                                        conclusion
                                        startedAt
                                        completedAt
                                        detailsUrl
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    const result = await executeGraphQL<{
        repository: {
            object: {
                checkSuites: {
                    nodes: Array<{
                        checkRuns: {
                            nodes: Array<{
                                databaseId: number;
                                name: string;
                                status: string;
                                conclusion: string | null;
                                startedAt: string;
                                completedAt: string | null;
                                detailsUrl: string;
                            }>;
                        };
                    }>;
                };
            };
        };
    }>(query, { owner, repo, ref });

    const checkRuns: CheckRun[] = [];
    for (const suite of result.repository.object?.checkSuites?.nodes || []) {
        for (const run of suite.checkRuns.nodes) {
            checkRuns.push({
                id: run.databaseId,
                name: run.name,
                status: run.status,
                conclusion: run.conclusion,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                url: run.detailsUrl,
            });
        }
    }
    return checkRuns;
}

/**
 * Check if all checks are passing for a ref
 */
export async function areAllChecksPassing(ref: string): Promise<{
    passing: boolean;
    pending: number;
    failed: string[];
}> {
    const checks = await getCheckRuns(ref);

    const pending = checks.filter((c) => c.status !== 'COMPLETED').length;

    const failed = checks
        .filter(
            (c) =>
                c.conclusion === 'FAILURE' ||
                c.conclusion === 'TIMED_OUT' ||
                c.conclusion === 'CANCELLED'
        )
        .map((c) => c.name);

    const passing = failed.length === 0 && pending === 0;

    return { passing, pending, failed };
}

export async function createCheckRun(
    _name: string,
    _headSha: string,
    _options?: {
        status?: 'queued' | 'in_progress' | 'completed';
        conclusion?:
            | 'success'
            | 'failure'
            | 'neutral'
            | 'cancelled'
            | 'skipped'
            | 'timed_out'
            | 'action_required';
        title?: string;
        summary?: string;
        text?: string;
    }
): Promise<number> {
    throw new Error(
        'createCheckRun not yet available via MCP. Use runAgenticTask.'
    );
}

export async function getCodeScanningAlerts(
    _state?: 'open' | 'dismissed' | 'fixed'
): Promise<CodeScanningAlert[]> {
    throw new Error(
        'getCodeScanningAlerts not yet available via MCP. Use runAgenticTask.'
    );
}

export async function getPRCodeScanningAlerts(
    _prNumber: number
): Promise<CodeScanningAlert[]> {
    throw new Error(
        'getPRCodeScanningAlerts not yet available via MCP. Use runAgenticTask.'
    );
}

export async function getDependabotAlerts(
    _state?: 'open' | 'dismissed' | 'fixed'
): Promise<DependabotAlert[]> {
    throw new Error(
        'getDependabotAlerts not yet available via MCP. Use runAgenticTask.'
    );
}

/**
 * Wait for checks to complete and return status
 */
export async function waitForChecks(
    ref: string,
    options?: { timeout?: number; pollInterval?: number }
): Promise<{ passing: boolean; failed: string[] }> {
    const timeout = options?.timeout || 300000; // 5 minutes default
    const pollInterval = options?.pollInterval || 10000; // 10 seconds default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const status = await areAllChecksPassing(ref);

        if (status.pending === 0) {
            return { passing: status.passing, failed: status.failed };
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout - return current status
    const finalStatus = await areAllChecksPassing(ref);
    return { passing: false, failed: [...finalStatus.failed, 'TIMEOUT'] };
}

export function formatAlertsForAI(
    codeScanning: CodeScanningAlert[],
    dependabot: DependabotAlert[]
): string {
    const lines: string[] = [];

    if (codeScanning.length > 0) {
        lines.push('## Code Scanning Alerts');
        for (const alert of codeScanning) {
            lines.push(
                `- **${alert.rule.id}** (${alert.rule.severity}): ${alert.rule.description}`
            );
            if (alert.location) {
                lines.push(
                    `  - Location: ${alert.location.path}:${alert.location.startLine}`
                );
            }
        }
        lines.push('');
    }

    if (dependabot.length > 0) {
        lines.push('## Dependabot Alerts');
        for (const alert of dependabot) {
            lines.push(
                `- **${alert.dependency.package}** (${alert.securityVulnerability.severity})`
            );
            lines.push(`  - ${alert.securityAdvisory.summary}`);
            if (alert.securityVulnerability.firstPatchedVersion) {
                lines.push(
                    `  - Fix: Upgrade to ${alert.securityVulnerability.firstPatchedVersion}`
                );
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Get review threads on a PR
 */
export async function getPRReviewThreads(
    prNumber: number
): Promise<ReviewThread[]> {
    const { owner, repo } = getRepoContext();
    const query = `
        query GetReviewThreads($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $number) {
                    reviewThreads(first: 100) {
                        nodes {
                            id
                            isResolved
                            isOutdated
                            path
                            line
                            comments(first: 50) {
                                nodes {
                                    id
                                    body
                                    author {
                                        login
                                    }
                                    createdAt
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    const result = await executeGraphQL<{
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
    }>(query, { owner, repo, number: prNumber });

    return result.repository.pullRequest.reviewThreads.nodes.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        path: thread.path,
        line: thread.line,
        comments: thread.comments.nodes.map((c) => ({
            id: c.id,
            body: c.body,
            author: c.author?.login || 'unknown',
            createdAt: c.createdAt,
        })),
    }));
}

/**
 * Resolve a review thread
 */
export async function resolveReviewThread(threadId: string): Promise<boolean> {
    const mutation = `
        mutation ResolveThread($threadId: ID!) {
            resolveReviewThread(input: { threadId: $threadId }) {
                thread {
                    isResolved
                }
            }
        }
    `;
    const result = await executeGraphQL<{
        resolveReviewThread: { thread: { isResolved: boolean } };
    }>(mutation, { threadId });
    return result.resolveReviewThread.thread.isResolved;
}

/**
 * Mark a draft PR as ready for review
 */
export async function markPRReadyForReview(prNumber: number): Promise<boolean> {
    const pullRequestId = await getPRNodeId(prNumber);
    const mutation = `
        mutation MarkReadyForReview($pullRequestId: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
                pullRequest {
                    isDraft
                }
            }
        }
    `;
    const result = await executeGraphQL<{
        markPullRequestReadyForReview: { pullRequest: { isDraft: boolean } };
    }>(mutation, { pullRequestId });
    return !result.markPullRequestReadyForReview.pullRequest.isDraft;
}
