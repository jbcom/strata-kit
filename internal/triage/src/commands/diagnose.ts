/**
 * Diagnose Command
 *
 * Analyzes test results, diagnoses failures, and takes action:
 * - Updates related issues with failure details
 * - Creates bug issues for new failures
 * - Optionally attempts to fix simple failures
 */

import pc from 'picocolors';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { generate, generateWithTools } from '../ai.js';
import { createInlineFilesystemClient, type MCPClient } from '../mcp.js';
import {
    parseTestReport,
    getFailedTests,
    formatForAI,
    type TestReport,
    type TestResult,
} from '../test-results.js';
import { commentOnIssue, commentOnPR, addLabels } from '../github.js';

const SYSTEM_PROMPT = `You are an expert test failure diagnostician for Strata, a procedural 3D graphics library for React Three Fiber.

Analyze test failures and provide actionable diagnosis:

1. **Root Cause Analysis**
   - Identify the actual cause (not just symptoms)
   - Distinguish between test bugs vs code bugs vs flaky tests

2. **Classification**
   - Bug: Actual code defect
   - Test Issue: Test is incorrect or flaky
   - Environment: CI/environment-specific issue
   - Regression: Previously working code broken

3. **Severity Assessment**
   - Critical: Blocks core functionality
   - High: Significant feature broken
   - Medium: Non-critical functionality affected
   - Low: Minor issue or cosmetic

4. **Fix Suggestions**
   - Provide specific code changes when possible
   - Reference exact files and lines
   - Consider related code that might need changes

When you have access to filesystem tools, read the relevant source files to provide more accurate diagnosis.`;

export interface DiagnoseOptions {
    /** Path to test report file */
    report: string;
    /** Dry run - don't make changes */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
    /** PR number (if running on a PR) */
    pr?: number;
    /** Attempt to auto-fix simple issues */
    autoFix?: boolean;
    /** Create issues for new failures */
    createIssues?: boolean;
}

export async function diagnose(options: DiagnoseOptions): Promise<void> {
    const {
        report: reportPath,
        dryRun = false,
        verbose = false,
        pr,
        autoFix = false,
        createIssues = false,
    } = options;

    console.log(pc.blue('🔍 Diagnosing test failures...'));

    // Load test report
    if (!existsSync(reportPath)) {
        throw new Error(`Report file not found: ${reportPath}`);
    }

    const reportJson = readFileSync(reportPath, 'utf-8');
    const report = parseTestReport(reportJson);

    if (verbose) {
        console.log(pc.dim(`Report: ${report.runner} ${report.type}`));
        console.log(pc.dim(`Total: ${report.summary.total}, Failed: ${report.summary.failed}`));
    }

    const failed = getFailedTests(report);

    if (failed.length === 0) {
        console.log(pc.green('✅ All tests passed! No diagnosis needed.'));
        return;
    }

    console.log(pc.yellow(`Found ${failed.length} failed test(s)`));

    // Format report for AI
    const formattedReport = formatForAI(report);

    let fsClient: MCPClient | null = null;

    try {
        // Get filesystem tools for deeper analysis
        const workingDirectory = process.cwd();
        fsClient = await createInlineFilesystemClient(workingDirectory);

        const tools = await fsClient.tools();

        // Build diagnosis prompt
        const prompt = `Analyze these test failures and provide diagnosis:

${formattedReport}

For each failure:
1. Read the test file and relevant source files
2. Identify the root cause
3. Classify the failure type
4. Suggest specific fixes

Provide a structured diagnosis for each failure.`;

        console.log(pc.blue('\nAnalyzing with AI...'));

        const result = await generateWithTools(prompt, tools, {
            systemPrompt: SYSTEM_PROMPT,
        });

        console.log('\n' + pc.green('Diagnosis Report:'));
        console.log(result.text);

        if (dryRun) {
            console.log(pc.yellow('\n[Dry run] Would post diagnosis'));
            return;
        }

        // Post diagnosis to PR if applicable
        if (pr) {
            const comment = `## 🔍 Test Failure Diagnosis

${result.text}

---
_Analyzed by @strata/triage_`;

            commentOnPR(pr, comment);
            console.log(pc.dim(`Posted diagnosis to PR #${pr}`));
        }

        // Find related issues from git blame
        if (createIssues) {
            await createIssuesForFailures(failed, report, result.text, dryRun);
        }

        // Attempt auto-fix for simple issues
        if (autoFix && fsClient) {
            await attemptAutoFix(failed, result.text, fsClient, dryRun);
        }

        console.log(pc.green('\nDiagnosis complete!'));

    } finally {
        if (fsClient) await fsClient.close();
    }
}

async function createIssuesForFailures(
    failures: TestResult[],
    report: TestReport,
    diagnosis: string,
    dryRun: boolean
): Promise<void> {
    console.log(pc.blue('\nChecking for new issues to create...'));

    // Group failures by likely cause
    const failureGroups = new Map<string, TestResult[]>();

    for (const failure of failures) {
        // Group by file and error message similarity
        const key = `${failure.file}:${failure.error?.message?.slice(0, 50) || 'unknown'}`;
        if (!failureGroups.has(key)) {
            failureGroups.set(key, []);
        }
        failureGroups.get(key)!.push(failure);
    }

    for (const [key, group] of failureGroups) {
        const firstFailure = group[0];

        // Check if issue already exists
        const searchQuery = `is:issue is:open "${firstFailure.file}" in:body`;
        try {
            const existing = execFileSync('gh', ['issue', 'list', '--search', searchQuery, '--json', 'number', '--limit', '1'], {
                encoding: 'utf-8',
            });
            const parsed = JSON.parse(existing);
            if (parsed.length > 0) {
                console.log(pc.dim(`Issue already exists for ${firstFailure.file}`));
                continue;
            }
        } catch {
            // Continue even if search fails
        }

        const title = `[Test Failure] ${firstFailure.name}`;
        const body = `## Test Failure Report

**File:** \`${firstFailure.file}\`
**Test:** ${firstFailure.fullName}
**Runner:** ${report.runner}

### Error

\`\`\`
${firstFailure.error?.message || 'Unknown error'}
\`\`\`

${firstFailure.error?.codeFrame ? `### Code Frame\n\`\`\`\n${firstFailure.error.codeFrame}\n\`\`\`` : ''}

### Context

${report.git ? `- **Branch:** ${report.git.branch}\n- **Commit:** ${report.git.commit}` : ''}

---
_Auto-created by @strata/triage_`;

        if (dryRun) {
            console.log(pc.yellow(`[Dry run] Would create issue: ${title}`));
        } else {
            try {
                spawnSync('gh', ['issue', 'create', '--title', title, '--body', body, '--label', 'bug,test-failure'], {
                    encoding: 'utf-8',
                });
                console.log(pc.green(`Created issue: ${title}`));
            } catch (err) {
                console.log(pc.yellow(`Could not create issue: ${title}`));
            }
        }
    }
}

async function attemptAutoFix(
    failures: TestResult[],
    diagnosis: string,
    fsClient: MCPClient,
    dryRun: boolean
): Promise<void> {
    console.log(pc.blue('\nAttempting auto-fix for simple issues...'));

    // Only attempt to fix clear-cut issues
    const simpleFixPatterns = [
        /import.*from ['"]([^'"]+)['"]/,  // Import issues
        /Cannot find.*['"]([^'"]+)['"]/,   // Missing exports
        /is not assignable to type/,        // Type mismatches
    ];

    const fixableFailures = failures.filter((f) =>
        simpleFixPatterns.some((p) => p.test(f.error?.message || ''))
    );

    if (fixableFailures.length === 0) {
        console.log(pc.dim('No simple fixes identified'));
        return;
    }

    console.log(pc.dim(`Found ${fixableFailures.length} potentially fixable issue(s)`));

    // For now, just log - actual fixes would use the AI with filesystem tools
    if (dryRun) {
        console.log(pc.yellow('[Dry run] Would attempt fixes'));
    }
}
