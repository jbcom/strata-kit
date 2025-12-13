/**
 * GitHub Project Sandbox
 *
 * Creates isolated copies of GitHub Projects for testing.
 *
 * NOTE: These operations require GitHub GraphQL API access which is
 * not available via GitHub MCP. Use runAgenticTask() or direct Octokit
 * for these operations.
 */

import { getRepoContext } from '../octokit.js';

export interface ProjectSandboxOptions {
    /** Source project ID or number to copy */
    sourceProject: string | number;
    /** Owner (org/user) for the sandbox project */
    owner?: string;
    /** Prefix for sandbox project names */
    prefix?: string;
    /** Include draft issues in copy */
    includeDrafts?: boolean;
    /** Auto-cleanup after test */
    autoCleanup?: boolean;
    /** Verbose logging */
    verbose?: boolean;
}

export interface SandboxProject {
    /** Original project ID */
    sourceId: string;
    /** Copied project ID */
    sandboxId: string;
    /** Copied project number */
    sandboxNumber: number;
    /** Copied project URL */
    url: string;
    /** Copied project title */
    title: string;
    /** Mapping of original item IDs to sandbox item IDs */
    itemMapping: Map<string, string>;
    /** When the sandbox was created */
    createdAt: string;
}

export interface CopiedIssue {
    /** Original issue number */
    originalNumber: number;
    /** Sandbox issue number */
    sandboxNumber: number;
    /** Sandbox issue node ID */
    sandboxNodeId: string;
    /** Sandbox issue URL */
    url: string;
}

const MCP_UNAVAILABLE_MSG =
    'GitHub Project operations require GraphQL API access which is not available via MCP. ' +
    'Use runAgenticTask() with extended capabilities or configure Octokit directly.';

/**
 * Create a sandbox copy of a GitHub Project
 *
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function createProjectSandbox(
    options: ProjectSandboxOptions
): Promise<SandboxProject> {
    const { owner } = getRepoContext();
    console.log(`Would create sandbox for project ${options.sourceProject} in ${options.owner || owner}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Copy a specific issue for isolated testing
 *
 * @throws Error - GitHub issue copying not available via MCP
 */
export async function copyIssueToSandbox(
    issueNumber: number,
    targetRepo?: { owner: string; repo: string }
): Promise<CopiedIssue> {
    const { owner, repo } = targetRepo || getRepoContext();
    console.log(`Would copy issue #${issueNumber} to ${owner}/${repo}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Add an issue to a project board
 *
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function addIssueToProject(
    projectId: string,
    issueNodeId: string
): Promise<string> {
    console.log(`Would add issue ${issueNodeId} to project ${projectId}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Run tests against a sandbox project
 *
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function runSandboxTest(
    sandbox: SandboxProject,
    testFn: (sandbox: SandboxProject) => Promise<void>
): Promise<{ success: boolean; error?: Error }> {
    console.log(`Would run test against sandbox ${sandbox.sandboxId}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Clean up (delete) a sandbox project
 *
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function cleanupSandbox(sandbox: SandboxProject): Promise<void> {
    console.log(`Would delete sandbox project ${sandbox.sandboxId}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Create a complete test environment
 *
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function createTestEnvironment(
    projectNumber: number,
    issueNumbers: number[]
): Promise<{
    sandbox: SandboxProject;
    issues: CopiedIssue[];
    cleanup: () => Promise<void>;
}> {
    console.log(`Would create test environment for project ${projectNumber} with issues ${issueNumbers.join(', ')}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Delete a project sandbox
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function deleteProjectSandbox(
    sandbox: SandboxProject,
    options?: { verbose?: boolean }
): Promise<void> {
    console.log(`Would delete project ${sandbox.sandboxId}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Delete a sandbox issue
 * @throws Error - GitHub issue deletion not available via MCP
 */
export async function deleteSandboxIssue(issue: CopiedIssue): Promise<void> {
    console.log(`Would delete issue ${issue.sandboxNodeId}`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Execute a function within a project sandbox context
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function withProjectSandbox<T>(
    options: ProjectSandboxOptions,
    fn: (sandbox: SandboxProject) => Promise<T>
): Promise<T> {
    console.log(`Would create sandbox and execute function`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Execute a function within an issue sandbox context
 * @throws Error - GitHub issue sandbox not available via MCP
 */
export async function withIssueSandbox<T>(
    issueNumber: number,
    fn: (issue: CopiedIssue) => Promise<T>
): Promise<T> {
    console.log(`Would create issue sandbox and execute function`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * List all active sandbox projects
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function listSandboxProjects(): Promise<SandboxProject[]> {
    console.log(`Would list sandbox projects`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}

/**
 * Clean up all sandbox projects
 * @throws Error - GitHub Projects GraphQL not available via MCP
 */
export async function cleanupAllSandboxes(
    _prefix?: string,
    _options?: { verbose?: boolean; dryRun?: boolean }
): Promise<number> {
    console.log(`Would clean up all sandbox projects`);
    throw new Error(MCP_UNAVAILABLE_MSG);
}
