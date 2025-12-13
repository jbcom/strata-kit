/**
 * GitHub Project Sandbox
 *
 * Creates isolated copies of GitHub Projects for testing:
 * - Copies real projects with all items
 * - Duplicates issues for isolated testing
 * - Runs triage against the copy
 * - Verifies results
 * - Cleans up after tests
 *
 * This gives us REAL data structures, not synthetic mocks!
 */

import { getOctokit, getRepoContext } from '../octokit.js';

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

/**
 * GraphQL query to get project details
 */
const GET_PROJECT_QUERY = `
  query GetProject($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        id
        title
        number
        url
        items(first: 100) {
          nodes {
            id
            content {
              ... on Issue {
                id
                number
                title
                body
                labels(first: 10) {
                  nodes { name }
                }
              }
              ... on DraftIssue {
                id
                title
                body
              }
            }
          }
        }
      }
    }
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        title
        number
        url
        items(first: 100) {
          nodes {
            id
            content {
              ... on Issue {
                id
                number
                title
                body
                labels(first: 10) {
                  nodes { name }
                }
              }
              ... on DraftIssue {
                id
                title
                body
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL mutation to copy a project
 */
const COPY_PROJECT_MUTATION = `
  mutation CopyProject($projectId: ID!, $ownerId: ID!, $title: String!, $includeDrafts: Boolean!) {
    copyProjectV2(input: {
      projectId: $projectId
      ownerId: $ownerId
      title: $title
      includeDraftIssues: $includeDrafts
    }) {
      projectV2 {
        id
        number
        title
        url
      }
    }
  }
`;

/**
 * GraphQL mutation to delete a project
 */
const DELETE_PROJECT_MUTATION = `
  mutation DeleteProject($projectId: ID!) {
    deleteProjectV2(input: {
      projectId: $projectId
    }) {
      projectV2 {
        id
      }
    }
  }
`;

/**
 * GraphQL query to get owner node ID
 */
const GET_OWNER_ID_QUERY = `
  query GetOwnerId($login: String!) {
    user(login: $login) {
      id
    }
    organization(login: $login) {
      id
    }
  }
`;

/**
 * Create a sandbox copy of a GitHub Project
 */
export async function createProjectSandbox(
    options: ProjectSandboxOptions
): Promise<SandboxProject> {
    const octokit = getOctokit();
    const { owner: repoOwner } = getRepoContext();
    const owner = options.owner || repoOwner;
    const prefix = options.prefix || '[SANDBOX]';

    if (options.verbose) {
        console.log(`Creating sandbox for project ${options.sourceProject}...`);
    }

    // Get source project details
    const projectNumber = typeof options.sourceProject === 'number'
        ? options.sourceProject
        : parseInt(options.sourceProject, 10);

    const projectData = await octokit.graphql<{
        user?: { projectV2: ProjectData };
        organization?: { projectV2: ProjectData };
    }>(GET_PROJECT_QUERY, {
        owner,
        number: projectNumber,
    });

    const sourceProject = projectData.user?.projectV2 || projectData.organization?.projectV2;
    if (!sourceProject) {
        throw new Error(`Project ${options.sourceProject} not found for ${owner}`);
    }

    // Get owner node ID
    const ownerData = await octokit.graphql<{
        user?: { id: string };
        organization?: { id: string };
    }>(GET_OWNER_ID_QUERY, { login: owner });

    const ownerId = ownerData.user?.id || ownerData.organization?.id;
    if (!ownerId) {
        throw new Error(`Could not get owner ID for ${owner}`);
    }

    // Create sandbox title with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const sandboxTitle = `${prefix} ${sourceProject.title} - ${timestamp}`;

    if (options.verbose) {
        console.log(`Copying project to: ${sandboxTitle}`);
    }

    // Copy the project
    const copyResult = await octokit.graphql<{
        copyProjectV2: {
            projectV2: {
                id: string;
                number: number;
                title: string;
                url: string;
            };
        };
    }>(COPY_PROJECT_MUTATION, {
        projectId: sourceProject.id,
        ownerId,
        title: sandboxTitle,
        includeDrafts: options.includeDrafts ?? true,
    });

    const sandboxProject = copyResult.copyProjectV2.projectV2;

    if (options.verbose) {
        console.log(`✅ Sandbox created: ${sandboxProject.url}`);
    }

    // Build item mapping (would need another query to get sandbox items)
    const itemMapping = new Map<string, string>();

    return {
        sourceId: sourceProject.id,
        sandboxId: sandboxProject.id,
        sandboxNumber: sandboxProject.number,
        url: sandboxProject.url,
        title: sandboxProject.title,
        itemMapping,
        createdAt: new Date().toISOString(),
    };
}

/**
 * Copy a specific issue for isolated testing
 */
export async function copyIssueToSandbox(
    issueNumber: number,
    targetRepo?: { owner: string; repo: string }
): Promise<CopiedIssue> {
    const octokit = getOctokit();
    const { owner, repo } = targetRepo || getRepoContext();

    // Get original issue
    const { data: originalIssue } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
    });

    // Create copy with sandbox prefix
    const { data: sandboxIssue } = await octokit.rest.issues.create({
        owner,
        repo,
        title: `[SANDBOX] ${originalIssue.title}`,
        body: `> _Sandbox copy of #${issueNumber} for testing_\n\n---\n\n${originalIssue.body || ''}`,
        labels: ['sandbox', 'test'],
    });

    return {
        originalNumber: issueNumber,
        sandboxNumber: sandboxIssue.number,
        sandboxNodeId: sandboxIssue.node_id,
        url: sandboxIssue.html_url,
    };
}

/**
 * Delete a sandbox project
 */
export async function deleteProjectSandbox(
    sandbox: SandboxProject,
    options?: { verbose?: boolean }
): Promise<void> {
    const octokit = getOctokit();

    if (options?.verbose) {
        console.log(`Deleting sandbox project: ${sandbox.title}`);
    }

    try {
        await octokit.graphql(DELETE_PROJECT_MUTATION, {
            projectId: sandbox.sandboxId,
        });

        if (options?.verbose) {
            console.log(`✅ Sandbox deleted`);
        }
    } catch (error) {
        console.warn(`Could not delete sandbox: ${error}`);
    }
}

/**
 * Delete a sandbox issue
 */
export async function deleteSandboxIssue(
    sandboxIssue: CopiedIssue,
    targetRepo?: { owner: string; repo: string }
): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = targetRepo || getRepoContext();

    // Close the issue (can't delete via API, but can close)
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: sandboxIssue.sandboxNumber,
        state: 'closed',
        labels: ['sandbox', 'cleaned-up'],
    });

    // Add cleanup comment
    await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: sandboxIssue.sandboxNumber,
        body: '🧹 This sandbox issue has been cleaned up after testing.',
    });
}

/**
 * Run a function with an isolated project sandbox
 */
export async function withProjectSandbox<T>(
    options: ProjectSandboxOptions,
    fn: (sandbox: SandboxProject) => Promise<T>
): Promise<{ result: T; sandbox: SandboxProject }> {
    const sandbox = await createProjectSandbox(options);

    try {
        const result = await fn(sandbox);
        return { result, sandbox };
    } finally {
        if (options.autoCleanup !== false) {
            await deleteProjectSandbox(sandbox, { verbose: options.verbose });
        }
    }
}

/**
 * Run a function with an isolated issue copy
 */
export async function withIssueSandbox<T>(
    issueNumber: number,
    fn: (sandboxIssue: CopiedIssue) => Promise<T>,
    options?: { autoCleanup?: boolean; verbose?: boolean }
): Promise<{ result: T; sandboxIssue: CopiedIssue }> {
    const sandboxIssue = await copyIssueToSandbox(issueNumber);

    if (options?.verbose) {
        console.log(`✅ Sandbox issue created: ${sandboxIssue.url}`);
    }

    try {
        const result = await fn(sandboxIssue);
        return { result, sandboxIssue };
    } finally {
        if (options?.autoCleanup !== false) {
            await deleteSandboxIssue(sandboxIssue);
            if (options?.verbose) {
                console.log(`🧹 Sandbox issue cleaned up`);
            }
        }
    }
}

/**
 * Get all sandbox projects (for cleanup)
 */
export async function listSandboxProjects(
    owner?: string,
    prefix = '[SANDBOX]'
): Promise<Array<{ id: string; number: number; title: string; url: string }>> {
    const octokit = getOctokit();
    const { owner: repoOwner } = getRepoContext();
    const targetOwner = owner || repoOwner;

    const query = `
        query ListProjects($owner: String!) {
            user(login: $owner) {
                projectsV2(first: 100) {
                    nodes {
                        id
                        number
                        title
                        url
                    }
                }
            }
            organization(login: $owner) {
                projectsV2(first: 100) {
                    nodes {
                        id
                        number
                        title
                        url
                    }
                }
            }
        }
    `;

    const data = await octokit.graphql<{
        user?: { projectsV2: { nodes: ProjectNode[] } };
        organization?: { projectsV2: { nodes: ProjectNode[] } };
    }>(query, { owner: targetOwner });

    const projects = data.user?.projectsV2.nodes || data.organization?.projectsV2.nodes || [];

    return projects.filter((p) => p.title.startsWith(prefix));
}

/**
 * Clean up all sandbox projects
 */
export async function cleanupAllSandboxes(
    owner?: string,
    options?: { prefix?: string; verbose?: boolean; dryRun?: boolean }
): Promise<number> {
    const sandboxes = await listSandboxProjects(owner, options?.prefix);

    if (options?.verbose) {
        console.log(`Found ${sandboxes.length} sandbox projects`);
    }

    if (options?.dryRun) {
        for (const sandbox of sandboxes) {
            console.log(`Would delete: ${sandbox.title}`);
        }
        return sandboxes.length;
    }

    const octokit = getOctokit();
    let deleted = 0;

    for (const sandbox of sandboxes) {
        try {
            await octokit.graphql(DELETE_PROJECT_MUTATION, {
                projectId: sandbox.id,
            });
            deleted++;

            if (options?.verbose) {
                console.log(`Deleted: ${sandbox.title}`);
            }
        } catch (error) {
            console.warn(`Could not delete ${sandbox.title}: ${error}`);
        }
    }

    return deleted;
}

// Type helpers
interface ProjectData {
    id: string;
    title: string;
    number: number;
    url: string;
    items: {
        nodes: Array<{
            id: string;
            content: unknown;
        }>;
    };
}

interface ProjectNode {
    id: string;
    number: number;
    title: string;
    url: string;
}
