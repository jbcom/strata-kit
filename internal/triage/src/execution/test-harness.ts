/**
 * Test Harness
 *
 * Comprehensive test runner that combines:
 * - GitHub Project sandboxes (real data, isolated)
 * - VCR-style HTTP recording/playback
 * - Fixture repositories
 * - Plan-based execution
 * - Automatic verification
 *
 * Usage:
 *   const harness = createTestHarness({ projectNumber: 1 });
 *   await harness.run('assess', { issue: 42 });
 *   const results = harness.verify();
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import pc from 'picocolors';
import {
    createProjectSandbox,
    deleteProjectSandbox,
    copyIssueToSandbox,
    deleteSandboxIssue,
    type SandboxProject,
    type CopiedIssue,
} from './github-sandbox.js';
import {
    generateFromScenario,
    cleanupFixture,
    type FixtureRepo,
    type FixtureScenario,
} from './fixtures.js';
import { createRecorder, type HttpRecorder } from './recorder.js';
import { createSandbox, type Sandbox } from './sandbox.js';
import { createMockMCP, type MockMCPProvider, type VerificationResult } from './mock-mcp.js';
import {
    planAssess,
    planDevelop,
    planReview,
    planTestGeneration,
    validatePlan,
    printPlanSummary,
} from './planner.js';
import { executePlan, type ExecutorOptions } from './executor.js';
import { type ExecutionPlan, serializePlan } from './plan.js';

export interface TestHarnessOptions {
    /** Test name for logging and recordings */
    name: string;

    /** Use real GitHub project sandbox */
    useProjectSandbox?: {
        projectNumber: number;
        owner?: string;
    };

    /** Use real issue sandbox */
    useIssueSandbox?: {
        issueNumber: number;
    };

    /** Use fixture scenario */
    useFixture?: {
        scenario: FixtureScenario;
    };

    /** Recording mode */
    recordingMode?: 'record' | 'playback' | 'passthrough';

    /** Directory for recordings */
    recordingsDir?: string;

    /** Directory for fixtures */
    fixturesDir?: string;

    /** Auto cleanup after test */
    autoCleanup?: boolean;

    /** Verbose output */
    verbose?: boolean;

    /** Save execution plans */
    savePlans?: boolean;
}

export interface TestResult {
    name: string;
    command: string;
    success: boolean;
    plan?: ExecutionPlan;
    verification?: VerificationResult;
    duration: number;
    error?: string;
}

/**
 * Test Harness for triage commands
 */
export class TestHarness {
    private options: TestHarnessOptions;
    private projectSandbox?: SandboxProject;
    private issueSandbox?: CopiedIssue;
    private fixture?: FixtureRepo;
    private mockMCP?: MockMCPProvider;
    private recorder?: HttpRecorder;
    private sandbox?: Sandbox;
    private results: TestResult[] = [];
    private initialized = false;

    constructor(options: TestHarnessOptions) {
        this.options = {
            recordingMode: 'passthrough',
            recordingsDir: path.join(os.tmpdir(), 'triage-recordings'),
            fixturesDir: path.join(os.tmpdir(), 'triage-fixtures'),
            autoCleanup: true,
            verbose: false,
            savePlans: true,
            ...options,
        };
    }

    /**
     * Initialize the test environment
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        if (this.options.verbose) {
            console.log(pc.blue(`\n🧪 Initializing test harness: ${this.options.name}`));
        }

        // Setup GitHub project sandbox
        if (this.options.useProjectSandbox) {
            if (this.options.verbose) {
                console.log(pc.dim('  Creating project sandbox...'));
            }
            this.projectSandbox = await createProjectSandbox({
                sourceProject: this.options.useProjectSandbox.projectNumber,
                owner: this.options.useProjectSandbox.owner,
                prefix: '[TEST]',
                verbose: this.options.verbose,
            });
        }

        // Setup issue sandbox
        if (this.options.useIssueSandbox) {
            if (this.options.verbose) {
                console.log(pc.dim('  Creating issue sandbox...'));
            }
            this.issueSandbox = await copyIssueToSandbox(
                this.options.useIssueSandbox.issueNumber
            );
        }

        // Setup fixture repo
        if (this.options.useFixture) {
            if (this.options.verbose) {
                console.log(pc.dim(`  Creating fixture: ${this.options.useFixture.scenario}...`));
            }
            fs.mkdirSync(this.options.fixturesDir!, { recursive: true });
            this.fixture = await generateFromScenario(
                this.options.useFixture.scenario,
                this.options.fixturesDir!
            );
            this.mockMCP = createMockMCP(this.fixture);
        }

        // Setup HTTP recorder
        if (this.options.recordingMode !== 'passthrough') {
            this.recorder = createRecorder(
                this.options.recordingsDir!,
                this.options.recordingMode!
            );
        }

        this.initialized = true;

        if (this.options.verbose) {
            console.log(pc.green('  ✓ Test harness ready\n'));
        }
    }

    /**
     * Run a triage command
     */
    async run(
        command: 'assess' | 'develop' | 'review' | 'generate',
        args: { issue?: number; pr?: number; source?: string }
    ): Promise<TestResult> {
        await this.init();

        const startTime = Date.now();
        const testName = `${command}-${args.issue || args.pr || args.source}`;

        if (this.options.verbose) {
            console.log(pc.blue(`▶ Running: ${testName}`));
        }

        // Start recording if enabled
        if (this.recorder) {
            this.recorder.start(testName);
        }

        try {
            // Generate plan
            const workingDir = this.fixture?.root || process.cwd();
            const plannerOptions = { workingDir, verbose: this.options.verbose };

            let plan: ExecutionPlan;
            switch (command) {
                case 'assess':
                    plan = await planAssess(args.issue!, plannerOptions);
                    break;
                case 'develop':
                    plan = await planDevelop(args.issue!, plannerOptions);
                    break;
                case 'review':
                    plan = await planReview(args.pr!, plannerOptions);
                    break;
                case 'generate':
                    plan = await planTestGeneration(args.source!, plannerOptions);
                    break;
                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            // Validate plan
            validatePlan(plan);

            if (this.options.verbose) {
                printPlanSummary(plan);
            }

            // Execute plan
            const executorOptions: ExecutorOptions = {
                mode: this.fixture ? 'dry-run' : 'live',
                fixture: this.fixture,
                verbose: this.options.verbose,
                savePlan: this.options.savePlans,
                plansDir: path.join(this.options.recordingsDir!, 'plans'),
            };

            const executedPlan = await executePlan(plan, executorOptions);

            // Verify expectations
            let verification: VerificationResult | undefined;
            if (this.mockMCP) {
                verification = this.mockMCP.verifyExpectations();
            }

            const result: TestResult = {
                name: testName,
                command,
                success: executedPlan.result?.status === 'success' && (verification?.passed ?? true),
                plan: executedPlan,
                verification,
                duration: Date.now() - startTime,
            };

            this.results.push(result);

            if (this.options.verbose) {
                if (result.success) {
                    console.log(pc.green(`  ✓ ${testName} passed (${result.duration}ms)`));
                } else {
                    console.log(pc.red(`  ✗ ${testName} failed`));
                    if (verification?.errors) {
                        for (const error of verification.errors) {
                            console.log(pc.red(`    - ${error}`));
                        }
                    }
                }
            }

            return result;
        } catch (error) {
            const result: TestResult = {
                name: testName,
                command,
                success: false,
                duration: Date.now() - startTime,
                error: String(error),
            };

            this.results.push(result);

            if (this.options.verbose) {
                console.log(pc.red(`  ✗ ${testName} error: ${error}`));
            }

            return result;
        } finally {
            // Stop recording
            if (this.recorder) {
                this.recorder.stop();
            }
        }
    }

    /**
     * Get the issue number to use (sandbox or original)
     */
    getIssueNumber(original: number): number {
        return this.issueSandbox?.sandboxNumber || original;
    }

    /**
     * Get all tracked operations from mock MCP
     */
    getOperations() {
        return this.mockMCP?.getOperations() || [];
    }

    /**
     * Get current mock state
     */
    getState() {
        return this.mockMCP?.getState();
    }

    /**
     * Verify all expectations
     */
    verify(): VerificationResult | undefined {
        return this.mockMCP?.verifyExpectations();
    }

    /**
     * Get test results summary
     */
    getSummary(): {
        total: number;
        passed: number;
        failed: number;
        duration: number;
        results: TestResult[];
    } {
        const passed = this.results.filter((r) => r.success).length;
        const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

        return {
            total: this.results.length,
            passed,
            failed: this.results.length - passed,
            duration: totalDuration,
            results: [...this.results],
        };
    }

    /**
     * Print test summary
     */
    printSummary(): void {
        const summary = this.getSummary();

        console.log(pc.blue(`\n📊 Test Summary: ${this.options.name}`));
        console.log(`  Total: ${summary.total}`);
        console.log(pc.green(`  Passed: ${summary.passed}`));
        if (summary.failed > 0) {
            console.log(pc.red(`  Failed: ${summary.failed}`));
        }
        console.log(`  Duration: ${summary.duration}ms`);

        if (summary.failed > 0) {
            console.log(pc.red('\nFailed tests:'));
            for (const result of this.results.filter((r) => !r.success)) {
                console.log(pc.red(`  - ${result.name}: ${result.error || 'verification failed'}`));
            }
        }
    }

    /**
     * Save all plans and recordings
     */
    async saveArtifacts(outputDir: string): Promise<string[]> {
        fs.mkdirSync(outputDir, { recursive: true });
        const artifacts: string[] = [];

        // Save plans
        for (const result of this.results) {
            if (result.plan) {
                const planPath = path.join(outputDir, `${result.name}-plan.json`);
                fs.writeFileSync(planPath, serializePlan(result.plan));
                artifacts.push(planPath);
            }
        }

        // Save summary
        const summaryPath = path.join(outputDir, 'summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(this.getSummary(), null, 2));
        artifacts.push(summaryPath);

        // Save operations log
        if (this.mockMCP) {
            const opsPath = path.join(outputDir, 'operations.json');
            fs.writeFileSync(opsPath, JSON.stringify(this.getOperations(), null, 2));
            artifacts.push(opsPath);
        }

        return artifacts;
    }

    /**
     * Cleanup all resources
     */
    async cleanup(): Promise<void> {
        if (this.options.verbose) {
            console.log(pc.dim('\n🧹 Cleaning up test harness...'));
        }

        if (this.projectSandbox) {
            await deleteProjectSandbox(this.projectSandbox, { verbose: this.options.verbose });
        }

        if (this.issueSandbox) {
            await deleteSandboxIssue(this.issueSandbox);
        }

        if (this.fixture) {
            cleanupFixture(this.fixture);
        }

        if (this.sandbox) {
            this.sandbox.cleanup();
        }

        this.initialized = false;

        if (this.options.verbose) {
            console.log(pc.dim('  ✓ Cleanup complete'));
        }
    }
}

/**
 * Create a test harness with default options
 */
export function createTestHarness(options: Partial<TestHarnessOptions> & { name: string }): TestHarness {
    return new TestHarness(options);
}

/**
 * Run a test with automatic cleanup
 */
export async function withTestHarness<T>(
    options: Partial<TestHarnessOptions> & { name: string },
    fn: (harness: TestHarness) => Promise<T>
): Promise<T> {
    const harness = createTestHarness(options);

    try {
        return await fn(harness);
    } finally {
        await harness.cleanup();
    }
}

/**
 * Example test runner
 */
export async function runTriageTests(scenarios: FixtureScenario[]): Promise<boolean> {
    console.log(pc.bold(pc.blue('\n🧪 Running Triage Test Suite\n')));

    let allPassed = true;

    for (const scenario of scenarios) {
        const harness = createTestHarness({
            name: `test-${scenario}`,
            useFixture: { scenario },
            verbose: true,
            autoCleanup: true,
        });

        try {
            await harness.init();

            // Run assess on issue 42 (from fixture)
            const result = await harness.run('assess', { issue: 42 });

            if (!result.success) {
                allPassed = false;
            }

            harness.printSummary();
        } finally {
            await harness.cleanup();
        }
    }

    return allPassed;
}
