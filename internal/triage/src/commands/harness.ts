/**
 * Test Harness Command
 *
 * Run triage commands in isolated test environments:
 * - Fixture-based testing (deterministic)
 * - GitHub sandbox testing (real but isolated)
 * - VCR recording/playback
 */

import pc from 'picocolors';
import * as path from 'node:path';
import {
    createTestHarness,
    runTriageTests,
    type TestHarnessOptions,
} from '../execution/test-harness.js';
import {
    FIXTURE_SCENARIOS,
    type FixtureScenario,
} from '../execution/fixtures.js';
import { cleanupAllSandboxes } from '../execution/github-sandbox.js';

export interface HarnessCommandOptions {
    /** Run specific scenarios */
    scenarios?: string[];
    /** Use real GitHub project */
    projectNumber?: number;
    /** Use real issue for sandbox */
    issueNumber?: number;
    /** Recording mode */
    record?: boolean;
    /** Playback mode */
    playback?: boolean;
    /** Output directory for artifacts */
    output?: string;
    /** List available scenarios */
    list?: boolean;
    /** Cleanup sandboxes */
    cleanup?: boolean;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export async function harness(options: HarnessCommandOptions = {}): Promise<void> {
    // List available scenarios
    if (options.list) {
        console.log(pc.bold('\n📋 Available Test Scenarios:\n'));
        for (const [scenario, config] of Object.entries(FIXTURE_SCENARIOS)) {
            console.log(`  ${pc.cyan(scenario)}`);
            console.log(`    ${pc.dim(config.description || 'No description')}`);
        }
        return;
    }

    // Cleanup sandboxes
    if (options.cleanup) {
        console.log(pc.blue('\n🧹 Cleaning up sandboxes...\n'));
        const deleted = await cleanupAllSandboxes(undefined, {
            verbose: options.verbose,
            dryRun: options.dryRun,
        });
        console.log(pc.green(`\n✅ Cleaned up ${deleted} sandboxes`));
        return;
    }

    // Determine scenarios to run
    let scenarios: FixtureScenario[];
    if (options.scenarios && options.scenarios.length > 0) {
        scenarios = options.scenarios as FixtureScenario[];
        // Validate scenarios
        for (const scenario of scenarios) {
            if (!FIXTURE_SCENARIOS[scenario]) {
                console.error(pc.red(`Unknown scenario: ${scenario}`));
                console.log(pc.dim('Use --list to see available scenarios'));
                process.exit(1);
            }
        }
    } else {
        // Run a subset of common scenarios by default
        scenarios = ['bug-report', 'new-feature-request', 'test-coverage-gap'];
    }

    console.log(pc.bold(pc.blue('\n🧪 Triage Test Harness\n')));

    // Determine recording mode
    let recordingMode: 'record' | 'playback' | 'passthrough' = 'passthrough';
    if (options.record) {
        recordingMode = 'record';
        console.log(pc.yellow('📼 Recording mode: HTTP interactions will be saved\n'));
    } else if (options.playback) {
        recordingMode = 'playback';
        console.log(pc.yellow('▶️ Playback mode: Using recorded HTTP interactions\n'));
    }

    // Run fixture-based tests
    if (!options.projectNumber && !options.issueNumber) {
        console.log(pc.dim(`Running ${scenarios.length} fixture scenarios...\n`));

        const allPassed = await runTriageTests(scenarios);

        if (allPassed) {
            console.log(pc.green('\n✅ All tests passed!'));
        } else {
            console.log(pc.red('\n❌ Some tests failed'));
            process.exit(1);
        }
        return;
    }

    // Run with real GitHub sandbox
    const harnessOptions: Partial<TestHarnessOptions> & { name: string } = {
        name: 'manual-test',
        recordingMode,
        verbose: options.verbose ?? true,
        autoCleanup: !options.output, // Don't cleanup if saving output
    };

    if (options.projectNumber) {
        harnessOptions.useProjectSandbox = {
            projectNumber: options.projectNumber,
        };
    }

    if (options.issueNumber) {
        harnessOptions.useIssueSandbox = {
            issueNumber: options.issueNumber,
        };
    }

    const testHarness = createTestHarness(harnessOptions);

    try {
        await testHarness.init();

        // Run assess on the sandboxed issue
        const issueNumber = testHarness.getIssueNumber(options.issueNumber || 1);
        console.log(pc.dim(`Testing with issue #${issueNumber}\n`));

        const result = await testHarness.run('assess', { issue: issueNumber });

        testHarness.printSummary();

        // Save artifacts if output specified
        if (options.output) {
            const artifacts = await testHarness.saveArtifacts(options.output);
            console.log(pc.dim(`\nArtifacts saved to: ${options.output}`));
            for (const artifact of artifacts) {
                console.log(pc.dim(`  - ${path.basename(artifact)}`));
            }
        }

        if (!result.success) {
            process.exit(1);
        }
    } finally {
        await testHarness.cleanup();
    }
}
