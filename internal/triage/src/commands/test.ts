import pc from 'picocolors';
import { execFileSync } from 'node:child_process';
import { getIssue, getPullRequest, commentOnIssue, commentOnPR } from '../github.js';
import { generateWithTools } from '../ai.js';
import { createInlineFilesystemClient, type MCPClient } from '../mcp.js';
import { createPlaywrightClient, getPlaywrightTools } from '../playwright.js';

const SYSTEM_PROMPT = `You are an expert test engineer for Strata, a procedural 3D graphics library for React Three Fiber.

Your task is to generate comprehensive tests based on the GitHub issue or PR provided. You have access to:

**Filesystem Tools:**
- read_file: Read existing code to understand what to test
- write_file: Write test files
- list_files: Explore the codebase
- search_files: Find related test files

**Playwright Tools (for E2E tests):**
- browser_navigate: Navigate to a URL
- browser_click: Click elements
- browser_type: Type text
- browser_snapshot: Get page accessibility snapshot
- browser_verify_element_visible: Assert element visibility
- browser_verify_text_visible: Assert text is visible

**Test Types to Generate:**

1. **Unit Tests** (tests/unit/): Pure function tests using Vitest
   - Test edge cases, error handling, boundary conditions
   - Mock external dependencies

2. **Integration Tests** (tests/integration/): Component integration tests
   - Test React component behavior with @testing-library/react
   - Test hooks and context integration

3. **E2E Tests** (tests/e2e/): Browser automation tests
   - Test user flows with Playwright
   - Visual regression checks

**Guidelines:**
- Read existing test patterns first
- Follow existing test file naming conventions
- Include proper setup/teardown
- Add descriptive test names
- Cover happy path, edge cases, and error scenarios
- Use data-testid attributes for E2E selectors`;

export interface TestOptions {
    dryRun?: boolean;
    verbose?: boolean;
    type?: 'unit' | 'integration' | 'e2e' | 'all';
    issue?: number;
    pr?: number;
}

export async function test(options: TestOptions = {}): Promise<void> {
    const { dryRun = false, verbose = false, type = 'all', issue, pr } = options;

    if (!issue && !pr) {
        throw new Error('Must specify --issue or --pr');
    }

    const workingDirectory = process.cwd();
    console.log(pc.blue(`Generating tests...`));

    if (verbose) {
        console.log(pc.dim(`Working directory: ${workingDirectory}`));
        console.log(pc.dim(`Test type: ${type}`));
    }

    // Get context from issue or PR
    let title: string;
    let body: string;
    let diff = '';

    if (issue) {
        const issueData = getIssue(issue);
        title = issueData.title;
        body = issueData.body;
        console.log(pc.dim(`Issue #${issue}: ${title}`));
    } else if (pr) {
        const prData = getPullRequest(pr);
        title = prData.title;
        body = prData.body;
        diff = prData.diff;
        console.log(pc.dim(`PR #${pr}: ${title}`));
    } else {
        throw new Error('Unreachable');
    }

    let fsClient: MCPClient | null = null;
    let playwrightClient: MCPClient | null = null;

    try {
        // Create MCP clients
        console.log(pc.dim('Connecting to MCP servers...'));
        fsClient = await createInlineFilesystemClient(workingDirectory);

        const tools: Record<string, unknown> = {
            ...(await fsClient.tools()),
        };

        // Add Playwright tools for E2E tests
        if (type === 'e2e' || type === 'all') {
            try {
                playwrightClient = await createPlaywrightClient({
                    headless: true,
                    testingCapabilities: true,
                });
                const pwTools = await getPlaywrightTools(playwrightClient);
                Object.assign(tools, pwTools);
                console.log(pc.dim('Playwright MCP connected'));
            } catch (err) {
                console.log(pc.yellow('Playwright MCP not available, skipping E2E tools'));
            }
        }

        console.log(pc.dim(`Available tools: ${Object.keys(tools).length}`));

        // Build prompt
        const testTypes = type === 'all' ? 'unit, integration, and E2E' : type;
        let prompt = `Generate ${testTypes} tests for the following:\n\n`;

        if (issue) {
            prompt += `**Issue #${issue}: ${title}**\n\n${body || '(no description)'}\n\n`;
            prompt += `Generate tests that verify the issue requirements are met.\n`;
        } else if (pr) {
            prompt += `**PR #${pr}: ${title}**\n\n${body || '(no description)'}\n\n`;
            if (diff) {
                const truncatedDiff = diff.length > 20000
                    ? diff.slice(0, 20000) + '\n...(truncated)'
                    : diff;
                prompt += `**Changes:**\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\n`;
            }
            prompt += `Generate tests that cover the changes in this PR.\n`;
        }

        prompt += `\nFirst, explore the existing test structure, then create appropriate tests.`;

        if (dryRun) {
            console.log(pc.yellow('\n[Dry run] Would generate tests'));
            console.log(pc.dim('Prompt:'));
            console.log(prompt.slice(0, 500) + '...');
            return;
        }

        console.log(pc.blue('\nGenerating tests with AI...'));

        const result = await generateWithTools(prompt, tools, {
            systemPrompt: SYSTEM_PROMPT,
        });

        console.log('\n' + pc.green('Test Generation Summary:'));
        console.log(result.text);

        // Check for created test files
        const writeOps = (result.toolResults as Array<{ toolName?: string }>).filter(
            (r) => r.toolName === 'write_file'
        );

        if (writeOps.length > 0) {
            console.log(pc.green(`\n✅ Created ${writeOps.length} test file(s)`));

            // Run the tests to verify they pass
            console.log(pc.blue('\nRunning generated tests...'));
            try {
                execFileSync('pnpm', ['run', 'test'], {
                    cwd: workingDirectory,
                    stdio: 'pipe',
                    encoding: 'utf-8',
                });
                console.log(pc.green('✅ Tests pass!'));
            } catch (err) {
                console.log(pc.yellow('⚠️ Some tests may need adjustment'));
            }
        } else {
            console.log(pc.yellow('\nNo test files were created'));
        }

        // Comment on issue/PR
        const summary = result.text.length > 1000
            ? result.text.slice(0, 1000) + '...'
            : result.text;

        const comment = `## 🧪 AI Test Generation\n\n${summary}\n\n---\n_Generated by @strata/triage_`;

        if (issue) {
            commentOnIssue(issue, comment);
        } else if (pr) {
            commentOnPR(pr, comment);
        }

        console.log(pc.green('\nDone!'));

    } finally {
        if (fsClient) await fsClient.close();
        if (playwrightClient) await playwrightClient.close();
    }
}
