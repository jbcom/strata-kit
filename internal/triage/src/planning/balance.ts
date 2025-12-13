/**
 * Sprint Balance Optimization
 *
 * Automatically balances work between categories:
 * - New features (innovation)
 * - Bug fixes (stability)
 * - Tech debt (sustainability)
 * - Testing (quality)
 */

import { IssueMetrics, IssueType, groupByType } from './weights.js';

export interface SprintCapacity {
    /** Total story points available */
    totalPoints: number;
    /** Number of team members */
    teamSize: number;
    /** Sprint duration in days */
    sprintDays: number;
}

export interface BalanceConfig {
    /** Target percentage for each category (should sum to 100) */
    targetAllocation: CategoryAllocation;
    /** Minimum percentage for each category */
    minimumAllocation: CategoryAllocation;
    /** Maximum percentage for each category */
    maximumAllocation: CategoryAllocation;
    /** Auto-adjust based on backlog health */
    autoBalance: boolean;
}

export interface CategoryAllocation {
    features: number;      // New features + enhancements
    bugs: number;          // Bug fixes
    techDebt: number;      // Refactoring, cleanup
    quality: number;       // Testing, documentation
    infrastructure: number; // CI/CD, tooling
}

export const DEFAULT_BALANCE: BalanceConfig = {
    targetAllocation: {
        features: 40,
        bugs: 25,
        techDebt: 15,
        quality: 10,
        infrastructure: 10,
    },
    minimumAllocation: {
        features: 20,
        bugs: 10,
        techDebt: 5,
        quality: 5,
        infrastructure: 5,
    },
    maximumAllocation: {
        features: 60,
        bugs: 50,
        techDebt: 30,
        quality: 20,
        infrastructure: 20,
    },
    autoBalance: true,
};

export interface BacklogHealth {
    /** Total open issues */
    totalOpen: number;
    /** Average age of open issues in days */
    averageAge: number;
    /** Issues without maintainer response */
    unreplied: number;
    /** Issues older than 90 days */
    stale: number;
    /** Counts by category */
    byCategory: CategoryAllocation;
    /** Health score 0-100 */
    score: number;
}

/**
 * Analyze backlog health metrics
 */
export function analyzeBacklogHealth(issues: IssueMetrics[]): BacklogHealth {
    const openIssues = issues.filter((i) => i.isOpen && !i.isPR);

    if (openIssues.length === 0) {
        return {
            totalOpen: 0,
            averageAge: 0,
            unreplied: 0,
            stale: 0,
            byCategory: { features: 0, bugs: 0, techDebt: 0, quality: 0, infrastructure: 0 },
            score: 100,
        };
    }

    const now = Date.now();
    const ages = openIssues.map((i) => (now - new Date(i.createdAt).getTime()) / 86400000);
    const averageAge = ages.reduce((a, b) => a + b, 0) / ages.length;

    const unreplied = openIssues.filter((i) => !i.hasMaintainerResponse).length;
    const stale = ages.filter((age) => age > 90).length;

    // Count by category
    const grouped = groupByType(openIssues);
    const byCategory: CategoryAllocation = {
        features: grouped.feature.length + grouped.enhancement.length,
        bugs: grouped.bug.length + grouped.security.length + grouped.performance.length,
        techDebt: grouped['tech-debt'].length,
        quality: grouped.testing.length + grouped.documentation.length,
        infrastructure: grouped.infrastructure.length,
    };

    // Calculate health score
    // Penalize: high unreplied ratio, high stale ratio, high average age
    const unrepliedRatio = unreplied / openIssues.length;
    const staleRatio = stale / openIssues.length;
    const ageScore = Math.max(0, 100 - averageAge / 2); // Lose points as avg age increases

    const score = Math.round(
        ageScore * 0.4 +
        (1 - unrepliedRatio) * 100 * 0.3 +
        (1 - staleRatio) * 100 * 0.3
    );

    return {
        totalOpen: openIssues.length,
        averageAge: Math.round(averageAge),
        unreplied,
        stale,
        byCategory,
        score: Math.max(0, Math.min(100, score)),
    };
}

/**
 * Calculate optimal sprint allocation based on backlog health
 */
export function calculateOptimalAllocation(
    health: BacklogHealth,
    config: BalanceConfig = DEFAULT_BALANCE
): CategoryAllocation {
    if (!config.autoBalance) {
        return config.targetAllocation;
    }

    const total =
        health.byCategory.features +
        health.byCategory.bugs +
        health.byCategory.techDebt +
        health.byCategory.quality +
        health.byCategory.infrastructure;

    if (total === 0) {
        return config.targetAllocation;
    }

    // Start with target allocation
    const allocation = { ...config.targetAllocation };

    // Adjust based on backlog composition
    // If bugs are piling up, increase bug allocation
    const bugRatio = health.byCategory.bugs / total;
    if (bugRatio > 0.3) {
        allocation.bugs = Math.min(
            config.maximumAllocation.bugs,
            allocation.bugs + 10
        );
        allocation.features = Math.max(
            config.minimumAllocation.features,
            allocation.features - 10
        );
    }

    // If health score is low (lots of stale/unreplied), reduce feature work
    if (health.score < 50) {
        allocation.bugs = Math.min(
            config.maximumAllocation.bugs,
            allocation.bugs + 5
        );
        allocation.techDebt = Math.min(
            config.maximumAllocation.techDebt,
            allocation.techDebt + 5
        );
        allocation.features = Math.max(
            config.minimumAllocation.features,
            allocation.features - 10
        );
    }

    // If backlog is very healthy, can focus more on features
    if (health.score > 80 && health.totalOpen < 20) {
        allocation.features = Math.min(
            config.maximumAllocation.features,
            allocation.features + 10
        );
        allocation.bugs = Math.max(
            config.minimumAllocation.bugs,
            allocation.bugs - 5
        );
        allocation.techDebt = Math.max(
            config.minimumAllocation.techDebt,
            allocation.techDebt - 5
        );
    }

    // Normalize to 100%
    const sum = Object.values(allocation).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
        const factor = 100 / sum;
        for (const key of Object.keys(allocation) as Array<keyof CategoryAllocation>) {
            allocation[key] = Math.round(allocation[key] * factor);
        }
    }

    return allocation;
}

/**
 * Map issue types to categories
 */
export function issueTypeToCategory(type: IssueType): keyof CategoryAllocation {
    switch (type) {
        case 'feature':
        case 'enhancement':
            return 'features';
        case 'bug':
        case 'security':
        case 'performance':
            return 'bugs';
        case 'tech-debt':
            return 'techDebt';
        case 'testing':
        case 'documentation':
            return 'quality';
        case 'infrastructure':
            return 'infrastructure';
        default:
            return 'features'; // Default unknown to features
    }
}

/**
 * Select issues for a sprint based on allocation and capacity
 */
export function selectSprintIssues(
    issues: Array<IssueMetrics & { weight: number }>,
    allocation: CategoryAllocation,
    capacity: SprintCapacity
): Array<IssueMetrics & { weight: number }> {
    const selected: Array<IssueMetrics & { weight: number }> = [];
    const pointsUsed: CategoryAllocation = {
        features: 0,
        bugs: 0,
        techDebt: 0,
        quality: 0,
        infrastructure: 0,
    };

    const pointsAvailable: CategoryAllocation = {
        features: Math.round(capacity.totalPoints * allocation.features / 100),
        bugs: Math.round(capacity.totalPoints * allocation.bugs / 100),
        techDebt: Math.round(capacity.totalPoints * allocation.techDebt / 100),
        quality: Math.round(capacity.totalPoints * allocation.quality / 100),
        infrastructure: Math.round(capacity.totalPoints * allocation.infrastructure / 100),
    };

    // Sort by weight descending
    const sortedIssues = [...issues].sort((a, b) => b.weight - a.weight);

    // Select issues respecting allocation limits
    for (const issue of sortedIssues) {
        if (!issue.isOpen || issue.isPR) continue;
        if (issue.blockedBy.length > 0) continue; // Skip blocked issues

        const category = issueTypeToCategory(issue.type);
        const points = issue.effortPoints || estimatePoints(issue.complexity);

        if (pointsUsed[category] + points <= pointsAvailable[category]) {
            selected.push(issue);
            pointsUsed[category] += points;
        }
    }

    return selected;
}

/**
 * Estimate story points from complexity
 */
function estimatePoints(complexity?: string): number {
    switch (complexity) {
        case 'trivial': return 1;
        case 'small': return 2;
        case 'medium': return 5;
        case 'large': return 8;
        case 'epic': return 13;
        default: return 3; // Default medium
    }
}
