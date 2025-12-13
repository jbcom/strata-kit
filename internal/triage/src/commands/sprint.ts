/**
 * Sprint Planning Command
 *
 * Runs weekly sprint planning with automated:
 * - Issue prioritization using weights
 * - Backlog health analysis
 * - Optimal allocation calculation
 * - Milestone creation
 * - Development triggering
 */

import pc from 'picocolors';
import { planSprint, type SprintOptions } from '../planning/sprint.js';

export interface SprintCommandOptions {
    /** Sprint duration in days */
    duration?: number;
    /** Story points capacity */
    capacity?: number;
    /** Sprint name */
    name?: string;
    /** Create GitHub milestone */
    milestone?: boolean;
    /** Trigger development for top issues */
    trigger?: boolean;
    /** Max issues to trigger */
    maxTrigger?: number;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export async function sprint(options: SprintCommandOptions = {}): Promise<void> {
    console.log(pc.bold(pc.blue('🏃 Sprint Planning')));
    console.log();

    const sprintOptions: SprintOptions = {
        duration: options.duration ?? 7,
        capacity: options.capacity ?? 40,
        name: options.name,
        createMilestone: options.milestone ?? true,
        triggerDevelopment: options.trigger ?? false,
        maxTrigger: options.maxTrigger ?? 3,
        dryRun: options.dryRun ?? false,
        verbose: options.verbose ?? false,
    };

    try {
        const plan = await planSprint(sprintOptions);

        console.log();
        console.log(pc.bold('Sprint Summary:'));
        console.log(`  Name: ${plan.name}`);
        console.log(`  Issues: ${plan.issues.length}`);
        console.log(`  Health Score: ${plan.health.score}/100`);

        if (plan.milestoneNumber) {
            console.log(`  Milestone: #${plan.milestoneNumber}`);
        }
    } catch (error) {
        console.error(pc.red(`❌ Sprint planning failed: ${error}`));
        process.exit(1);
    }
}
