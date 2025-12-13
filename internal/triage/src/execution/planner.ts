/**
 * Execution Planner
 *
 * Generates structured JSON plans before execution:
 * - Analyzes the request
 * - Determines required steps
 * - Estimates token costs
 * - Suggests splits if needed
 *
 * Plans can be:
 * - Reviewed before execution
 * - Saved for replay
 * - Split across multiple runs
 */

import pc from 'picocolors';
import { generate } from '../ai.js';
import { getIssue, getPullRequest } from '../github.js';
import {
    type ExecutionPlan,
    type PlanStep,
    type PlanContext,
    type PlanTrigger,
    type StepConfig,
    createPlan,
    addStep,
    serializePlan,
} from './plan.js';
import {
    estimateTokens,
    estimateStepTokens,
    estimateCost,
    analyzePlanForSplitting,
} from './tokenizer.js';

const PLANNING_PROMPT = `You are a planning assistant that creates execution plans for development tasks.

Given a task description, create a detailed plan with specific steps.

Each step should have:
- type: The kind of operation (file-read, file-write, ai-generate, git-operation, github-api, etc.)
- description: What this step accomplishes
- dependencies: Which steps must complete first

Output a JSON array of steps.

Example:
[
  { "type": "file-read", "path": "src/index.ts", "description": "Read current implementation" },
  { "type": "ai-generate", "prompt": "Fix the bug in this code", "description": "Generate fix" },
  { "type": "file-write", "path": "src/index.ts", "description": "Apply the fix" },
  { "type": "git-operation", "operation": "commit", "description": "Commit changes" }
]`;

export interface PlannerOptions {
    /** Working directory */
    workingDir: string;
    /** Owner/repo */
    owner?: string;
    repo?: string;
    /** Maximum tokens per execution */
    maxTokensPerExecution?: number;
    /** Auto-split large plans */
    autoSplit?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

/**
 * Create a plan for assessing an issue
 */
export async function planAssess(
    issueNumber: number,
    options: PlannerOptions
): Promise<ExecutionPlan> {
    const issue = getIssue(issueNumber);

    const trigger: PlanTrigger = {
        type: 'issue',
        source: 'assess-command',
        issueNumber,
    };

    const context: PlanContext = {
        owner: options.owner || '',
        repo: options.repo || '',
        workingDirectory: options.workingDir,
        environment: {},
    };

    const plan = createPlan(trigger, context);

    // Step 1: Analyze issue content
    addStep(plan, {
        type: 'ai-generate',
        description: 'Analyze issue for type and priority',
        config: {
            type: 'ai-generate',
            systemPrompt: 'You are a triage assistant. Analyze issues and determine type and priority.',
            userPrompt: `Analyze this issue:\n\nTitle: ${issue.title}\n\nBody: ${issue.body}`,
            maxTokens: 500,
        },
        dependsOn: [],
        estimatedTokens: estimateTokens(issue.body) + 500,
        parallelizable: false,
    });

    // Step 2: Add labels
    addStep(plan, {
        type: 'github-api',
        description: 'Add labels based on analysis',
        config: {
            type: 'github-api',
            method: 'POST',
            endpoint: `/repos/{owner}/{repo}/issues/${issueNumber}/labels`,
            body: { labels: [] }, // Filled at runtime
        },
        dependsOn: ['step-1'],
        estimatedTokens: 0,
        parallelizable: false,
    });

    // Step 3: Add comment
    addStep(plan, {
        type: 'github-api',
        description: 'Add triage comment',
        config: {
            type: 'github-api',
            method: 'POST',
            endpoint: `/repos/{owner}/{repo}/issues/${issueNumber}/comments`,
            body: { body: '' }, // Filled at runtime
        },
        dependsOn: ['step-1'],
        estimatedTokens: 0,
        parallelizable: true,
    });

    // Calculate estimates
    updatePlanEstimates(plan);

    return plan;
}

/**
 * Create a plan for developing an issue
 */
export async function planDevelop(
    issueNumber: number,
    options: PlannerOptions
): Promise<ExecutionPlan> {
    const issue = getIssue(issueNumber);

    const trigger: PlanTrigger = {
        type: 'issue',
        source: 'develop-command',
        issueNumber,
    };

    const context: PlanContext = {
        owner: options.owner || '',
        repo: options.repo || '',
        workingDirectory: options.workingDir,
        environment: {},
    };

    const plan = createPlan(trigger, context);

    // Step 1: Understand the codebase
    addStep(plan, {
        type: 'file-read',
        description: 'Read project structure',
        config: {
            type: 'file-read',
            path: '.',
        },
        dependsOn: [],
        estimatedTokens: 100,
        parallelizable: true,
    });

    // Step 2: Analyze issue and plan implementation
    addStep(plan, {
        type: 'ai-generate',
        description: 'Plan implementation approach',
        config: {
            type: 'ai-generate',
            systemPrompt: 'You are a developer. Plan how to implement this feature/fix.',
            userPrompt: `Issue: ${issue.title}\n\n${issue.body}\n\nPlan the implementation.`,
            maxTokens: 1000,
        },
        dependsOn: ['step-1'],
        estimatedTokens: estimateTokens(issue.body) + 1000,
        parallelizable: false,
    });

    // Step 3: Implement with tools
    addStep(plan, {
        type: 'ai-tool-call',
        description: 'Implement changes using filesystem tools',
        config: {
            type: 'ai-tool-call',
            systemPrompt: 'You are a developer. Implement the planned changes.',
            userPrompt: 'Implement the changes based on the plan.',
            tools: ['read_file', 'write_file', 'list_files', 'search_files'],
            maxSteps: 10,
        },
        dependsOn: ['step-2'],
        estimatedTokens: 5000,
        parallelizable: false,
    });

    // Step 4: Git operations
    addStep(plan, {
        type: 'git-operation',
        description: 'Stage and commit changes',
        config: {
            type: 'git-operation',
            operation: 'commit',
            args: ['-m', `feat: implement #${issueNumber}`],
        },
        dependsOn: ['step-3'],
        estimatedTokens: 0,
        parallelizable: false,
    });

    // Step 5: Create PR
    addStep(plan, {
        type: 'github-api',
        description: 'Create pull request',
        config: {
            type: 'github-api',
            method: 'POST',
            endpoint: '/repos/{owner}/{repo}/pulls',
            body: {
                title: `[AI] ${issue.title}`,
                body: `Fixes #${issueNumber}`,
                head: `feature/ai-${issueNumber}`,
                base: 'main',
            },
        },
        dependsOn: ['step-4'],
        estimatedTokens: 0,
        parallelizable: false,
    });

    updatePlanEstimates(plan);

    // Check if plan needs splitting
    const splitAnalysis = analyzePlanForSplitting(plan.steps);
    if (splitAnalysis.shouldSplit && options.verbose) {
        console.log(pc.yellow(`Plan may need splitting: ${splitAnalysis.reason}`));
    }

    return plan;
}

/**
 * Create a plan for reviewing a PR
 */
export async function planReview(
    prNumber: number,
    options: PlannerOptions
): Promise<ExecutionPlan> {
    const pr = getPullRequest(prNumber);

    const trigger: PlanTrigger = {
        type: 'pr',
        source: 'review-command',
        prNumber,
    };

    const context: PlanContext = {
        owner: options.owner || '',
        repo: options.repo || '',
        workingDirectory: options.workingDir,
        environment: {},
    };

    const plan = createPlan(trigger, context);

    // Step 1: Get PR diff
    addStep(plan, {
        type: 'github-api',
        description: 'Fetch PR diff',
        config: {
            type: 'github-api',
            method: 'GET',
            endpoint: `/repos/{owner}/{repo}/pulls/${prNumber}`,
        },
        dependsOn: [],
        estimatedTokens: 100,
        parallelizable: true,
    });

    // Step 2: Analyze changes
    addStep(plan, {
        type: 'ai-generate',
        description: 'Review code changes',
        config: {
            type: 'ai-generate',
            systemPrompt: 'You are a code reviewer. Review these changes for bugs, style, and best practices.',
            userPrompt: `Review this PR:\n\n${pr.title}\n\n${pr.body}`,
            maxTokens: 2000,
        },
        dependsOn: ['step-1'],
        estimatedTokens: 3000,
        parallelizable: false,
    });

    // Step 3: Post review comment
    addStep(plan, {
        type: 'github-api',
        description: 'Post review comment',
        config: {
            type: 'github-api',
            method: 'POST',
            endpoint: `/repos/{owner}/{repo}/issues/${prNumber}/comments`,
            body: { body: '' },
        },
        dependsOn: ['step-2'],
        estimatedTokens: 0,
        parallelizable: false,
    });

    updatePlanEstimates(plan);

    return plan;
}

/**
 * Create a plan for test generation
 */
export async function planTestGeneration(
    sourceFile: string,
    options: PlannerOptions
): Promise<ExecutionPlan> {
    const trigger: PlanTrigger = {
        type: 'manual',
        source: 'generate-command',
        command: 'generate',
    };

    const context: PlanContext = {
        owner: options.owner || '',
        repo: options.repo || '',
        workingDirectory: options.workingDir,
        environment: {},
    };

    const plan = createPlan(trigger, context);

    // Step 1: Read source file
    addStep(plan, {
        type: 'file-read',
        description: `Read source file: ${sourceFile}`,
        config: {
            type: 'file-read',
            path: sourceFile,
        },
        dependsOn: [],
        estimatedTokens: 500,
        parallelizable: true,
    });

    // Step 2: Analyze for testable units
    addStep(plan, {
        type: 'ai-generate',
        description: 'Identify testable functions and edge cases',
        config: {
            type: 'ai-generate',
            systemPrompt: 'You are a test engineer. Identify all testable units in this code.',
            userPrompt: 'Analyze the source code and list all functions/methods that need tests.',
            maxTokens: 1000,
        },
        dependsOn: ['step-1'],
        estimatedTokens: 1500,
        parallelizable: false,
    });

    // Step 3: Generate tests
    addStep(plan, {
        type: 'ai-generate',
        description: 'Generate comprehensive tests',
        config: {
            type: 'ai-generate',
            systemPrompt: 'You are a test engineer. Write comprehensive unit tests.',
            userPrompt: 'Generate tests for all identified functions.',
            maxTokens: 4000,
        },
        dependsOn: ['step-2'],
        estimatedTokens: 5000,
        parallelizable: false,
    });

    // Step 4: Write test file
    addStep(plan, {
        type: 'file-write',
        description: 'Write test file',
        config: {
            type: 'file-write',
            path: sourceFile.replace('.ts', '.test.ts'),
            content: '', // Filled at runtime
        },
        dependsOn: ['step-3'],
        estimatedTokens: 0,
        parallelizable: false,
    });

    // Step 5: Run tests
    addStep(plan, {
        type: 'shell-command',
        description: 'Run generated tests',
        config: {
            type: 'shell-command',
            command: 'pnpm',
            args: ['test', sourceFile.replace('.ts', '.test.ts')],
            timeout: 60000,
        },
        dependsOn: ['step-4'],
        estimatedTokens: 0,
        parallelizable: false,
    });

    updatePlanEstimates(plan);

    return plan;
}

/**
 * Update plan estimates based on steps
 */
function updatePlanEstimates(plan: ExecutionPlan): void {
    let totalInputTokens = 0;
    let aiCalls = 0;
    let apiCalls = 0;
    const filesAffected = new Set<string>();

    for (const step of plan.steps) {
        totalInputTokens += step.estimatedTokens;

        if (step.type === 'ai-generate' || step.type === 'ai-tool-call') {
            aiCalls++;
        }
        if (step.type === 'github-api' || step.type === 'http-request') {
            apiCalls++;
        }
        if (step.type === 'file-write' || step.type === 'file-delete') {
            const config = step.config as { path?: string };
            if (config.path) filesAffected.add(config.path);
        }
    }

    // Estimate output tokens as 50% of input
    const totalOutputTokens = Math.round(totalInputTokens * 0.5);

    plan.estimates = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCost: estimateCost(totalInputTokens, totalOutputTokens),
        estimatedDuration: aiCalls * 5000 + apiCalls * 500 + plan.steps.length * 100,
        aiCalls,
        apiCalls,
        filesAffected: [...filesAffected],
    };
}

/**
 * Validate a plan before execution
 */
export function validatePlan(plan: ExecutionPlan): void {
    const errors: Array<{ stepId?: string; code: string; message: string }> = [];
    const warnings: Array<{ stepId?: string; code: string; message: string }> = [];

    // Check for circular dependencies
    const visited = new Set<string>();
    const checkCircular = (stepId: string, path: string[]) => {
        if (path.includes(stepId)) {
            errors.push({
                stepId,
                code: 'CIRCULAR_DEPENDENCY',
                message: `Circular dependency: ${path.join(' -> ')} -> ${stepId}`,
            });
            return;
        }
        const step = plan.steps.find((s) => s.id === stepId);
        if (step) {
            for (const dep of step.dependsOn) {
                checkCircular(dep, [...path, stepId]);
            }
        }
    };

    for (const step of plan.steps) {
        checkCircular(step.id, []);
    }

    // Check for missing dependencies
    const stepIds = new Set(plan.steps.map((s) => s.id));
    for (const step of plan.steps) {
        for (const dep of step.dependsOn) {
            if (!stepIds.has(dep)) {
                errors.push({
                    stepId: step.id,
                    code: 'MISSING_DEPENDENCY',
                    message: `Step ${step.id} depends on non-existent step ${dep}`,
                });
            }
        }
    }

    // Warn about high token usage
    if (plan.estimates.inputTokens > 50000) {
        warnings.push({
            code: 'HIGH_TOKEN_USAGE',
            message: `Plan uses ~${plan.estimates.inputTokens} tokens, consider splitting`,
        });
    }

    plan.validation = {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Print a plan summary
 */
export function printPlanSummary(plan: ExecutionPlan): void {
    console.log(pc.bold(`\n📋 Execution Plan: ${plan.id}`));
    console.log(pc.dim(`Created: ${plan.createdAt}`));
    console.log(pc.dim(`Mode: ${plan.mode}`));

    console.log(pc.bold('\nSteps:'));
    for (const step of plan.steps) {
        const deps = step.dependsOn.length > 0 ? ` (after: ${step.dependsOn.join(', ')})` : '';
        console.log(`  ${step.id}: ${step.description}${pc.dim(deps)}`);
    }

    console.log(pc.bold('\nEstimates:'));
    console.log(`  Tokens: ${plan.estimates.inputTokens} in / ${plan.estimates.outputTokens} out`);
    console.log(`  Cost: $${plan.estimates.estimatedCost.toFixed(4)}`);
    console.log(`  Duration: ~${Math.round(plan.estimates.estimatedDuration / 1000)}s`);
    console.log(`  AI Calls: ${plan.estimates.aiCalls}`);
    console.log(`  API Calls: ${plan.estimates.apiCalls}`);

    if (plan.estimates.filesAffected.length > 0) {
        console.log(`  Files: ${plan.estimates.filesAffected.join(', ')}`);
    }

    if (plan.validation) {
        if (plan.validation.errors.length > 0) {
            console.log(pc.red('\n❌ Validation Errors:'));
            for (const error of plan.validation.errors) {
                console.log(pc.red(`  ${error.code}: ${error.message}`));
            }
        }
        if (plan.validation.warnings.length > 0) {
            console.log(pc.yellow('\n⚠️ Warnings:'));
            for (const warning of plan.validation.warnings) {
                console.log(pc.yellow(`  ${warning.code}: ${warning.message}`));
            }
        }
    }
}
