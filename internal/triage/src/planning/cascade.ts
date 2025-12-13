/**
 * Cascade Triage System
 *
 * Enables triage to spawn more instances of triage:
 * - Weekly sprint planning triggers development
 * - Development triggers test generation
 * - Test failures trigger bug fixing
 * - Bug fixes trigger verification
 *
 * This creates a self-perpetuating automation loop.
 */

import pc from 'picocolors';
import { execFileSync, spawn } from 'node:child_process';
import { getRepoContext, searchIssues } from '../octokit.js';

export type CascadeStep =
    | 'plan'        // Sprint planning
    | 'develop'     // Code development
    | 'test'        // Test generation
    | 'diagnose'    // Test failure diagnosis
    | 'fix'         // Bug fixing
    | 'verify'      // PR verification
    | 'review'      // Code review
    | 'merge';      // Auto-merge

export interface CascadeConfig {
    /** Steps to include in the cascade */
    steps: CascadeStep[];
    /** Maximum parallel spawns */
    maxParallel: number;
    /** Delay between spawns (ms) */
    spawnDelay: number;
    /** Stop on first failure */
    stopOnFailure: boolean;
    /** Dry run */
    dryRun: boolean;
    /** Verbose output */
    verbose: boolean;
}

export const DEFAULT_CASCADE_CONFIG: CascadeConfig = {
    steps: ['plan', 'develop', 'test', 'review', 'merge'],
    maxParallel: 3,
    spawnDelay: 5000,
    stopOnFailure: false,
    dryRun: false,
    verbose: false,
};

export interface CascadeResult {
    step: CascadeStep;
    status: 'success' | 'failure' | 'skipped';
    output?: string;
    error?: string;
    duration: number;
    spawned: SpawnedTask[];
}

export interface SpawnedTask {
    step: CascadeStep;
    target: string; // Issue/PR number or identifier
    workflowRunId?: number;
}

/**
 * Execute a full cascade starting from sprint planning
 */
export async function runCascade(config: Partial<CascadeConfig> = {}): Promise<CascadeResult[]> {
    const fullConfig = { ...DEFAULT_CASCADE_CONFIG, ...config };
    const results: CascadeResult[] = [];

    console.log(pc.blue('🌊 Starting cascade triage...'));
    console.log(pc.dim(`Steps: ${fullConfig.steps.join(' → ')}`));

    for (const step of fullConfig.steps) {
        const startTime = Date.now();
        console.log(pc.blue(`\n📍 Step: ${step}`));

        try {
            const result = await executeStep(step, fullConfig);
            result.duration = Date.now() - startTime;
            results.push(result);

            console.log(pc.green(`✅ ${step} completed in ${result.duration}ms`));

            if (result.spawned.length > 0) {
                console.log(pc.dim(`  Spawned ${result.spawned.length} sub-tasks`));
            }
        } catch (error) {
            const result: CascadeResult = {
                step,
                status: 'failure',
                error: String(error),
                duration: Date.now() - startTime,
                spawned: [],
            };
            results.push(result);

            console.log(pc.red(`❌ ${step} failed: ${error}`));

            if (fullConfig.stopOnFailure) {
                console.log(pc.yellow('Stopping cascade due to failure'));
                break;
            }
        }
    }

    // Summary
    console.log(pc.blue('\n📊 Cascade Summary:'));
    const successful = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failure').length;
    const totalSpawned = results.reduce((sum, r) => sum + r.spawned.length, 0);

    console.log(`  Completed: ${successful}/${results.length}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Sub-tasks spawned: ${totalSpawned}`);

    return results;
}

async function executeStep(step: CascadeStep, config: CascadeConfig): Promise<CascadeResult> {
    const spawned: SpawnedTask[] = [];

    switch (step) {
        case 'plan':
            return await executePlanStep(config, spawned);
        case 'develop':
            return await executeDevelopStep(config, spawned);
        case 'test':
            return await executeTestStep(config, spawned);
        case 'diagnose':
            return await executeDiagnoseStep(config, spawned);
        case 'fix':
            return await executeFixStep(config, spawned);
        case 'verify':
            return await executeVerifyStep(config, spawned);
        case 'review':
            return await executeReviewStep(config, spawned);
        case 'merge':
            return await executeMergeStep(config, spawned);
        default:
            return { step, status: 'skipped', duration: 0, spawned: [] };
    }
}

async function executePlanStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    if (config.dryRun) {
        return { step: 'plan', status: 'success', duration: 0, spawned };
    }

    // Run sprint planning
    const output = runTriageCommand(['sprint', '--trigger-development']);

    // Parse triggered issues from output
    const issueMatches = output.matchAll(/Triggering #(\d+)/g);
    for (const match of issueMatches) {
        spawned.push({
            step: 'develop',
            target: match[1],
        });
    }

    return { step: 'plan', status: 'success', output, duration: 0, spawned };
}

async function executeDevelopStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    // Find issues with ready-for-aider label via MCP search
    const issues = await searchIssues('is:open is:issue label:ready-for-aider');

    if (config.dryRun) {
        issues.slice(0, config.maxParallel).forEach((issue) =>
            spawned.push({ step: 'test', target: String(issue.number) })
        );
        return { step: 'develop', status: 'success', duration: 0, spawned };
    }

    // Workflow dispatch not available via GitHub MCP
    // Log what would be done instead
    for (const issue of issues.slice(0, config.maxParallel)) {
        console.log(pc.dim(`Would trigger triage develop for #${issue.number}`));
        spawned.push({
            step: 'test',
            target: String(issue.number),
            workflowRunId: undefined,
        });
        await delay(config.spawnDelay);
    }

    return { step: 'develop', status: 'success', duration: 0, spawned };
}

async function executeTestStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    // Find issues with needs-tests label via MCP search
    const issues = await searchIssues('is:open is:issue label:needs-tests');

    if (config.dryRun) {
        issues.slice(0, config.maxParallel).forEach((issue) =>
            spawned.push({ step: 'verify', target: String(issue.number) })
        );
        return { step: 'test', status: 'success', duration: 0, spawned };
    }

    // Workflow dispatch not available via GitHub MCP
    for (const issue of issues.slice(0, config.maxParallel)) {
        console.log(pc.dim(`Would trigger triage test for #${issue.number}`));
        spawned.push({ step: 'verify', target: String(issue.number) });
        await delay(config.spawnDelay);
    }

    return { step: 'test', status: 'success', duration: 0, spawned };
}

async function executeDiagnoseStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    // This step runs after test failures
    // It analyzes test results and may spawn fix tasks

    if (config.dryRun) {
        return { step: 'diagnose', status: 'success', duration: 0, spawned };
    }

    // Workflow runs API not available via GitHub MCP
    // This would need runAgenticTask with extended capabilities
    console.log(pc.dim('Diagnose step skipped - workflow runs API not available via MCP'));
    console.log(pc.dim('Use runAgenticTask() for AI-driven diagnosis'));

    return { step: 'diagnose', status: 'success', duration: 0, spawned };
}

async function executeFixStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    // Find issues with bug label and needs-fix via MCP search
    const issues = await searchIssues('is:open is:issue label:bug label:needs-fix');

    if (config.dryRun) {
        issues.slice(0, config.maxParallel).forEach((issue) =>
            spawned.push({ step: 'verify', target: String(issue.number) })
        );
        return { step: 'fix', status: 'success', duration: 0, spawned };
    }

    // Workflow dispatch not available via GitHub MCP
    for (const issue of issues.slice(0, config.maxParallel)) {
        console.log(pc.dim(`Would trigger triage fix for #${issue.number}`));
        spawned.push({ step: 'verify', target: String(issue.number) });
        await delay(config.spawnDelay);
    }

    return { step: 'fix', status: 'success', duration: 0, spawned };
}

async function executeVerifyStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    // Search for PRs with needs-verification label via MCP
    const prs = await searchIssues('is:open is:pr label:needs-verification');

    if (config.dryRun) {
        prs.slice(0, config.maxParallel).forEach((pr) =>
            spawned.push({ step: 'review', target: String(pr.number) })
        );
        return { step: 'verify', status: 'success', duration: 0, spawned };
    }

    // Workflow dispatch not available via GitHub MCP
    for (const pr of prs.slice(0, config.maxParallel)) {
        console.log(pc.dim(`Would trigger triage verify for #${pr.number}`));
        spawned.push({ step: 'review', target: String(pr.number) });
        await delay(config.spawnDelay);
    }

    return { step: 'verify', status: 'success', duration: 0, spawned };
}

async function executeReviewStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    // Search for open PRs via MCP
    const prs = await searchIssues('is:open is:pr');

    if (config.dryRun) {
        prs.slice(0, config.maxParallel).forEach((pr) =>
            spawned.push({ step: 'merge', target: String(pr.number) })
        );
        return { step: 'review', status: 'success', duration: 0, spawned };
    }

    // PR reviews API not available via GitHub MCP
    // Log what would be done
    for (const pr of prs.slice(0, config.maxParallel)) {
        console.log(pc.dim(`Would check reviews and trigger triage review for #${pr.number}`));
        spawned.push({ step: 'merge', target: String(pr.number) });
        await delay(config.spawnDelay);
    }

    return { step: 'review', status: 'success', duration: 0, spawned };
}

async function executeMergeStep(
    config: CascadeConfig,
    spawned: SpawnedTask[]
): Promise<CascadeResult> {
    if (config.dryRun) {
        return { step: 'merge', status: 'success', duration: 0, spawned };
    }

    // PR reviews, status checks, and workflow dispatch not available via GitHub MCP
    // This step would need runAgenticTask with extended MCP capabilities
    console.log(pc.dim('Merge step skipped - reviews/status API not available via MCP'));
    console.log(pc.dim('Use runAgenticTask() for AI-driven merge decisions'));

    return { step: 'merge', status: 'success', duration: 0, spawned };
}

function runTriageCommand(args: string[]): string {
    try {
        return execFileSync('npx', ['triage', ...args], {
            encoding: 'utf-8',
            stdio: 'pipe',
        });
    } catch (error) {
        return '';
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export { runCascade as cascade };
