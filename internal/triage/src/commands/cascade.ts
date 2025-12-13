/**
 * Cascade Command
 *
 * Runs a full cascade of triage operations:
 * plan → develop → test → diagnose → fix → verify → review → merge
 *
 * Each step can spawn additional triage instances.
 */

import pc from 'picocolors';
import {
    runCascade,
    type CascadeConfig,
    type CascadeStep,
    DEFAULT_CASCADE_CONFIG,
} from '../planning/cascade.js';

export interface CascadeCommandOptions {
    /** Steps to include (comma-separated) */
    steps?: string;
    /** Maximum parallel spawns */
    maxParallel?: number;
    /** Delay between spawns (ms) */
    delay?: number;
    /** Stop on first failure */
    stopOnFailure?: boolean;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

const VALID_STEPS: CascadeStep[] = [
    'plan',
    'develop',
    'test',
    'diagnose',
    'fix',
    'verify',
    'review',
    'merge',
];

export async function cascade(options: CascadeCommandOptions = {}): Promise<void> {
    console.log(pc.bold(pc.blue('🌊 Cascade Triage')));
    console.log();

    // Parse steps
    let steps: CascadeStep[] = DEFAULT_CASCADE_CONFIG.steps;
    if (options.steps) {
        const requested = options.steps.split(',').map((s) => s.trim() as CascadeStep);
        const invalid = requested.filter((s) => !VALID_STEPS.includes(s));
        if (invalid.length > 0) {
            console.error(pc.red(`Invalid steps: ${invalid.join(', ')}`));
            console.error(pc.dim(`Valid steps: ${VALID_STEPS.join(', ')}`));
            process.exit(1);
        }
        steps = requested;
    }

    const config: Partial<CascadeConfig> = {
        steps,
        maxParallel: options.maxParallel ?? 3,
        spawnDelay: options.delay ?? 5000,
        stopOnFailure: options.stopOnFailure ?? false,
        dryRun: options.dryRun ?? false,
        verbose: options.verbose ?? false,
    };

    console.log(pc.dim(`Steps: ${steps.join(' → ')}`));
    console.log();

    try {
        const results = await runCascade(config);

        // Final summary
        console.log();
        console.log(pc.bold('Cascade Complete:'));

        const success = results.filter((r) => r.status === 'success').length;
        const failed = results.filter((r) => r.status === 'failure').length;
        const totalSpawned = results.reduce((sum, r) => sum + r.spawned.length, 0);

        console.log(`  ✅ Successful: ${success}`);
        if (failed > 0) {
            console.log(`  ❌ Failed: ${failed}`);
        }
        console.log(`  🔄 Sub-tasks spawned: ${totalSpawned}`);

        if (failed > 0) {
            process.exit(1);
        }
    } catch (error) {
        console.error(pc.red(`❌ Cascade failed: ${error}`));
        process.exit(1);
    }
}
