/**
 * Execution Module
 *
 * Provides structured execution with:
 * - Plan generation before execution
 * - Token estimation and splitting
 * - VCR-style recording/playback
 * - Sandbox filesystem for testing
 * - Fixture repository generation
 * - Mock MCP providers
 */

// Plan types and utilities
export {
    type ExecutionPlan,
    type ExecutionMode,
    type PlanStep,
    type PlanTrigger,
    type PlanContext,
    type StepConfig,
    type StepResult,
    type ExecutionResult,
    type ResourceEstimates,
    type ValidationResult,
    createPlan,
    addStep,
    serializePlan,
    deserializePlan,
} from './plan.js';

// Tokenizer and cost estimation
export {
    estimateTokens,
    estimateFileTokens,
    estimateCost,
    fitsInContext,
    splitForContext,
    splitWithMetadata,
    groupFilesByDirectory,
    estimateStepTokens,
    analyzePlanForSplitting,
    MODELS,
    type ModelConfig,
    type ContentChunk,
    type SplitResult,
    type PlanSplitSuggestion,
} from './tokenizer.js';

// VCR-style recording
export {
    HttpRecorder,
    createRecorder,
    withRecording,
    type Recording,
    type RecordedInteraction,
    type RecorderOptions,
} from './recorder.js';

// Sandbox filesystem
export {
    Sandbox,
    createSandbox,
    withSandbox,
    type SandboxOptions,
    type FileChange,
    type ComparisonResult,
} from './sandbox.js';

// Fixture repositories
export {
    generateFixture,
    generateFromScenario,
    loadMockIssues,
    loadMockPRs,
    loadExpectations,
    cleanupFixture,
    FIXTURE_SCENARIOS,
    type FixtureRepo,
    type FixtureScenario,
    type FixtureDefinition,
    type FixtureFile,
    type FixtureCommit,
    type FixtureIssue,
    type FixturePR,
    type FixtureExpectations,
} from './fixtures.js';

// Mock MCP providers
export {
    MockMCPProvider,
    createMockMCP,
    type MockMCPOptions,
    type MockTool,
    type MockState,
    type TrackedOperation,
    type VerificationResult,
} from './mock-mcp.js';

// Planners
export {
    planAssess,
    planDevelop,
    planReview,
    planTestGeneration,
    validatePlan,
    printPlanSummary,
    type PlannerOptions,
} from './planner.js';

// Executor
export {
    executePlan,
    executeWithFixture,
    type ExecutorOptions,
} from './executor.js';

// GitHub Project Sandbox
export {
    createProjectSandbox,
    deleteProjectSandbox,
    copyIssueToSandbox,
    deleteSandboxIssue,
    withProjectSandbox,
    withIssueSandbox,
    listSandboxProjects,
    cleanupAllSandboxes,
    type ProjectSandboxOptions,
    type SandboxProject,
    type CopiedIssue,
} from './github-sandbox.js';

// Test Harness
export {
    TestHarness,
    createTestHarness,
    withTestHarness,
    runTriageTests,
    type TestHarnessOptions,
    type TestResult,
} from './test-harness.js';
