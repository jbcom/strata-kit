/**
 * Develop Command
 *
 * AI-powered development using Ollama + Vercel AI SDK with MCP tools:
 *
 * - **Filesystem MCP**: Read existing code, write changes
 * - **Context7 MCP**: Look up library documentation for correct API usage
 *
 * The AI uses tools to explore the codebase and make targeted changes.
 */

import pc from 'picocolors';
import { execFileSync } from 'node:child_process';
import { getIssue, commentOnIssue } from '../github.js';
import { runAgenticTask } from '../mcp.js';

/**
 * System prompt for development
 *
 * Key principles:
 * 1. Explore before coding - understand the codebase
 * 2. Use Context7 for library docs - don't guess APIs
 * 3. Make minimal, focused changes
 */
const SYSTEM_PROMPT = `You are an expert TypeScript developer working on Strata, a procedural 3D graphics library for React Three Fiber.

## Your Tools

### File Tools (USE THESE!)
- **read_file**: Read file contents - ALWAYS do this before modifying a file
- **write_file**: Write content to create or update files
- **list_files**: Explore directory structure
- **search_files**: Find files matching a pattern

### Documentation Tools (PREVENTS HALLUCINATIONS!)
- **resolve-library-id**: Find Context7 ID for a library (e.g., "three.js" → "/mrdoob/three.js")
- **get-library-docs**: Get up-to-date documentation for correct API usage

## Workflow

1. **Understand the issue** - Read the requirements carefully
2. **Explore the codebase** - Use list_files and search_files to find relevant code
3. **Read existing code** - ALWAYS read files before modifying them
4. **Check documentation** - If using a library API, verify with Context7 first
5. **Make minimal changes** - Focus on what's needed, don't over-engineer
6. **Write the code** - Use write_file to save your changes

## Code Standards

- TypeScript strict mode - no \`any\` types
- React functional components only
- forwardRef when exposing refs
- useEffect must have cleanup functions
- Three.js: dispose geometries/materials
- JSDoc comments for public APIs
- Handle edge cases (division by zero, null checks)

## Important

- **Read before writing** - ALWAYS use read_file to see existing code first
- **Check the docs** - If unsure about an API, look it up with Context7
- **Minimal changes** - Don't refactor unrelated code
- **Explain your work** - End with a summary of what you did`;

export interface DevelopOptions {
    dryRun?: boolean;
    verbose?: boolean;
    maxSteps?: number;
}

export async function develop(issueNumber: number, options: DevelopOptions = {}): Promise<void> {
    const { dryRun = false, verbose = false, maxSteps = 25 } = options;

    console.log(pc.blue(`🔧 Developing for issue #${issueNumber}...`));

    // Get issue details
    const issue = getIssue(issueNumber);

    console.log(pc.dim(`Title: ${issue.title}`));
    if (verbose && issue.body) {
        console.log(pc.dim(`Description: ${issue.body.slice(0, 200)}...`));
    }

    // Get working directory
    const workingDirectory = process.cwd();
    console.log(pc.dim(`Working directory: ${workingDirectory}`));

    // Build prompt
    const userPrompt = `# Development Task

## GitHub Issue #${issueNumber}
**Title:** ${issue.title}

**Description:**
${issue.body || '(no description provided)'}

---

## Your Task

1. First, explore the codebase to understand its structure
2. Find the relevant files for this issue
3. Read the existing code before making changes
4. If using library APIs, check the documentation with Context7
5. Implement the necessary changes
6. Summarize what you did

START DEVELOPING:`;

    if (dryRun) {
        console.log(pc.yellow('\n[Dry run] Would execute AI with:'));
        console.log(pc.dim('Max steps: ' + maxSteps));
        console.log(pc.dim('MCPs: filesystem, context7'));
        console.log(pc.dim('\nPrompt preview:'));
        console.log(userPrompt.slice(0, 500) + '...');
        return;
    }

    console.log(pc.blue('\nStarting AI-powered development...'));
    if (verbose) {
        console.log(pc.dim('Using: Filesystem MCP (read/write), Context7 MCP (docs)'));
    }

    try {
        const result = await runAgenticTask({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            mcpClients: {
                filesystem: workingDirectory,
                context7: true,  // Enable documentation lookup
            },
            maxSteps,
            onToolCall: verbose ? (toolName, args) => {
                const argsStr = JSON.stringify(args);
                const truncatedArgs = argsStr.length > 60 ? argsStr.slice(0, 60) + '...' : argsStr;
                console.log(pc.dim(`  → ${toolName}(${truncatedArgs})`));
            } : undefined,
        });

        console.log('\n' + pc.green('═══ Development Summary ═══'));
        console.log(result.text);

        if (verbose) {
            console.log(pc.dim(`\nSteps: ${result.steps.length}, Tool calls: ${result.toolCallCount}`));
        }

        // Check if any files were modified (look for write_file calls)
        const writeOperations = result.steps.flatMap((step: unknown) => {
            const s = step as { toolCalls?: Array<{ toolName: string }> };
            return s.toolCalls?.filter(tc => tc.toolName === 'write_file') || [];
        });

        if (writeOperations.length > 0) {
            console.log(pc.green(`\n✅ Modified ${writeOperations.length} file(s)`));

            // Stage and commit changes
            console.log(pc.blue('\nStaging changes...'));
            execFileSync('git', ['add', '-A'], { cwd: workingDirectory });

            const status = execFileSync('git', ['status', '--short'], {
                cwd: workingDirectory,
                encoding: 'utf-8',
            });

            if (status.trim()) {
                console.log(pc.dim(status));

                // Commit
                const commitMessage = `feat: implement #${issueNumber} - ${issue.title}

AI-generated implementation for issue #${issueNumber}.

Generated by @strata/triage`;

                execFileSync('git', ['commit', '-m', commitMessage], {
                    cwd: workingDirectory,
                });

                console.log(pc.green('✅ Changes committed'));
            } else {
                console.log(pc.yellow('No changes to commit'));
            }
        } else {
            console.log(pc.yellow('\nNo files were modified'));
        }

        // Comment on issue
        const summary = result.text.length > 1500
            ? result.text.slice(0, 1500) + '...'
            : result.text;

        commentOnIssue(issueNumber, `## 🤖 AI Development Progress

${summary}

---
<sub>Generated by @strata/triage • ${result.toolCallCount} tool calls</sub>`);

        console.log(pc.green('\n✅ Done!'));

    } catch (error) {
        console.error(pc.red('\n❌ Development failed:'));
        if (error instanceof Error) {
            console.error(pc.red(error.message));
            if (verbose && error.stack) {
                console.error(pc.dim(error.stack));
            }
        }
        throw error;
    }
}
