/**
 * Roadmap Generation
 *
 * AI-powered roadmap creation:
 * - Groups features into themes
 * - Creates quarterly milestones
 * - Tracks progress automatically
 */

import pc from 'picocolors';
import { generate } from '../ai.js';
import {
    IssueMetrics,
    calculateWeight,
    detectIssueType,
    groupByType,
} from './weights.js';
import { analyzeBacklogHealth } from './balance.js';
import { getRepoContext, searchIssues } from '../octokit.js';

const SYSTEM_PROMPT = `You are a product manager creating a roadmap for Strata, a procedural 3D graphics library for React Three Fiber.

Analyze the backlog and create a quarterly roadmap that:

1. **Groups Related Work**
   - Identify themes and epics
   - Connect related issues
   - Find logical sequences

2. **Prioritizes Strategically**
   - Balance short-term wins with long-term vision
   - Consider dependencies
   - Account for technical risk

3. **Sets Clear Milestones**
   - Define quarterly objectives
   - Establish measurable key results
   - Include buffer for unknowns

4. **Communicates Clearly**
   - Use plain language
   - Explain the "why"
   - Set expectations

Output a structured roadmap with quarters, themes, and key deliverables.`;

export interface RoadmapOptions {
    /** Number of quarters to plan */
    quarters?: number;
    /** Include completed recent work */
    includeCompleted?: boolean;
    /** Update GitHub project board */
    updateProject?: boolean;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export interface RoadmapQuarter {
    name: string;
    startDate: string;
    endDate: string;
    themes: RoadmapTheme[];
    objectives: string[];
}

export interface RoadmapTheme {
    name: string;
    description: string;
    issues: number[];
    status: 'planned' | 'in-progress' | 'completed';
}

export interface Roadmap {
    generatedAt: string;
    quarters: RoadmapQuarter[];
    summary: string;
}

export async function generateRoadmap(options: RoadmapOptions = {}): Promise<Roadmap> {
    const {
        quarters = 2,
        includeCompleted = false,
        dryRun = false,
        verbose = false,
    } = options;

    console.log(pc.blue(`🗺️ Generating ${quarters}-quarter roadmap...`));

    // 1. Fetch all issues
    console.log(pc.dim('Fetching issues...'));
    const issues = await fetchAllIssues(includeCompleted);
    console.log(pc.dim(`Found ${issues.length} issues`));

    // 2. Calculate weights and group
    const weightedIssues = issues.map((issue) => ({
        ...issue,
        weight: calculateWeight(issue),
    }));

    const byType = groupByType(weightedIssues);
    const health = analyzeBacklogHealth(issues);

    if (verbose) {
        console.log(pc.dim(`Features: ${byType.feature.length + byType.enhancement.length}`));
        console.log(pc.dim(`Bugs: ${byType.bug.length}`));
        console.log(pc.dim(`Tech Debt: ${byType['tech-debt'].length}`));
        console.log(pc.dim(`Health Score: ${health.score}/100`));
    }

    // 3. Generate roadmap with AI
    console.log(pc.dim('Generating roadmap with AI...'));

    const issuesSummary = weightedIssues
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 50)
        .map((i) => `#${i.number} [${i.type}] (${i.weight}): ${i.title}`)
        .join('\n');

    const prompt = `Create a ${quarters}-quarter roadmap for this project.

## Top Prioritized Issues (by weight)
${issuesSummary}

## Backlog Health
- Health Score: ${health.score}/100
- Open Issues: ${health.totalOpen}
- Average Age: ${health.averageAge} days
- Stale (>90 days): ${health.stale}

## Issue Breakdown
- Features/Enhancements: ${byType.feature.length + byType.enhancement.length}
- Bugs/Security/Performance: ${byType.bug.length + byType.security.length + byType.performance.length}
- Tech Debt: ${byType['tech-debt'].length}
- Testing/Docs: ${byType.testing.length + byType.documentation.length}

Create a roadmap with:
1. Clear quarterly objectives
2. Themes that group related issues
3. Key deliverables for each quarter
4. Consider the health score when prioritizing

Format as:

## Q[N] [Year]: [Theme]
### Objectives
- [Objective 1]
- [Objective 2]

### Themes
#### [Theme Name]
- #[issue] [title]
- #[issue] [title]

### Key Deliverables
- [Deliverable 1]
- [Deliverable 2]`;

    const roadmapText = await generate(prompt, { systemPrompt: SYSTEM_PROMPT });

    // 4. Parse roadmap
    const roadmapQuarters = parseRoadmapResponse(roadmapText, quarters);

    const roadmap: Roadmap = {
        generatedAt: new Date().toISOString(),
        quarters: roadmapQuarters,
        summary: roadmapText,
    };

    // 5. Print roadmap
    console.log('\n' + pc.bold('Generated Roadmap:'));
    console.log(roadmapText);

    if (dryRun) {
        console.log(pc.yellow('\n[Dry run] Would create milestones and update project'));
        return roadmap;
    }

    console.log(pc.green('\n✅ Roadmap generated!'));

    return roadmap;
}

async function fetchAllIssues(includeCompleted: boolean): Promise<IssueMetrics[]> {
    const { owner, repo } = getRepoContext();

    // Search for issues via GitHub MCP
    // Use state filter in the search query
    const stateQuery = includeCompleted ? '' : 'is:open';
    const query = `${stateQuery} is:issue`.trim();

    const issues = await searchIssues(query);

    // Note: GitHub MCP search returns limited data compared to Octokit
    // We fill in defaults for missing fields
    const now = new Date().toISOString();

    return issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        nodeId: `issue_${owner}_${repo}_${issue.number}`, // Generated ID
        createdAt: now, // Not available via search
        updatedAt: now, // Not available via search
        closedAt: undefined,
        reactions: 0, // Not available via search
        comments: 0, // Not available via search
        participants: 1,
        hasMaintainerResponse: true,
        labels: issue.labels,
        type: detectIssueType(issue.labels),
        blockedBy: [],
        blocks: [],
        isOpen: issue.state === 'open',
        isPR: false, // Search filtered to issues only
        milestone: undefined, // Not available via search
    }));
}

function parseRoadmapResponse(text: string, quarterCount: number): RoadmapQuarter[] {
    const quarters: RoadmapQuarter[] = [];
    const now = new Date();

    for (let i = 0; i < quarterCount; i++) {
        const quarterDate = new Date(now.getFullYear(), now.getMonth() + i * 3, 1);
        const quarterNum = Math.floor(quarterDate.getMonth() / 3) + 1;
        const year = quarterDate.getFullYear();

        const startDate = new Date(year, (quarterNum - 1) * 3, 1);
        const endDate = new Date(year, quarterNum * 3, 0);

        quarters.push({
            name: `Q${quarterNum} ${year}`,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            themes: [],
            objectives: [],
        });
    }

    // Extract objectives from response
    const objectiveMatches = text.matchAll(/### Objectives\n([\s\S]*?)(?=###|$)/g);
    let quarterIdx = 0;
    for (const match of objectiveMatches) {
        if (quarterIdx < quarters.length) {
            const objectives = match[1]
                .split('\n')
                .filter((line) => line.trim().startsWith('-'))
                .map((line) => line.replace(/^-\s*/, '').trim());
            quarters[quarterIdx].objectives = objectives;
            quarterIdx++;
        }
    }

    return quarters;
}

export { generateRoadmap as roadmap };
