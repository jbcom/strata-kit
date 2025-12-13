/**
 * Sprint Planning Command
 *
 * Automated weekly sprint planning:
 * 1. Analyze backlog health
 * 2. Calculate optimal allocation
 * 3. Select issues for sprint
 * 4. Create/update milestone
 * 5. Spawn sub-tasks via triage
 */

import pc from 'picocolors';
import { execFileSync } from 'node:child_process';
import { generate } from '../ai.js';
import {
    IssueMetrics,
    calculateWeight,
    detectIssueType,
    detectPriority,
    sortByWeight,
    DEFAULT_WEIGHT_CONFIG,
} from './weights.js';
import {
    analyzeBacklogHealth,
    calculateOptimalAllocation,
    selectSprintIssues,
    DEFAULT_BALANCE,
    type SprintCapacity,
    type BacklogHealth,
    type CategoryAllocation,
} from './balance.js';
import { getOctokit, getRepoContext } from '../octokit.js';

const SYSTEM_PROMPT = `You are a technical project manager planning sprints for Strata, a procedural 3D graphics library for React Three Fiber.

Given a set of issues with weights and categories, create a sprint plan that:

1. **Balances Work Types**
   - Features: New functionality
   - Bugs: Stability and fixes
   - Tech Debt: Code quality
   - Quality: Testing and docs
   - Infrastructure: CI/CD and tooling

2. **Considers Dependencies**
   - Prioritize blockers
   - Group related work
   - Identify quick wins

3. **Estimates Capacity**
   - Consider complexity
   - Account for overhead (reviews, meetings)
   - Leave buffer for urgent issues

4. **Creates Actionable Plan**
   - Clear sprint goals
   - Prioritized issue list
   - Success criteria

Output a structured sprint plan with clear objectives.`;

export interface SprintOptions {
    /** Sprint duration in days */
    duration?: number;
    /** Team capacity in story points */
    capacity?: number;
    /** Sprint name/number */
    name?: string;
    /** Create GitHub milestone */
    createMilestone?: boolean;
    /** Trigger development for top issues */
    triggerDevelopment?: boolean;
    /** Maximum issues to trigger */
    maxTrigger?: number;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export interface SprintPlan {
    name: string;
    startDate: string;
    endDate: string;
    health: BacklogHealth;
    allocation: CategoryAllocation;
    issues: Array<IssueMetrics & { weight: number }>;
    goals: string[];
    milestoneNumber?: number;
}

export async function planSprint(options: SprintOptions = {}): Promise<SprintPlan> {
    const {
        duration = 7,
        capacity = 40,
        name = `Sprint ${getSprintNumber()}`,
        createMilestone = true,
        triggerDevelopment = false,
        maxTrigger = 3,
        dryRun = false,
        verbose = false,
    } = options;

    console.log(pc.blue(`📅 Planning: ${name}`));

    // 1. Fetch all open issues
    console.log(pc.dim('Fetching issues...'));
    const issues = await fetchAllIssues();
    console.log(pc.dim(`Found ${issues.length} open issues`));

    // 2. Calculate weights
    console.log(pc.dim('Calculating weights...'));
    const weightedIssues = issues.map((issue) => ({
        ...issue,
        weight: calculateWeight(issue),
    }));
    const sorted = sortByWeight(weightedIssues);

    // 3. Analyze backlog health
    console.log(pc.dim('Analyzing backlog health...'));
    const health = analyzeBacklogHealth(issues);

    if (verbose) {
        console.log(pc.dim(`  Health Score: ${health.score}/100`));
        console.log(pc.dim(`  Average Age: ${health.averageAge} days`));
        console.log(pc.dim(`  Unreplied: ${health.unreplied}`));
        console.log(pc.dim(`  Stale: ${health.stale}`));
    }

    // 4. Calculate optimal allocation
    const allocation = calculateOptimalAllocation(health);

    if (verbose) {
        console.log(pc.dim('Allocation:'));
        console.log(pc.dim(`  Features: ${allocation.features}%`));
        console.log(pc.dim(`  Bugs: ${allocation.bugs}%`));
        console.log(pc.dim(`  Tech Debt: ${allocation.techDebt}%`));
        console.log(pc.dim(`  Quality: ${allocation.quality}%`));
        console.log(pc.dim(`  Infrastructure: ${allocation.infrastructure}%`));
    }

    // 5. Select issues for sprint
    const sprintCapacity: SprintCapacity = {
        totalPoints: capacity,
        teamSize: 1, // AI agent
        sprintDays: duration,
    };

    const selectedIssues = selectSprintIssues(sorted, allocation, sprintCapacity);
    console.log(pc.green(`Selected ${selectedIssues.length} issues for sprint`));

    // 6. Generate sprint goals with AI
    console.log(pc.dim('Generating sprint goals...'));
    const goals = await generateSprintGoals(selectedIssues, health, allocation);

    // 7. Build sprint plan
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + duration * 86400000).toISOString().split('T')[0];

    const plan: SprintPlan = {
        name,
        startDate,
        endDate,
        health,
        allocation,
        issues: selectedIssues,
        goals,
    };

    // Print plan
    console.log('\n' + pc.bold('Sprint Plan:'));
    console.log(pc.dim(`Duration: ${startDate} to ${endDate}`));
    console.log(pc.dim(`Capacity: ${capacity} points`));
    console.log('\n' + pc.bold('Goals:'));
    for (const goal of goals) {
        console.log(`  • ${goal}`);
    }
    console.log('\n' + pc.bold('Selected Issues:'));
    for (const issue of selectedIssues.slice(0, 10)) {
        console.log(`  #${issue.number} (${issue.weight}) ${issue.title.slice(0, 50)}`);
    }
    if (selectedIssues.length > 10) {
        console.log(pc.dim(`  ... and ${selectedIssues.length - 10} more`));
    }

    if (dryRun) {
        console.log(pc.yellow('\n[Dry run] Would create milestone and assign issues'));
        return plan;
    }

    // 8. Create milestone
    if (createMilestone) {
        console.log(pc.dim('\nCreating milestone...'));
        try {
            const milestoneNumber = await createGitHubMilestone(name, endDate, goals);
            plan.milestoneNumber = milestoneNumber;

            // Assign issues to milestone
            for (const issue of selectedIssues) {
                await assignToMilestone(issue.number, milestoneNumber);
            }
            console.log(pc.green(`✅ Created milestone: ${name}`));
        } catch (error) {
            console.log(pc.yellow(`Could not create milestone: ${error}`));
        }
    }

    // 9. Trigger development for top issues
    if (triggerDevelopment) {
        console.log(pc.blue('\nTriggering development for top issues...'));
        const toTrigger = selectedIssues
            .filter((i) => !i.isPR && i.type !== 'documentation')
            .slice(0, maxTrigger);

        for (const issue of toTrigger) {
            console.log(pc.dim(`  Triggering #${issue.number}...`));
            try {
                // Add label to trigger triage develop
                execFileSync('gh', ['issue', 'edit', String(issue.number), '--add-label', 'ready-for-aider'], {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                });
            } catch {
                console.log(pc.yellow(`    Could not trigger #${issue.number}`));
            }
        }
    }

    console.log(pc.green('\n✅ Sprint planning complete!'));

    return plan;
}

async function fetchAllIssues(): Promise<IssueMetrics[]> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        state: 'open',
        per_page: 100,
    });

    return issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        nodeId: issue.node_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at ?? undefined,
        reactions: issue.reactions?.total_count ?? 0,
        comments: issue.comments,
        participants: 1, // Would need separate API call
        hasMaintainerResponse: true, // Would need timeline analysis
        labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')),
        type: detectIssueType(issue.labels.map((l) => (typeof l === 'string' ? l : l.name ?? ''))),
        priority: detectPriority(issue.labels.map((l) => (typeof l === 'string' ? l : l.name ?? ''))),
        blockedBy: [],
        blocks: [],
        isOpen: issue.state === 'open',
        isPR: !!issue.pull_request,
        milestone: issue.milestone?.title,
    }));
}

async function generateSprintGoals(
    issues: Array<IssueMetrics & { weight: number }>,
    health: BacklogHealth,
    allocation: CategoryAllocation
): Promise<string[]> {
    const issuesSummary = issues.slice(0, 10).map(
        (i) => `#${i.number} (${i.type}): ${i.title}`
    ).join('\n');

    const prompt = `Generate 3-5 sprint goals based on these issues:

${issuesSummary}

Backlog Health: ${health.score}/100
Allocation: ${JSON.stringify(allocation)}

Goals should be:
- Specific and measurable
- Achievable within 1 week
- Focused on outcomes, not tasks

Output just the goals, one per line, no numbering.`;

    const response = await generate(prompt, { systemPrompt: SYSTEM_PROMPT });
    return response.split('\n').filter((line) => line.trim().length > 0).slice(0, 5);
}

async function createGitHubMilestone(
    title: string,
    dueDate: string,
    goals: string[]
): Promise<number> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    const description = `## Sprint Goals\n\n${goals.map((g) => `- ${g}`).join('\n')}\n\n---\n_Auto-generated by @strata/triage_`;

    const { data } = await octokit.rest.issues.createMilestone({
        owner,
        repo,
        title,
        due_on: new Date(dueDate).toISOString(),
        description,
    });

    return data.number;
}

async function assignToMilestone(issueNumber: number, milestoneNumber: number): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        milestone: milestoneNumber,
    });
}

function getSprintNumber(): number {
    // Calculate sprint number based on week of year
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    return week;
}

export { planSprint as sprint };
