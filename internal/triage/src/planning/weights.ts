/**
 * Issue Weighting System
 *
 * Calculates priority weights for issues based on multiple factors.
 * Inspired by vanZeben/project-triage but extended for comprehensive planning.
 */

export interface IssueMetrics {
    number: number;
    title: string;
    nodeId: string;
    createdAt: string;
    updatedAt: string;
    closedAt?: string;

    // Engagement metrics
    reactions: number;
    comments: number;
    participants: number;

    // Response metrics
    hasMaintainerResponse: boolean;
    lastMaintainerResponseAt?: string;
    responseTimeHours?: number;

    // Classification
    labels: string[];
    type: IssueType;
    priority?: 'critical' | 'high' | 'medium' | 'low';

    // Estimation (AI-derived or manual)
    complexity?: 'trivial' | 'small' | 'medium' | 'large' | 'epic';
    effortPoints?: number;
    businessValue?: number;

    // Dependencies
    blockedBy: number[];
    blocks: number[];

    // State
    isOpen: boolean;
    isPR: boolean;
    isDraft?: boolean;
    milestone?: string;
}

export type IssueType =
    | 'bug'
    | 'feature'
    | 'enhancement'
    | 'tech-debt'
    | 'documentation'
    | 'security'
    | 'performance'
    | 'testing'
    | 'infrastructure'
    | 'unknown';

export interface WeightConfig {
    // Engagement weights
    reactionWeight: number;
    commentWeight: number;
    participantWeight: number;

    // Time weights
    ageWeight: number;
    staleBonus: number;
    noResponsePenalty: number;

    // Type weights
    typeWeights: Record<IssueType, number>;

    // Priority weights
    priorityWeights: Record<string, number>;

    // Complexity weights (inverse - simpler = higher priority for quick wins)
    complexityWeights: Record<string, number>;

    // Business value multiplier
    businessValueMultiplier: number;

    // Dependency weights
    blockerPenalty: number;
    blockingBonus: number;
}

export const DEFAULT_WEIGHT_CONFIG: WeightConfig = {
    // Engagement - community interest
    reactionWeight: 20,
    commentWeight: 5,
    participantWeight: 10,

    // Time - urgency
    ageWeight: 1, // per day
    staleBonus: 50, // >30 days without update
    noResponsePenalty: 100, // no maintainer response

    // Type priorities
    typeWeights: {
        'security': 500,
        'bug': 200,
        'performance': 150,
        'feature': 100,
        'enhancement': 80,
        'tech-debt': 60,
        'testing': 50,
        'documentation': 30,
        'infrastructure': 40,
        'unknown': 10,
    },

    // Priority labels
    priorityWeights: {
        'critical': 1000,
        'high': 200,
        'medium': 50,
        'low': 10,
    },

    // Complexity - favor quick wins
    complexityWeights: {
        'trivial': 100,
        'small': 50,
        'medium': 0,
        'large': -50,
        'epic': -100,
    },

    // Business value
    businessValueMultiplier: 2,

    // Dependencies
    blockerPenalty: -200, // blocked issues are deprioritized
    blockingBonus: 100, // issues blocking others are prioritized
};

/**
 * Calculate the priority weight for an issue
 */
export function calculateWeight(
    issue: IssueMetrics,
    config: WeightConfig = DEFAULT_WEIGHT_CONFIG
): number {
    let weight = 0;

    // 1. Engagement score
    weight += issue.reactions * config.reactionWeight;
    weight += issue.comments * config.commentWeight;
    weight += issue.participants * config.participantWeight;

    // 2. Age/urgency score
    const ageInDays = Math.floor(
        (Date.now() - new Date(issue.createdAt).getTime()) / 86400000
    );
    weight += ageInDays * config.ageWeight;

    // Stale bonus (hasn't been touched in 30+ days)
    const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(issue.updatedAt).getTime()) / 86400000
    );
    if (daysSinceUpdate > 30) {
        weight += config.staleBonus;
    }

    // No response penalty
    if (!issue.hasMaintainerResponse) {
        weight += config.noResponsePenalty;
    }

    // 3. Type weight
    weight += config.typeWeights[issue.type] || 0;

    // 4. Priority label weight
    if (issue.priority) {
        weight += config.priorityWeights[issue.priority] || 0;
    }

    // 5. Complexity weight
    if (issue.complexity) {
        weight += config.complexityWeights[issue.complexity] || 0;
    }

    // 6. Business value
    if (issue.businessValue) {
        weight += issue.businessValue * config.businessValueMultiplier;
    }

    // 7. Dependency adjustments
    if (issue.blockedBy.length > 0) {
        weight += config.blockerPenalty * issue.blockedBy.length;
    }
    if (issue.blocks.length > 0) {
        weight += config.blockingBonus * issue.blocks.length;
    }

    return Math.max(0, weight);
}

/**
 * Detect issue type from labels
 */
export function detectIssueType(labels: string[]): IssueType {
    const labelSet = new Set(labels.map((l) => l.toLowerCase()));

    if (labelSet.has('security') || labelSet.has('vulnerability')) return 'security';
    if (labelSet.has('bug') || labelSet.has('defect')) return 'bug';
    if (labelSet.has('performance') || labelSet.has('perf')) return 'performance';
    if (labelSet.has('feature') || labelSet.has('feature-request')) return 'feature';
    if (labelSet.has('enhancement') || labelSet.has('improvement')) return 'enhancement';
    if (labelSet.has('tech-debt') || labelSet.has('refactor') || labelSet.has('cleanup')) return 'tech-debt';
    if (labelSet.has('test') || labelSet.has('testing') || labelSet.has('tests')) return 'testing';
    if (labelSet.has('docs') || labelSet.has('documentation')) return 'documentation';
    if (labelSet.has('infrastructure') || labelSet.has('ci') || labelSet.has('devops')) return 'infrastructure';

    return 'unknown';
}

/**
 * Detect priority from labels
 */
export function detectPriority(labels: string[]): IssueMetrics['priority'] | undefined {
    const labelSet = new Set(labels.map((l) => l.toLowerCase()));

    if (labelSet.has('critical') || labelSet.has('p0') || labelSet.has('urgent')) return 'critical';
    if (labelSet.has('high') || labelSet.has('p1') || labelSet.has('important')) return 'high';
    if (labelSet.has('medium') || labelSet.has('p2')) return 'medium';
    if (labelSet.has('low') || labelSet.has('p3') || labelSet.has('nice-to-have')) return 'low';

    return undefined;
}

/**
 * Sort issues by weight descending
 */
export function sortByWeight(issues: Array<IssueMetrics & { weight: number }>): typeof issues {
    return [...issues].sort((a, b) => b.weight - a.weight);
}

/**
 * Group issues by type
 */
export function groupByType(issues: IssueMetrics[]): Record<IssueType, IssueMetrics[]> {
    const result: Record<IssueType, IssueMetrics[]> = {
        'bug': [],
        'feature': [],
        'enhancement': [],
        'tech-debt': [],
        'documentation': [],
        'security': [],
        'performance': [],
        'testing': [],
        'infrastructure': [],
        'unknown': [],
    };

    for (const issue of issues) {
        result[issue.type].push(issue);
    }

    return result;
}
