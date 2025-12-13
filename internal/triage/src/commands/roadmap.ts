/**
 * Roadmap Generation Command
 *
 * Creates AI-powered roadmap with:
 * - Quarterly objectives
 * - Themed feature groupings
 * - Key deliverables
 */

import pc from 'picocolors';
import { generateRoadmap, type RoadmapOptions } from '../planning/roadmap.js';

export interface RoadmapCommandOptions {
    /** Number of quarters to plan */
    quarters?: number;
    /** Include completed work */
    includeCompleted?: boolean;
    /** Update GitHub project */
    updateProject?: boolean;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export async function roadmap(options: RoadmapCommandOptions = {}): Promise<void> {
    console.log(pc.bold(pc.blue('🗺️ Roadmap Generation')));
    console.log();

    const roadmapOptions: RoadmapOptions = {
        quarters: options.quarters ?? 2,
        includeCompleted: options.includeCompleted ?? false,
        updateProject: options.updateProject ?? false,
        dryRun: options.dryRun ?? false,
        verbose: options.verbose ?? false,
    };

    try {
        const result = await generateRoadmap(roadmapOptions);

        console.log();
        console.log(pc.bold('Roadmap Summary:'));
        console.log(`  Quarters: ${result.quarters.length}`);
        console.log(`  Generated: ${result.generatedAt}`);
    } catch (error) {
        console.error(pc.red(`❌ Roadmap generation failed: ${error}`));
        process.exit(1);
    }
}
