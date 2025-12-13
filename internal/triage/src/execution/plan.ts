/**
 * Execution Plan
 *
 * Structured JSON format for all triage operations.
 * Plans are generated before execution, allowing:
 * - Validation before action
 * - Token cost estimation
 * - Splitting large operations
 * - Recording/replay in tests
 */

export interface ExecutionPlan {
    /** Unique plan ID */
    id: string;
    /** Plan version for compatibility */
    version: '1.0';
    /** When the plan was created */
    createdAt: string;
    /** What triggered this plan */
    trigger: PlanTrigger;
    /** Target context */
    context: PlanContext;
    /** Execution mode */
    mode: ExecutionMode;
    /** Ordered list of steps to execute */
    steps: PlanStep[];
    /** Estimated resource usage */
    estimates: ResourceEstimates;
    /** Validation result */
    validation?: ValidationResult;
    /** Execution result (filled after execution) */
    result?: ExecutionResult;
}

export type ExecutionMode = 'live' | 'dry-run' | 'recorded' | 'plan-only';

export interface PlanTrigger {
    type: 'issue' | 'pr' | 'schedule' | 'manual' | 'cascade';
    source: string;
    issueNumber?: number;
    prNumber?: number;
    command?: string;
}

export interface PlanContext {
    owner: string;
    repo: string;
    branch?: string;
    workingDirectory: string;
    environment: Record<string, string>;
}

export interface PlanStep {
    /** Step ID */
    id: string;
    /** Step type */
    type: StepType;
    /** Human-readable description */
    description: string;
    /** Step-specific configuration */
    config: StepConfig;
    /** Dependencies on other steps */
    dependsOn: string[];
    /** Estimated tokens for this step */
    estimatedTokens: number;
    /** Whether this step can be parallelized */
    parallelizable: boolean;
    /** Step result (filled after execution) */
    result?: StepResult;
}

export type StepType =
    | 'ai-generate'      // AI text generation
    | 'ai-tool-call'     // AI with tool use
    | 'file-read'        // Read file
    | 'file-write'       // Write file
    | 'file-delete'      // Delete file
    | 'git-operation'    // Git command
    | 'github-api'       // GitHub API call
    | 'shell-command'    // Shell execution
    | 'http-request'     // External HTTP
    | 'wait'             // Wait/delay
    | 'condition'        // Conditional branch
    | 'aggregate';       // Combine results

export type StepConfig =
    | AIGenerateConfig
    | AIToolCallConfig
    | FileReadConfig
    | FileWriteConfig
    | FileDeleteConfig
    | GitOperationConfig
    | GitHubAPIConfig
    | ShellCommandConfig
    | HttpRequestConfig
    | WaitConfig
    | ConditionConfig
    | AggregateConfig;

export interface AIGenerateConfig {
    type: 'ai-generate';
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface AIToolCallConfig {
    type: 'ai-tool-call';
    systemPrompt: string;
    userPrompt: string;
    tools: string[];
    maxSteps?: number;
}

export interface FileReadConfig {
    type: 'file-read';
    path: string;
    encoding?: string;
}

export interface FileWriteConfig {
    type: 'file-write';
    path: string;
    content: string;
    encoding?: string;
}

export interface FileDeleteConfig {
    type: 'file-delete';
    path: string;
}

export interface GitOperationConfig {
    type: 'git-operation';
    operation: 'add' | 'commit' | 'push' | 'checkout' | 'branch';
    args: string[];
}

export interface GitHubAPIConfig {
    type: 'github-api';
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    endpoint: string;
    body?: Record<string, unknown>;
}

export interface ShellCommandConfig {
    type: 'shell-command';
    command: string;
    args: string[];
    cwd?: string;
    timeout?: number;
}

export interface HttpRequestConfig {
    type: 'http-request';
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
}

export interface WaitConfig {
    type: 'wait';
    duration: number;
}

export interface ConditionConfig {
    type: 'condition';
    expression: string;
    ifTrue: string[];  // Step IDs to execute if true
    ifFalse: string[]; // Step IDs to execute if false
}

export interface AggregateConfig {
    type: 'aggregate';
    stepIds: string[];
    aggregator: 'concat' | 'merge' | 'first' | 'last';
}

export interface ResourceEstimates {
    /** Total estimated input tokens */
    inputTokens: number;
    /** Total estimated output tokens */
    outputTokens: number;
    /** Total estimated cost (USD) */
    estimatedCost: number;
    /** Estimated execution time (ms) */
    estimatedDuration: number;
    /** Number of AI calls */
    aiCalls: number;
    /** Number of API calls */
    apiCalls: number;
    /** Files to be modified */
    filesAffected: string[];
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    stepId?: string;
    code: string;
    message: string;
}

export interface ValidationWarning {
    stepId?: string;
    code: string;
    message: string;
}

export interface StepResult {
    status: 'success' | 'failure' | 'skipped';
    startedAt: string;
    completedAt: string;
    output?: unknown;
    error?: string;
    tokensUsed?: number;
}

export interface ExecutionResult {
    status: 'success' | 'partial' | 'failure';
    startedAt: string;
    completedAt: string;
    stepsCompleted: number;
    stepsFailed: number;
    stepsSkipped: number;
    totalTokensUsed: number;
    artifacts: string[];
}

/**
 * Create a new empty plan
 */
export function createPlan(trigger: PlanTrigger, context: PlanContext): ExecutionPlan {
    return {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        version: '1.0',
        createdAt: new Date().toISOString(),
        trigger,
        context,
        mode: 'live',
        steps: [],
        estimates: {
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0,
            estimatedDuration: 0,
            aiCalls: 0,
            apiCalls: 0,
            filesAffected: [],
        },
    };
}

/**
 * Add a step to the plan
 */
export function addStep(plan: ExecutionPlan, step: Omit<PlanStep, 'id'>): PlanStep {
    const stepWithId: PlanStep = {
        ...step,
        id: `step-${plan.steps.length + 1}`,
    };
    plan.steps.push(stepWithId);
    return stepWithId;
}

/**
 * Serialize plan to JSON
 */
export function serializePlan(plan: ExecutionPlan): string {
    return JSON.stringify(plan, null, 2);
}

/**
 * Deserialize plan from JSON
 */
export function deserializePlan(json: string): ExecutionPlan {
    const plan = JSON.parse(json) as ExecutionPlan;
    if (plan.version !== '1.0') {
        throw new Error(`Unsupported plan version: ${plan.version}`);
    }
    return plan;
}
