#!/usr/bin/env node

/**
 * Strata Triage CLI
 *
 * AI-powered development automation:
 * - Issue triage and assessment
 * - Code review
 * - Test generation from source code
 * - Test failure diagnosis
 * - Coverage analysis
 * - Project planning
 * - Security analysis
 * - PR auto-merge management
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { assess } from './commands/assess.js';
import { review } from './commands/review.js';
import { autoLabel } from './commands/label.js';
import { develop } from './commands/develop.js';
import { test } from './commands/test.js';
import { plan } from './commands/plan.js';
import { verify } from './commands/verify.js';
import { diagnose } from './commands/diagnose.js';
import { coverage } from './commands/coverage.js';
import { generateTests } from './commands/generate.js';
import { security } from './commands/security.js';
import { automerge } from './commands/automerge.js';
import { sprint } from './commands/sprint.js';
import { roadmap } from './commands/roadmap.js';
import { cascade } from './commands/cascade.js';
import { harness } from './commands/harness.js';
import { handleFeedback } from './commands/feedback.js';
import { releaseCommand } from './commands/release.js';
import { scan } from './commands/scan.js';
import { configureRepository } from './commands/configure.js';

const program = new Command();

program
    .name('triage')
    .description('AI-powered development automation for Strata')
    .version('1.0.0');

// ============================================
// ISSUE MANAGEMENT
// ============================================

program
    .command('assess')
    .description('Analyze and triage a GitHub issue')
    .argument('<issue>', 'Issue number to assess')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (issue: string, options: { dryRun?: boolean; verbose?: boolean }) => {
        try {
            await assess(parseInt(issue, 10), options);
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('label')
    .description('Auto-label a new issue with triage label')
    .argument('<issue>', 'Issue number to label')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (issue: string, options: { dryRun?: boolean; verbose?: boolean }) => {
        try {
            await autoLabel(parseInt(issue, 10), options);
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('plan')
    .description('Create a project plan for a GitHub issue')
    .argument('<issue>', 'Issue number to plan')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .option('--create-tasks', 'Create sub-issue tasks from the plan')
    .action(async (issue: string, options: { dryRun?: boolean; verbose?: boolean; createTasks?: boolean }) => {
        try {
            await plan(parseInt(issue, 10), options);
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// CODE DEVELOPMENT
// ============================================

program
    .command('develop')
    .description('Implement changes for a GitHub issue using AI')
    .argument('<issue>', 'Issue number to implement')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .option('-s, --max-steps <number>', 'Maximum AI interaction steps', '10')
    .action(async (issue: string, options: { dryRun?: boolean; verbose?: boolean; maxSteps?: string }) => {
        try {
            await develop(parseInt(issue, 10), {
                ...options,
                maxSteps: options.maxSteps ? parseInt(options.maxSteps, 10) : undefined,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('review')
    .description('Review a pull request')
    .argument('<pr>', 'PR number to review')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (pr: string, options: { dryRun?: boolean; verbose?: boolean }) => {
        try {
            await review(parseInt(pr, 10), options);
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// TEST GENERATION & ANALYSIS
// ============================================

program
    .command('generate')
    .description('Generate tests from source code')
    .argument('<source>', 'Source file to generate tests for')
    .option('-o, --output <dir>', 'Output directory for tests')
    .option('-t, --type <type>', 'Test type: unit, integration, component', 'unit')
    .option('-n, --dry-run', 'Show what would be generated')
    .option('-v, --verbose', 'Show verbose output')
    .option('-r, --run', 'Run generated tests immediately')
    .option('--overwrite', 'Overwrite existing test files')
    .action(async (source: string, options: {
        output?: string;
        type?: string;
        dryRun?: boolean;
        verbose?: boolean;
        run?: boolean;
        overwrite?: boolean;
    }) => {
        try {
            await generateTests({
                source,
                output: options.output,
                type: options.type as 'unit' | 'integration' | 'component',
                dryRun: options.dryRun,
                verbose: options.verbose,
                run: options.run,
                overwrite: options.overwrite,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('test')
    .description('Generate tests for an issue or PR')
    .option('-i, --issue <number>', 'Issue number to generate tests for')
    .option('-p, --pr <number>', 'PR number to generate tests for')
    .option('-t, --type <type>', 'Test type: unit, integration, e2e, or all', 'all')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: { issue?: string; pr?: string; type?: string; dryRun?: boolean; verbose?: boolean }) => {
        try {
            await test({
                issue: options.issue ? parseInt(options.issue, 10) : undefined,
                pr: options.pr ? parseInt(options.pr, 10) : undefined,
                type: options.type as 'unit' | 'integration' | 'e2e' | 'all',
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('diagnose')
    .description('Diagnose test failures from a report')
    .requiredOption('-r, --report <file>', 'Path to Strata test report JSON')
    .option('-p, --pr <number>', 'PR number to comment on')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .option('--auto-fix', 'Attempt to auto-fix simple issues')
    .option('--create-issues', 'Create issues for new failures')
    .action(async (options: {
        report: string;
        pr?: string;
        dryRun?: boolean;
        verbose?: boolean;
        autoFix?: boolean;
        createIssues?: boolean;
    }) => {
        try {
            await diagnose({
                report: options.report,
                pr: options.pr ? parseInt(options.pr, 10) : undefined,
                dryRun: options.dryRun,
                verbose: options.verbose,
                autoFix: options.autoFix,
                createIssues: options.createIssues,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('coverage')
    .description('Analyze test coverage and suggest improvements')
    .requiredOption('-r, --report <file>', 'Path to Strata test report JSON with coverage')
    .option('-t, --threshold <percent>', 'Coverage threshold percentage', '80')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .option('--create-issues', 'Create issues for low coverage files')
    .option('--no-suggest', 'Skip AI test suggestions')
    .action(async (options: {
        report: string;
        threshold?: string;
        dryRun?: boolean;
        verbose?: boolean;
        createIssues?: boolean;
        suggest?: boolean;
    }) => {
        try {
            await coverage({
                report: options.report,
                threshold: options.threshold ? parseInt(options.threshold, 10) : undefined,
                dryRun: options.dryRun,
                verbose: options.verbose,
                createIssues: options.createIssues,
                suggestTests: options.suggest !== false,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('verify')
    .description('Verify a PR by running tests')
    .argument('<pr>', 'PR number to verify')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .option('--dev-server <url>', 'Dev server URL for browser verification')
    .action(async (pr: string, options: { dryRun?: boolean; verbose?: boolean; devServer?: string }) => {
        try {
            await verify(parseInt(pr, 10), {
                dryRun: options.dryRun,
                verbose: options.verbose,
                devServerUrl: options.devServer,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// SECURITY & PR MANAGEMENT
// ============================================

program
    .command('security')
    .description('Analyze security alerts (CodeQL, Dependabot)')
    .option('-p, --pr <number>', 'Check PR-specific alerts')
    .option('--no-dependabot', 'Skip Dependabot alerts')
    .option('--no-code-scanning', 'Skip code scanning alerts')
    .option('--sarif <file>', 'Output SARIF file for GitHub upload')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        pr?: string;
        dependabot?: boolean;
        codeScanning?: boolean;
        sarif?: string;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await security({
                pr: options.pr ? parseInt(options.pr, 10) : undefined,
                dependabot: options.dependabot !== false,
                codeScanning: options.codeScanning !== false,
                sarifOutput: options.sarif,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('scan')
    .description('Run custom security scanner for Strata-specific issues')
    .option('-d, --dir <directories...>', 'Directories to scan', ['src', 'internal'])
    .option('--sarif <file>', 'Output SARIF file for GitHub upload')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        dir?: string[];
        sarif?: string;
        verbose?: boolean;
    }) => {
        try {
            const results = await scan({
                directories: options.dir,
                sarifOutput: options.sarif,
                verbose: options.verbose,
            });
            // Exit with error if any errors found
            if (results.some(r => r.severity === 'error')) {
                process.exit(1);
            }
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('configure')
    .description('Configure repository settings for triage workflow')
    .option('--no-disable-codeql', 'Keep default CodeQL setup enabled')
    .option('--no-dependabot', 'Skip enabling Dependabot alerts')
    .option('--no-secret-scanning', 'Skip enabling secret scanning')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        disableCodeql?: boolean;
        dependabot?: boolean;
        secretScanning?: boolean;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await configureRepository({
                disableDefaultCodeQL: options.disableCodeql !== false,
                enableDependabot: options.dependabot !== false,
                enableSecretScanning: options.secretScanning !== false,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('automerge')
    .description('Manage PR auto-merge and state')
    .argument('<pr>', 'PR number')
    .argument('<action>', 'Action: enable, disable, status, wait, draft, ready')
    .option('-m, --merge-method <method>', 'Merge method: MERGE, SQUASH, REBASE', 'SQUASH')
    .option('--approve', 'Also approve the PR')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (pr: string, action: string, options: {
        mergeMethod?: string;
        approve?: boolean;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await automerge(parseInt(pr, 10), {
                action: action as 'enable' | 'disable' | 'status' | 'wait' | 'draft' | 'ready',
                mergeMethod: options.mergeMethod as 'MERGE' | 'SQUASH' | 'REBASE',
                approve: options.approve,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// PROJECT PLANNING & AUTOMATION
// ============================================

program
    .command('sprint')
    .description('Run weekly sprint planning with AI')
    .option('-d, --duration <days>', 'Sprint duration in days', '7')
    .option('-c, --capacity <points>', 'Story points capacity', '40')
    .option('--name <name>', 'Sprint name')
    .option('--no-milestone', 'Skip creating GitHub milestone')
    .option('--trigger', 'Trigger development for top issues')
    .option('--max-trigger <count>', 'Max issues to trigger', '3')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        duration?: string;
        capacity?: string;
        name?: string;
        milestone?: boolean;
        trigger?: boolean;
        maxTrigger?: string;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await sprint({
                duration: options.duration ? parseInt(options.duration, 10) : undefined,
                capacity: options.capacity ? parseInt(options.capacity, 10) : undefined,
                name: options.name,
                milestone: options.milestone !== false,
                trigger: options.trigger,
                maxTrigger: options.maxTrigger ? parseInt(options.maxTrigger, 10) : undefined,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('roadmap')
    .description('Generate quarterly roadmap with AI')
    .option('-q, --quarters <count>', 'Number of quarters to plan', '2')
    .option('--include-completed', 'Include completed issues in analysis')
    .option('--update-project', 'Update GitHub project board')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        quarters?: string;
        includeCompleted?: boolean;
        updateProject?: boolean;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await roadmap({
                quarters: options.quarters ? parseInt(options.quarters, 10) : undefined,
                includeCompleted: options.includeCompleted,
                updateProject: options.updateProject,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program
    .command('cascade')
    .description('Run full automation cascade (plan → develop → test → review → merge)')
    .option('--steps <steps>', 'Steps to include (comma-separated)', 'plan,develop,test,review,merge')
    .option('--max-parallel <count>', 'Maximum parallel spawns', '3')
    .option('--delay <ms>', 'Delay between spawns (ms)', '5000')
    .option('--stop-on-failure', 'Stop cascade on first failure')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        steps?: string;
        maxParallel?: string;
        delay?: string;
        stopOnFailure?: boolean;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await cascade({
                steps: options.steps,
                maxParallel: options.maxParallel ? parseInt(options.maxParallel, 10) : undefined,
                delay: options.delay ? parseInt(options.delay, 10) : undefined,
                stopOnFailure: options.stopOnFailure,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// TESTING
// ============================================

program
    .command('harness')
    .description('Run triage in test mode with fixtures or GitHub sandboxes')
    .option('-s, --scenarios <scenarios>', 'Comma-separated scenarios to run')
    .option('-p, --project <number>', 'Use real GitHub project as sandbox')
    .option('-i, --issue <number>', 'Use real issue as sandbox')
    .option('--record', 'Record HTTP interactions for replay')
    .option('--playback', 'Use recorded HTTP interactions')
    .option('-o, --output <dir>', 'Save artifacts to directory')
    .option('-l, --list', 'List available test scenarios')
    .option('--cleanup', 'Clean up all sandbox projects')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        scenarios?: string;
        project?: string;
        issue?: string;
        record?: boolean;
        playback?: boolean;
        output?: string;
        list?: boolean;
        cleanup?: boolean;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await harness({
                scenarios: options.scenarios?.split(',').map((s) => s.trim()),
                projectNumber: options.project ? parseInt(options.project, 10) : undefined,
                issueNumber: options.issue ? parseInt(options.issue, 10) : undefined,
                record: options.record,
                playback: options.playback,
                output: options.output,
                list: options.list,
                cleanup: options.cleanup,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// PR FEEDBACK
// ============================================

program
    .command('feedback')
    .description('Handle PR review feedback - assess, resolve threads, mark ready')
    .argument('<pr>', 'PR number to process feedback for')
    .option('--no-resolve', 'Skip resolving addressed threads')
    .option('--ready-for-review', 'Mark PR as ready for review when done')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (pr: string, options: {
        resolve?: boolean;
        readyForReview?: boolean;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await handleFeedback(parseInt(pr, 10), {
                resolve: options.resolve !== false,
                readyForReview: options.readyForReview,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

// ============================================
// RELEASE MANAGEMENT
// ============================================

program
    .command('release')
    .description('AI-powered release - changelog, semver, tags, npm publish, GitHub release')
    .option('-p, --prerelease <type>', 'Create prerelease (alpha, beta, rc)')
    .option('--skip-changelog', 'Skip AI changelog generation')
    .option('--skip-tag', 'Skip git tag creation')
    .option('--skip-github', 'Skip GitHub release creation')
    .option('--skip-npm', 'Skip npm publish')
    .option('--npm-tag <tag>', 'npm dist-tag (default: latest, or prerelease type)')
    .option('-n, --dry-run', 'Show what would be done without making changes')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options: {
        prerelease?: string;
        skipChangelog?: boolean;
        skipTag?: boolean;
        skipGithub?: boolean;
        skipNpm?: boolean;
        npmTag?: string;
        dryRun?: boolean;
        verbose?: boolean;
    }) => {
        try {
            await releaseCommand({
                prerelease: options.prerelease,
                skipChangelog: options.skipChangelog,
                skipTag: options.skipTag,
                skipGithub: options.skipGithub,
                skipNpm: options.skipNpm,
                npmTag: options.npmTag,
                dryRun: options.dryRun,
                verbose: options.verbose,
            });
        } catch (error) {
            console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
        }
    });

program.parse();
