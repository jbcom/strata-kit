/**
 * Coverage Command
 *
 * Analyzes test coverage, identifies gaps, and takes action:
 * - Identifies untested code paths
 * - Suggests tests for uncovered code
 * - Creates issues for coverage improvements
 * - Tracks coverage trends
 */

import pc from 'picocolors';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { generate, generateWithTools } from '../ai.js';
import { createInlineFilesystemClient, type MCPClient } from '../mcp.js';
import {
    parseTestReport,
    getLowCoverageFiles,
    getUncoveredFunctions,
    type TestReport,
} from '../test-results.js';

const SYSTEM_PROMPT = `You are a test coverage expert for Strata, a procedural 3D graphics library for React Three Fiber.

Analyze code coverage and provide actionable recommendations:

1. **Coverage Gap Analysis**
   - Identify critical uncovered code paths
   - Prioritize by risk and importance
   - Note code that may not need testing (boilerplate, simple getters)

2. **Test Suggestions**
   - Suggest specific tests for uncovered code
   - Include test scenarios and edge cases
   - Reference relevant existing tests as examples

3. **Coverage Prioritization**
   - Critical: Core algorithms, safety-critical code
   - High: Main feature code, public APIs
   - Medium: Helper functions, utilities
   - Low: Logging, debug code, simple wrappers

Focus on meaningful coverage, not just hitting 100%.`;

export interface CoverageOptions {
    /** Path to test report file */
    report: string;
    /** Coverage threshold percentage */
    threshold?: number;
    /** Dry run - don't make changes */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
    /** Create issues for low coverage files */
    createIssues?: boolean;
    /** Generate test suggestions */
    suggestTests?: boolean;
}

export async function coverage(options: CoverageOptions): Promise<void> {
    const {
        report: reportPath,
        threshold = 80,
        dryRun = false,
        verbose = false,
        createIssues = false,
        suggestTests = true,
    } = options;

    console.log(pc.blue('📊 Analyzing test coverage...'));

    // Load test report
    if (!existsSync(reportPath)) {
        throw new Error(`Report file not found: ${reportPath}`);
    }

    const reportJson = readFileSync(reportPath, 'utf-8');
    const report = parseTestReport(reportJson);

    if (!report.coverage) {
        console.log(pc.yellow('⚠️ No coverage data in report'));
        console.log(pc.dim('Run tests with --coverage to include coverage data'));
        return;
    }

    if (verbose) {
        console.log(pc.dim(`Overall coverage:`));
        console.log(pc.dim(`  Lines: ${report.coverage.lines.percentage.toFixed(1)}%`));
        console.log(pc.dim(`  Functions: ${report.coverage.functions.percentage.toFixed(1)}%`));
        console.log(pc.dim(`  Branches: ${report.coverage.branches.percentage.toFixed(1)}%`));
    }

    // Find low coverage files
    const lowCoverage = getLowCoverageFiles(report, threshold);
    const uncoveredFunctions = getUncoveredFunctions(report);

    if (lowCoverage.length === 0) {
        console.log(pc.green(`✅ All files above ${threshold}% coverage threshold!`));
        return;
    }

    console.log(pc.yellow(`Found ${lowCoverage.length} file(s) below ${threshold}% coverage`));

    // Summary
    console.log('\n' + pc.bold('Coverage Summary:'));
    for (const file of lowCoverage.slice(0, 10)) {
        const color = file.lines.percentage < 50 ? pc.red : pc.yellow;
        console.log(color(`  ${file.path}: ${file.lines.percentage.toFixed(1)}%`));
    }
    if (lowCoverage.length > 10) {
        console.log(pc.dim(`  ... and ${lowCoverage.length - 10} more`));
    }

    // Generate AI analysis if requested
    let analysis = '';
    let fsClient: MCPClient | null = null;

    if (suggestTests) {
        try {
            const workingDirectory = process.cwd();
            fsClient = await createInlineFilesystemClient(workingDirectory);
            const tools = await fsClient.tools();

            // Build analysis prompt
            const fileList = lowCoverage
                .slice(0, 5)
                .map((f) => `- ${f.path}: ${f.lines.percentage.toFixed(1)}% (uncovered lines: ${f.uncoveredLines.slice(0, 10).join(', ')}${f.uncoveredLines.length > 10 ? '...' : ''})`)
                .join('\n');

            const functionList = uncoveredFunctions
                .slice(0, 10)
                .map((f) => `- ${f.file}: ${f.functions.join(', ')}`)
                .join('\n');

            const prompt = `Analyze coverage gaps and suggest tests:

## Low Coverage Files
${fileList}

## Uncovered Functions
${functionList}

For each file:
1. Read the source file to understand what needs testing
2. Identify the most critical untested code paths
3. Suggest specific test cases with example code
4. Estimate effort to reach ${threshold}% coverage`;

            console.log(pc.blue('\nGenerating test suggestions...'));

            const result = await generateWithTools(prompt, tools, {
                systemPrompt: SYSTEM_PROMPT,
            });

            analysis = result.text;
            console.log('\n' + pc.green('Coverage Analysis:'));
            console.log(analysis);

        } finally {
            if (fsClient) await fsClient.close();
        }
    }

    // Create issues for low coverage files
    if (createIssues && !dryRun) {
        await createCoverageIssues(lowCoverage, threshold, analysis);
    } else if (createIssues && dryRun) {
        console.log(pc.yellow(`\n[Dry run] Would create ${lowCoverage.length} coverage issue(s)`));
    }

    console.log(pc.green('\nCoverage analysis complete!'));
}

async function createCoverageIssues(
    files: Array<{ path: string; lines: { percentage: number } }>,
    threshold: number,
    analysis: string
): Promise<void> {
    console.log(pc.blue('\nCreating coverage improvement issues...'));

    // Group files to avoid too many issues
    const criticalFiles = files.filter((f) => f.lines.percentage < 50);
    const moderateFiles = files.filter((f) => f.lines.percentage >= 50 && f.lines.percentage < threshold);

    if (criticalFiles.length > 0) {
        const title = `[Coverage] Critical: ${criticalFiles.length} files below 50% coverage`;
        const body = `## Coverage Improvement Needed

The following files have critically low test coverage (<50%):

${criticalFiles.map((f) => `- \`${f.path}\`: ${f.lines.percentage.toFixed(1)}%`).join('\n')}

### Priority
These files should be prioritized for testing as they represent significant coverage gaps.

${analysis ? `### AI Analysis\n\n${analysis.slice(0, 2000)}...` : ''}

---
_Auto-created by @strata/triage_`;

        try {
            spawnSync('gh', ['issue', 'create', '--title', title, '--body', body, '--label', 'tests,coverage'], {
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            console.log(pc.green(`Created issue: ${title}`));
        } catch (err) {
            console.log(pc.yellow(`Could not create issue: ${title}`));
        }
    }

    if (moderateFiles.length > 3) {
        const title = `[Coverage] ${moderateFiles.length} files need coverage improvement`;
        const body = `## Coverage Below Threshold

The following files are below the ${threshold}% coverage threshold:

${moderateFiles.slice(0, 20).map((f) => `- \`${f.path}\`: ${f.lines.percentage.toFixed(1)}%`).join('\n')}
${moderateFiles.length > 20 ? `\n... and ${moderateFiles.length - 20} more files` : ''}

---
_Auto-created by @strata/triage_`;

        try {
            spawnSync('gh', ['issue', 'create', '--title', title, '--body', body, '--label', 'tests,coverage'], {
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            console.log(pc.green(`Created issue: ${title}`));
        } catch (err) {
            console.log(pc.yellow(`Could not create issue: ${title}`));
        }
    }
}
