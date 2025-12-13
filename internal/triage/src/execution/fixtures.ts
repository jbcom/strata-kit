/**
 * Fixture Repository Generator
 *
 * Creates deterministic "fake" repositories for testing:
 * - Predetermined file structure
 * - Scripted git history
 * - Mock issues/PRs
 * - Known state for assertions
 *
 * The AI interacts with this exactly like a real repo.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export interface FixtureRepo {
    /** Unique ID for this fixture */
    id: string;
    /** Human-readable name */
    name: string;
    /** Description of what this fixture tests */
    description: string;
    /** The scenario being tested */
    scenario: FixtureScenario;
    /** Root directory of the fixture */
    root: string;
    /** Expected outcomes after triage runs */
    expectations: FixtureExpectations;
}

export type FixtureScenario =
    | 'new-feature-request'
    | 'bug-report'
    | 'security-vulnerability'
    | 'performance-issue'
    | 'documentation-gap'
    | 'test-coverage-gap'
    | 'refactoring-needed'
    | 'dependency-update'
    | 'breaking-change'
    | 'multi-file-change';

export interface FixtureExpectations {
    /** Files that should be created */
    createdFiles?: string[];
    /** Files that should be modified */
    modifiedFiles?: string[];
    /** Files that should be deleted */
    deletedFiles?: string[];
    /** Labels that should be added */
    labelsAdded?: string[];
    /** Comments that should contain these strings */
    commentContains?: string[];
    /** PR should be created */
    prCreated?: boolean;
    /** Tests should pass */
    testsPass?: boolean;
}

export interface FixtureFile {
    path: string;
    content: string;
}

export interface FixtureCommit {
    message: string;
    files: FixtureFile[];
    author?: string;
    date?: string;
}

export interface FixtureIssue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    state: 'open' | 'closed';
    comments?: Array<{ author: string; body: string }>;
}

export interface FixturePR {
    number: number;
    title: string;
    body: string;
    head: string;
    base: string;
    state: 'open' | 'closed' | 'merged';
    labels: string[];
    files: Array<{ path: string; patch: string }>;
}

export interface FixtureDefinition {
    name: string;
    description: string;
    scenario: FixtureScenario;
    /** Initial files in the repo */
    files: FixtureFile[];
    /** Git commit history (oldest first) */
    commits: FixtureCommit[];
    /** Mock issues */
    issues: FixtureIssue[];
    /** Mock PRs */
    pullRequests: FixturePR[];
    /** Expected outcomes */
    expectations: FixtureExpectations;
}

/**
 * Built-in fixture scenarios
 */
export const FIXTURE_SCENARIOS: Record<FixtureScenario, Partial<FixtureDefinition>> = {
    'new-feature-request': {
        description: 'User requests a new feature',
        issues: [
            {
                number: 42,
                title: 'Add dark mode support',
                body: `## Feature Request

I would like dark mode support for the terrain component.

### Use Case
Working at night, the bright terrain is hard on the eyes.

### Proposed Solution
Add a \`darkMode\` prop that inverts the color scheme.`,
                labels: ['enhancement', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            labelsAdded: ['feature', 'ready-for-aider'],
            commentContains: ['dark mode', 'implementation'],
        },
    },

    'bug-report': {
        description: 'User reports a bug',
        issues: [
            {
                number: 43,
                title: 'Terrain crashes when scale is zero',
                body: `## Bug Report

### Steps to Reproduce
1. Create a Terrain component
2. Set scale={0}
3. App crashes

### Expected Behavior
Should handle zero scale gracefully

### Actual Behavior
\`\`\`
TypeError: Cannot divide by zero
  at calculateNormals (terrain.ts:42)
\`\`\`

### Environment
- Version: 1.0.0
- Browser: Chrome 120`,
                labels: ['bug', 'needs-triage'],
                state: 'open',
            },
        ],
        files: [
            {
                path: 'src/terrain.ts',
                content: `export function calculateNormals(scale: number) {
  // BUG: No zero check!
  return 1 / scale;
}

export function Terrain({ scale = 1 }) {
  const normals = calculateNormals(scale);
  return { normals };
}`,
            },
        ],
        expectations: {
            modifiedFiles: ['src/terrain.ts'],
            labelsAdded: ['bug', 'ready-for-aider'],
            testsPass: true,
        },
    },

    'security-vulnerability': {
        description: 'Security issue reported',
        issues: [
            {
                number: 44,
                title: 'XSS vulnerability in label renderer',
                body: `## Security Issue

The label renderer doesn't sanitize HTML input, allowing XSS attacks.

### Severity: High

### Proof of Concept
\`\`\`jsx
<Label text="<script>alert('xss')</script>" />
\`\`\``,
                labels: ['security', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            labelsAdded: ['security', 'critical', 'ready-for-aider'],
        },
    },

    'performance-issue': {
        description: 'Performance regression reported',
        issues: [
            {
                number: 45,
                title: 'Terrain rendering is slow with high polygon count',
                body: `## Performance Issue

Rendering terrain with >100k polygons drops to 5 FPS.

### Profiler Results
- 80% time in calculateVertices()
- Unnecessary re-allocations on each frame`,
                labels: ['performance', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            labelsAdded: ['performance', 'optimization'],
        },
    },

    'documentation-gap': {
        description: 'Missing or unclear documentation',
        issues: [
            {
                number: 46,
                title: 'Document the erosion simulation API',
                body: `The erosion simulation has no documentation.

Users don't know:
- What parameters are available
- What the defaults are
- Example usage`,
                labels: ['documentation', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            createdFiles: ['docs/erosion.md'],
            labelsAdded: ['documentation'],
        },
    },

    'test-coverage-gap': {
        description: 'Missing test coverage',
        issues: [
            {
                number: 47,
                title: 'Add tests for the pathfinding module',
                body: `The pathfinding module has 0% test coverage.

Need tests for:
- A* algorithm
- Obstacle avoidance
- Edge cases`,
                labels: ['testing', 'needs-triage'],
                state: 'open',
            },
        ],
        files: [
            {
                path: 'src/pathfinding.ts',
                content: `export function findPath(start: Point, end: Point, obstacles: Point[]): Point[] {
  // A* implementation
  const openSet = [start];
  const cameFrom = new Map();
  // ... simplified
  return [start, end];
}

interface Point { x: number; y: number; }`,
            },
        ],
        expectations: {
            createdFiles: ['src/__tests__/pathfinding.test.ts'],
            labelsAdded: ['testing', 'needs-tests'],
        },
    },

    'refactoring-needed': {
        description: 'Code needs refactoring',
        issues: [
            {
                number: 48,
                title: 'Refactor terrain generator to use composition',
                body: `The terrain generator is a 2000-line monolith.

Should be split into:
- HeightmapGenerator
- TextureMapper
- MeshBuilder`,
                labels: ['refactor', 'tech-debt', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            labelsAdded: ['tech-debt', 'refactor'],
        },
    },

    'dependency-update': {
        description: 'Dependency needs updating',
        issues: [
            {
                number: 49,
                title: 'Update three.js to v0.160',
                body: `Three.js v0.160 has important bug fixes we need.

Breaking changes:
- WebGLRenderer API changed
- Material uniforms syntax updated`,
                labels: ['dependencies', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            modifiedFiles: ['package.json'],
            labelsAdded: ['dependencies'],
        },
    },

    'breaking-change': {
        description: 'Breaking change implementation',
        issues: [
            {
                number: 50,
                title: 'Rename TerrainMesh to Terrain',
                body: `For API consistency, rename TerrainMesh to Terrain.

This is a breaking change that needs:
- Migration guide
- Deprecation notice
- Version bump`,
                labels: ['breaking-change', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            labelsAdded: ['breaking-change', 'major'],
        },
    },

    'multi-file-change': {
        description: 'Change spanning multiple files',
        issues: [
            {
                number: 51,
                title: 'Add TypeScript strict mode',
                body: `Enable strict mode and fix all type errors.

Affected files:
- All .ts files
- tsconfig.json`,
                labels: ['typescript', 'needs-triage'],
                state: 'open',
            },
        ],
        expectations: {
            modifiedFiles: ['tsconfig.json'],
            labelsAdded: ['typescript'],
        },
    },
};

/**
 * Generate a fixture repository
 */
export async function generateFixture(
    definition: FixtureDefinition,
    outputDir: string
): Promise<FixtureRepo> {
    const fixtureId = crypto.randomBytes(4).toString('hex');
    const root = path.join(outputDir, `fixture-${fixtureId}`);

    // Create directory
    fs.mkdirSync(root, { recursive: true });

    // Initialize git repo
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@fixture.local'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Fixture Generator'], { cwd: root, stdio: 'pipe' });

    // Create initial files
    for (const file of definition.files) {
        const filePath = path.join(root, file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content);
    }

    // Create base package.json if not provided
    if (!definition.files.some((f) => f.path === 'package.json')) {
        fs.writeFileSync(
            path.join(root, 'package.json'),
            JSON.stringify(
                {
                    name: 'fixture-repo',
                    version: '1.0.0',
                    type: 'module',
                },
                null,
                2
            )
        );
    }

    // Initial commit
    execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'Initial commit', '--allow-empty'], { cwd: root, stdio: 'pipe' });

    // Apply commits
    for (const commit of definition.commits) {
        for (const file of commit.files) {
            const filePath = path.join(root, file.path);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, file.content);
        }
        execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', commit.message, '--allow-empty'], { cwd: root, stdio: 'pipe' });
    }

    // Create mock data files for issues/PRs
    const mockDir = path.join(root, '.fixture-mock');
    fs.mkdirSync(mockDir, { recursive: true });

    fs.writeFileSync(
        path.join(mockDir, 'issues.json'),
        JSON.stringify(definition.issues, null, 2)
    );

    fs.writeFileSync(
        path.join(mockDir, 'pull-requests.json'),
        JSON.stringify(definition.pullRequests, null, 2)
    );

    fs.writeFileSync(
        path.join(mockDir, 'expectations.json'),
        JSON.stringify(definition.expectations, null, 2)
    );

    return {
        id: fixtureId,
        name: definition.name,
        description: definition.description,
        scenario: definition.scenario,
        root,
        expectations: definition.expectations,
    };
}

/**
 * Generate a fixture from a scenario template
 */
export async function generateFromScenario(
    scenario: FixtureScenario,
    outputDir: string,
    overrides?: Partial<FixtureDefinition>
): Promise<FixtureRepo> {
    const template = FIXTURE_SCENARIOS[scenario];

    const definition: FixtureDefinition = {
        name: overrides?.name || `${scenario}-fixture`,
        description: template.description || scenario,
        scenario,
        files: overrides?.files || template.files || [],
        commits: overrides?.commits || template.commits || [],
        issues: overrides?.issues || template.issues || [],
        pullRequests: overrides?.pullRequests || template.pullRequests || [],
        expectations: { ...template.expectations, ...overrides?.expectations },
    };

    return generateFixture(definition, outputDir);
}

/**
 * Load mock issues from a fixture
 */
export function loadMockIssues(fixtureRoot: string): FixtureIssue[] {
    const mockPath = path.join(fixtureRoot, '.fixture-mock', 'issues.json');
    if (!fs.existsSync(mockPath)) return [];
    return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
}

/**
 * Load mock PRs from a fixture
 */
export function loadMockPRs(fixtureRoot: string): FixturePR[] {
    const mockPath = path.join(fixtureRoot, '.fixture-mock', 'pull-requests.json');
    if (!fs.existsSync(mockPath)) return [];
    return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
}

/**
 * Load expectations from a fixture
 */
export function loadExpectations(fixtureRoot: string): FixtureExpectations {
    const mockPath = path.join(fixtureRoot, '.fixture-mock', 'expectations.json');
    if (!fs.existsSync(mockPath)) return {};
    return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
}

/**
 * Clean up a fixture
 */
export function cleanupFixture(fixture: FixtureRepo): void {
    if (fs.existsSync(fixture.root)) {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
}
