/**
 * @strata/triage - AI-Powered Development Automation
 *
 * The triage package provides a comprehensive CLI and SDK for automating
 * the entire development lifecycle of the Strata project:
 *
 * - **Issue Triage**: AI-powered assessment, labeling, and planning
 * - **Code Development**: Automated implementation from issues
 * - **Testing**: Test generation, execution, and failure diagnosis
 * - **Code Review**: AI-driven PR reviews and feedback handling
 * - **Security**: CodeQL analysis, custom scanning, SARIF generation
 * - **Releases**: Conventional commits, changelog, versioning, npm publish
 * - **Sprint Planning**: Weighted prioritization, backlog balancing
 *
 * @example CLI Usage
 * ```bash
 * # Assess an issue
 * triage assess 123
 *
 * # Review a PR
 * triage review 144
 *
 * # Generate tests
 * triage generate src/core/math/noise.ts --type unit
 *
 * # Run release
 * triage release --dry-run
 * ```
 *
 * @example SDK Usage
 * ```typescript
 * import { assess, generate, getOctokit } from '@strata/triage';
 *
 * // Assess an issue programmatically
 * await assess(123, { verbose: true });
 *
 * // Generate with AI
 * const result = await generate(prompt, { systemPrompt });
 * ```
 *
 * @packageDocumentation
 * @module @strata/triage
 */

// ============================================================================
// AI Integration
// ============================================================================

/**
 * AI generation with Vercel AI SDK + Ollama Cloud
 *
 * @example
 * ```typescript
 * import { aiGenerate, generateWithTools, getFilesystemTools } from '@strata/triage';
 *
 * // Simple generation
 * const analysis = await aiGenerate(prompt, { systemPrompt });
 *
 * // With filesystem tools
 * const client = await createInlineFilesystemClient('/path');
 * const result = await generateWithTools(prompt, {
 *   tools: await getFilesystemTools(client),
 * });
 * ```
 */
export {
    getProvider,
    getModel,
    generate as aiGenerate,
    generateWithTools,
    DEFAULT_MODEL,
    CLOUD_HOST,
    type AIConfig,
    type GenerateOptions as AIGenerateOptions,
} from './ai.js';

// ============================================================================
// Model Context Protocol (MCP)
// ============================================================================

/**
 * MCP filesystem integration for AI file operations
 *
 * @example
 * ```typescript
 * import { createInlineFilesystemClient, getFilesystemTools } from '@strata/triage';
 *
 * const client = await createInlineFilesystemClient(process.cwd());
 * const tools = await getFilesystemTools(client);
 * ```
 */
export { createFilesystemClient, createInlineFilesystemClient, getFilesystemTools, type MCPClient } from './mcp.js';

/**
 * Playwright MCP for E2E test automation
 *
 * @example
 * ```typescript
 * import { createPlaywrightClient, getPlaywrightTools } from '@strata/triage';
 *
 * const client = await createPlaywrightClient();
 * const tools = await getPlaywrightTools(client);
 * ```
 */
export { createPlaywrightClient, getPlaywrightTools, PLAYWRIGHT_TOOLS, type PlaywrightOptions } from './playwright.js';

// ============================================================================
// GitHub API (Octokit)
// ============================================================================

/**
 * Advanced GitHub API operations via Octokit REST and GraphQL
 *
 * Provides:
 * - PR state management (draft/ready, auto-merge)
 * - Review operations (comments, replies, submissions)
 * - Check run monitoring and creation
 * - Security alerts (CodeQL, Dependabot)
 *
 * @example
 * ```typescript
 * import { getOctokit, enableAutoMerge, waitForChecks } from '@strata/triage';
 *
 * const octokit = getOctokit();
 * await enableAutoMerge(144, 'SQUASH');
 * await waitForChecks(144);
 * ```
 */
export {
    getOctokit,
    getRepoContext,
    // PR Management
    convertPRToDraft,
    markPRReadyForReview,
    enableAutoMerge,
    disableAutoMerge,
    // Reviews
    getPRReviewComments,
    getPRReviews,
    replyToReviewComment,
    submitPRReview,
    // Checks
    getCheckRuns,
    areAllChecksPassing,
    createCheckRun,
    waitForChecks,
    // Security
    getCodeScanningAlerts,
    getPRCodeScanningAlerts,
    getDependabotAlerts,
    formatAlertsForAI,
    type ReviewComment,
    type CheckRun,
    type CodeScanningAlert,
    type DependabotAlert,
} from './octokit.js';

// ============================================================================
// GitHub CLI Helpers
// ============================================================================

/**
 * GitHub CLI (`gh`) helpers for common operations
 *
 * Uses `execFileSync` for safe command execution without shell injection.
 *
 * @example
 * ```typescript
 * import { getIssue, createPR, commentOnPR } from '@strata/triage';
 *
 * const issue = getIssue(123);
 * const prUrl = createPR('fix/issue-123', 'Fix bug', 'Closes #123');
 * commentOnPR(144, 'LGTM!');
 * ```
 */
export {
    getIssue,
    getPullRequest,
    addLabels,
    removeLabels,
    commentOnIssue,
    commentOnPR,
    createBranch,
    pushBranch,
    createPR,
    getDefaultBranch,
    type Issue,
    type PullRequest,
} from './github.js';

// ============================================================================
// CLI Commands
// ============================================================================

/**
 * Triage CLI command implementations
 *
 * Each command is also available as a programmatic function:
 *
 * | Command | Function | Description |
 * |---------|----------|-------------|
 * | `assess` | `assess()` | AI issue assessment |
 * | `review` | `review()` | AI code review |
 * | `develop` | `develop()` | AI implementation |
 * | `test` | `test()` | Test generation |
 * | `diagnose` | `diagnose()` | Failure analysis |
 * | `security` | `security()` | Security scanning |
 * | `release` | `releaseCommand()` | Full release cycle |
 *
 * @example
 * ```typescript
 * import { assess, review, develop } from '@strata/triage';
 *
 * await assess(123, { dryRun: true });
 * await review(144, { verbose: true });
 * await develop(123, { approve: true });
 * ```
 */
export {
    assess,
    review,
    autoLabel,
    develop,
    test,
    plan,
    verify,
    diagnose,
    coverage,
    generateTests,
    security,
    automerge,
    sprint,
    roadmap,
    cascade,
    type AssessOptions,
    type ReviewOptions,
    type LabelOptions,
    type DevelopOptions,
    type TestOptions,
    type PlanOptions,
    type VerifyOptions,
    type DiagnoseOptions,
    type CoverageOptions,
    type GenerateOptions,
    type SecurityOptions,
    type AutomergeOptions,
    type SprintCommandOptions,
    type RoadmapCommandOptions,
    type CascadeCommandOptions,
} from './commands/index.js';

// ============================================================================
// Sprint Planning
// ============================================================================

/**
 * Sprint planning and roadmap generation
 *
 * Provides weighted issue prioritization, backlog health analysis,
 * sprint balancing, and automated roadmap generation.
 *
 * @example
 * ```typescript
 * import { calculateWeight, planSprint, generateRoadmap } from '@strata/triage';
 *
 * const weight = calculateWeight(issueMetrics);
 * await planSprint({ dryRun: true });
 * await generateRoadmap({ quarters: 2 });
 * ```
 */
export * from './planning/index.js';

// ============================================================================
// Execution Framework
// ============================================================================

/**
 * Structured execution for deterministic AI operations
 *
 * Provides:
 * - Execution plans with step-by-step operations
 * - Token estimation and plan splitting
 * - VCR-style HTTP recording for testing
 * - Sandboxed filesystem for isolation
 * - Fixture repositories for deterministic tests
 *
 * @example
 * ```typescript
 * import { TestHarness, createFixtureRepo, Sandbox } from '@strata/triage';
 *
 * const harness = new TestHarness();
 * const fixture = await createFixtureRepo({ commits: [...] });
 * const sandbox = new Sandbox();
 * ```
 */
export * from './execution/index.js';

// ============================================================================
// Test Results
// ============================================================================

/**
 * Test report parsing and analysis
 *
 * Parses custom JSON test reports from Vitest and Playwright,
 * extracts failures, coverage data, and formats for AI analysis.
 *
 * @example
 * ```typescript
 * import { parseTestReport, getFailedTests, formatForAI } from '@strata/triage';
 *
 * const report = parseTestReport('test-results/strata-report.json');
 * const failures = getFailedTests(report);
 * const aiPrompt = formatForAI(failures);
 * ```
 */
export {
    parseTestReport,
    getFailedTests,
    getTestsByFile,
    getLowCoverageFiles,
    getUncoveredFunctions,
    formatForAI,
    type TestReport,
    type TestResult,
    type TestFile,
    type TestError,
    type CoverageData,
    type FileCoverage,
} from './test-results.js';
