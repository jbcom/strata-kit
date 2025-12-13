/**
 * Plan Executor
 *
 * Executes structured plans with support for:
 * - Live execution (real APIs)
 * - Recorded execution (VCR playback)
 * - Sandbox execution (fixture repos)
 * - Plan-only mode (no execution)
 */

import pc from 'picocolors';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generate, generateWithTools } from '../ai.js';
import { createInlineFilesystemClient, getFilesystemTools } from '../mcp.js';
import {
    type ExecutionPlan,
    type PlanStep,
    type StepResult,
    type ExecutionResult,
    type ExecutionMode,
} from './plan.js';
import { HttpRecorder, createRecorder } from './recorder.js';
import { Sandbox, createSandbox } from './sandbox.js';
import { MockMCPProvider, createMockMCP } from './mock-mcp.js';
import { type FixtureRepo } from './fixtures.js';

export interface ExecutorOptions {
    /** Execution mode */
    mode: ExecutionMode;
    /** Directory for VCR recordings */
    recordingsDir?: string;
    /** Fixture repo for sandbox mode */
    fixture?: FixtureRepo;
    /** Verbose output */
    verbose?: boolean;
    /** Stop on first error */
    stopOnError?: boolean;
    /** Save plan after execution */
    savePlan?: boolean;
    /** Directory to save plans */
    plansDir?: string;
}

/**
 * Execute a plan
 */
export async function executePlan(
    plan: ExecutionPlan,
    options: ExecutorOptions
): Promise<ExecutionPlan> {
    const startTime = new Date();
    plan.mode = options.mode;

    if (options.verbose) {
        console.log(pc.blue(`\n🚀 Executing plan: ${plan.id}`));
        console.log(pc.dim(`Mode: ${plan.mode}`));
        console.log(pc.dim(`Steps: ${plan.steps.length}`));
    }

    // Setup execution environment
    const env = await setupEnvironment(plan, options);

    let stepsCompleted = 0;
    let stepsFailed = 0;
    let stepsSkipped = 0;
    let totalTokensUsed = 0;
    const artifacts: string[] = [];

    // Build dependency graph
    const completed = new Set<string>();
    const failed = new Set<string>();

    // Execute steps in dependency order
    for (const step of plan.steps) {
        // Check if dependencies are satisfied
        const depsReady = step.dependsOn.every((dep) => completed.has(dep));
        const depsFailed = step.dependsOn.some((dep) => failed.has(dep));

        if (depsFailed) {
            step.result = {
                status: 'skipped',
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                error: 'Dependency failed',
            };
            stepsSkipped++;
            continue;
        }

        if (!depsReady) {
            // This shouldn't happen with proper ordering
            step.result = {
                status: 'skipped',
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                error: 'Dependencies not ready',
            };
            stepsSkipped++;
            continue;
        }

        if (options.verbose) {
            console.log(pc.dim(`\n  → ${step.id}: ${step.description}`));
        }

        try {
            const result = await executeStep(step, plan, env, options);
            step.result = result;

            if (result.status === 'success') {
                completed.add(step.id);
                stepsCompleted++;
                totalTokensUsed += result.tokensUsed || 0;

                if (options.verbose) {
                    console.log(pc.green(`    ✓ Complete`));
                }
            } else {
                failed.add(step.id);
                stepsFailed++;

                if (options.verbose) {
                    console.log(pc.red(`    ✗ Failed: ${result.error}`));
                }

                if (options.stopOnError) {
                    break;
                }
            }
        } catch (error) {
            step.result = {
                status: 'failure',
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                error: String(error),
            };
            failed.add(step.id);
            stepsFailed++;

            if (options.verbose) {
                console.log(pc.red(`    ✗ Error: ${error}`));
            }

            if (options.stopOnError) {
                break;
            }
        }
    }

    // Cleanup environment
    await cleanupEnvironment(env);

    // Set execution result
    plan.result = {
        status: stepsFailed === 0 ? 'success' : stepsCompleted > 0 ? 'partial' : 'failure',
        startedAt: startTime.toISOString(),
        completedAt: new Date().toISOString(),
        stepsCompleted,
        stepsFailed,
        stepsSkipped,
        totalTokensUsed,
        artifacts,
    };

    // Save plan if requested
    if (options.savePlan && options.plansDir) {
        const planPath = path.join(options.plansDir, `${plan.id}.json`);
        fs.mkdirSync(options.plansDir, { recursive: true });
        fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
        artifacts.push(planPath);

        if (options.verbose) {
            console.log(pc.dim(`\nPlan saved: ${planPath}`));
        }
    }

    if (options.verbose) {
        console.log(pc.blue(`\n📊 Execution Complete`));
        console.log(`  Status: ${plan.result.status}`);
        console.log(`  Completed: ${stepsCompleted}/${plan.steps.length}`);
        console.log(`  Tokens used: ${totalTokensUsed}`);
    }

    return plan;
}

interface ExecutionEnvironment {
    mode: ExecutionMode;
    recorder?: HttpRecorder;
    sandbox?: Sandbox;
    mockMCP?: MockMCPProvider;
    workingDir: string;
}

async function setupEnvironment(
    plan: ExecutionPlan,
    options: ExecutorOptions
): Promise<ExecutionEnvironment> {
    const env: ExecutionEnvironment = {
        mode: options.mode,
        workingDir: plan.context.workingDirectory,
    };

    switch (options.mode) {
        case 'recorded':
            // Setup VCR recorder in playback mode
            env.recorder = createRecorder(
                options.recordingsDir || '.triage-recordings',
                'playback'
            );
            env.recorder.start(plan.id);
            break;

        case 'dry-run':
            // Record new interactions
            env.recorder = createRecorder(
                options.recordingsDir || '.triage-recordings',
                'record'
            );
            env.recorder.start(plan.id);

            // Setup sandbox filesystem
            if (options.fixture) {
                env.mockMCP = createMockMCP(options.fixture);
                env.workingDir = options.fixture.root;
            } else {
                env.sandbox = createSandbox(plan.context.workingDirectory);
                env.workingDir = await env.sandbox.init();
            }
            break;

        case 'plan-only':
            // No setup needed
            break;

        case 'live':
        default:
            // No special setup for live mode
            break;
    }

    return env;
}

async function cleanupEnvironment(env: ExecutionEnvironment): Promise<void> {
    if (env.recorder) {
        env.recorder.stop();
    }
    if (env.sandbox) {
        env.sandbox.cleanup();
    }
}

async function executeStep(
    step: PlanStep,
    plan: ExecutionPlan,
    env: ExecutionEnvironment,
    options: ExecutorOptions
): Promise<StepResult> {
    const startedAt = new Date().toISOString();

    if (env.mode === 'plan-only') {
        return {
            status: 'skipped',
            startedAt,
            completedAt: new Date().toISOString(),
            output: 'Plan-only mode',
        };
    }

    try {
        const output = await executeStepByType(step, env, options);

        return {
            status: 'success',
            startedAt,
            completedAt: new Date().toISOString(),
            output,
            tokensUsed: step.estimatedTokens, // Actual would come from AI response
        };
    } catch (error) {
        return {
            status: 'failure',
            startedAt,
            completedAt: new Date().toISOString(),
            error: String(error),
        };
    }
}

async function executeStepByType(
    step: PlanStep,
    env: ExecutionEnvironment,
    options: ExecutorOptions
): Promise<unknown> {
    const config = step.config;

    switch (config.type) {
        case 'ai-generate': {
            const result = await generate(config.userPrompt, {
                systemPrompt: config.systemPrompt,
                maxTokens: config.maxTokens,
            });
            return result;
        }

        case 'ai-tool-call': {
            // Get tools based on mode
            let tools: Record<string, unknown>;
            if (env.mockMCP) {
                // Convert MockTool to generic record
                const mockTools = env.mockMCP.getTools();
                tools = Object.fromEntries(
                    Object.entries(mockTools).map(([name, tool]) => [name, {
                        description: `${tool.category} operation: ${name}`,
                        execute: tool.execute,
                    }])
                );
            } else {
                // Create MCP client for the working directory
                const mcpClient = await createInlineFilesystemClient(env.workingDir);
                tools = await getFilesystemTools(mcpClient) as Record<string, unknown>;
            }

            const result = await generateWithTools(config.userPrompt, tools, {
                systemPrompt: config.systemPrompt,
            });
            return result;
        }

        case 'file-read': {
            if (env.mockMCP) {
                return env.mockMCP.getTools().read_file.execute({ path: config.path });
            }
            if (env.sandbox) {
                return env.sandbox.readFile(config.path);
            }
            return fs.readFileSync(path.join(env.workingDir, config.path), 'utf-8');
        }

        case 'file-write': {
            if (env.mockMCP) {
                return env.mockMCP.getTools().write_file.execute({
                    path: config.path,
                    content: config.content,
                });
            }
            if (env.sandbox) {
                env.sandbox.writeFile(config.path, config.content);
                return { success: true };
            }
            const fullPath = path.join(env.workingDir, config.path);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, config.content, 'utf-8');
            return { success: true };
        }

        case 'file-delete': {
            if (env.mockMCP) {
                return env.mockMCP.getTools().delete_file.execute({ path: config.path });
            }
            if (env.sandbox) {
                env.sandbox.deleteFile(config.path);
                return { success: true };
            }
            fs.unlinkSync(path.join(env.workingDir, config.path));
            return { success: true };
        }

        case 'git-operation': {
            const args = [config.operation, ...config.args];
            if (env.mockMCP) {
                const gitTool = env.mockMCP.getTools()[`git_${config.operation}`];
                if (gitTool) {
                    return gitTool.execute({ args: config.args });
                }
            }
            const output = execFileSync('git', args, {
                cwd: env.workingDir,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            return output;
        }

        case 'github-api': {
            if (env.mockMCP) {
                // Route to mock GitHub tools
                const tool = env.mockMCP.getTools().github_get_issue;
                if (tool && config.endpoint.includes('/issues/')) {
                    const match = config.endpoint.match(/\/issues\/(\d+)/);
                    if (match) {
                        return tool.execute({ number: parseInt(match[1]) });
                    }
                }
            }
            // Live GitHub API calls would go through octokit
            return { mock: true, endpoint: config.endpoint };
        }

        case 'shell-command': {
            if (env.mode === 'dry-run' || env.mode === 'recorded') {
                return { skipped: true, command: config.command };
            }
            const output = execFileSync(config.command, config.args, {
                cwd: config.cwd || env.workingDir,
                encoding: 'utf-8',
                timeout: config.timeout,
            });
            return output;
        }

        case 'http-request': {
            const response = await fetch(config.url, {
                method: config.method,
                headers: config.headers,
                body: config.body ? JSON.stringify(config.body) : undefined,
            });
            return response.json();
        }

        case 'wait': {
            await new Promise((resolve) => setTimeout(resolve, config.duration));
            return { waited: config.duration };
        }

        case 'condition':
        case 'aggregate':
            // These are control flow, handled by executor
            return { type: config.type };

        default:
            throw new Error(`Unknown step type: ${(config as { type: string }).type}`);
    }
}

/**
 * Execute a plan with automatic fixture detection
 */
export async function executeWithFixture(
    plan: ExecutionPlan,
    fixture: FixtureRepo,
    options: Partial<ExecutorOptions> = {}
): Promise<{ plan: ExecutionPlan; verification: unknown }> {
    const executorOptions: ExecutorOptions = {
        mode: 'dry-run',
        fixture,
        verbose: options.verbose ?? false,
        stopOnError: options.stopOnError ?? false,
        savePlan: true,
        plansDir: path.join(fixture.root, '.triage-plans'),
        ...options,
    };

    const executedPlan = await executePlan(plan, executorOptions);

    // Verify expectations
    const mockMCP = createMockMCP(fixture);
    const verification = mockMCP.verifyExpectations();

    return { plan: executedPlan, verification };
}
