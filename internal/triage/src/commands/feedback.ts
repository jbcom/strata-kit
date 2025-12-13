/**
 * Feedback Command
 *
 * Handles PR review feedback:
 * - Lists all review threads
 * - Assesses feedback with AI (valid vs hallucination)
 * - Implements valid suggestions
 * - Resolves addressed threads via GraphQL
 * - Can mark PR as ready for review
 */

import pc from 'picocolors';
import { generate } from '../ai.js';
import {
    getPRReviewThreads,
    resolveReviewThread,
    markPRReadyForReview,
    type ReviewThread,
} from '../octokit.js';

const SYSTEM_PROMPT = `You are a code reviewer for Strata, a procedural 3D graphics library for React Three Fiber.

Your task is to assess PR review feedback and determine if each piece of feedback is:
1. **Valid** - A real issue that should be addressed
2. **Already Fixed** - The issue was already addressed in the code
3. **Hallucination** - The AI reviewer made a mistake or the feedback doesn't apply
4. **Cannot Fix** - Valid but cannot be fixed automatically (e.g., code scanning alerts)

For each piece of feedback, provide:
- Assessment: valid | already_fixed | hallucination | cannot_fix
- Reason: Brief explanation
- Action: What should be done (if anything)

Be precise and accurate. Don't dismiss valid feedback as hallucinations.`;

interface FeedbackAssessment {
    threadId: string;
    path: string;
    author: string;
    summary: string;
    assessment: 'valid' | 'already_fixed' | 'hallucination' | 'cannot_fix';
    reason: string;
    action: string;
    shouldResolve: boolean;
}

export async function handleFeedback(
    prNumber: number,
    options: {
        resolve?: boolean;
        readyForReview?: boolean;
        verbose?: boolean;
        dryRun?: boolean;
    } = {}
): Promise<void> {
    const { resolve = true, readyForReview = false, verbose = false, dryRun = false } = options;

    console.log(pc.blue(`\n📋 Fetching review threads for PR #${prNumber}...`));

    const threads = await getPRReviewThreads(prNumber);
    const unresolvedThreads = threads.filter((t) => !t.isResolved);

    console.log(pc.dim(`Found ${threads.length} total threads, ${unresolvedThreads.length} unresolved`));

    if (unresolvedThreads.length === 0) {
        console.log(pc.green('✅ No unresolved feedback to process'));

        if (readyForReview) {
            await handleReadyForReview(prNumber, dryRun);
        }
        return;
    }

    // Group threads by type
    const codeScanning = unresolvedThreads.filter((t) =>
        t.comments[0]?.author === 'github-advanced-security'
    );
    const botReviews = unresolvedThreads.filter((t) =>
        ['amazon-q-developer', 'cursor', 'gemini-code-assist'].includes(t.comments[0]?.author ?? '')
    );
    const humanReviews = unresolvedThreads.filter((t) =>
        !codeScanning.includes(t) && !botReviews.includes(t)
    );

    console.log(pc.dim(`  - Code scanning: ${codeScanning.length}`));
    console.log(pc.dim(`  - Bot reviews: ${botReviews.length}`));
    console.log(pc.dim(`  - Human reviews: ${humanReviews.length}`));

    // Process outdated threads first (can be auto-resolved)
    const outdatedThreads = unresolvedThreads.filter((t) => t.isOutdated);
    if (outdatedThreads.length > 0) {
        console.log(pc.blue(`\n🔄 Processing ${outdatedThreads.length} outdated threads...`));

        for (const thread of outdatedThreads) {
            if (verbose) {
                console.log(pc.dim(`  Resolving outdated: ${thread.path}`));
            }

            if (!dryRun && resolve) {
                const resolved = await resolveReviewThread(thread.id);
                if (resolved) {
                    console.log(pc.green(`  ✓ Resolved: ${thread.path}`));
                }
            } else if (dryRun) {
                console.log(pc.yellow(`  [Dry run] Would resolve: ${thread.path}`));
            }
        }
    }

    // Assess non-outdated threads with AI
    const activeThreads = unresolvedThreads.filter((t) => !t.isOutdated);
    if (activeThreads.length > 0) {
        console.log(pc.blue(`\n🤖 Assessing ${activeThreads.length} active threads with AI...`));

        const assessments = await assessThreads(activeThreads, verbose);

        // Report findings
        console.log(pc.blue('\n📊 Assessment Results:'));

        const byStatus = {
            valid: assessments.filter((a) => a.assessment === 'valid'),
            already_fixed: assessments.filter((a) => a.assessment === 'already_fixed'),
            hallucination: assessments.filter((a) => a.assessment === 'hallucination'),
            cannot_fix: assessments.filter((a) => a.assessment === 'cannot_fix'),
        };

        if (byStatus.valid.length > 0) {
            console.log(pc.yellow(`\n⚠️  Valid issues (${byStatus.valid.length}):`));
            for (const a of byStatus.valid) {
                console.log(pc.dim(`  - ${a.path}: ${a.summary}`));
                console.log(pc.dim(`    Action: ${a.action}`));
            }
        }

        if (byStatus.already_fixed.length > 0) {
            console.log(pc.green(`\n✅ Already fixed (${byStatus.already_fixed.length}):`));
            for (const a of byStatus.already_fixed) {
                console.log(pc.dim(`  - ${a.path}: ${a.summary}`));
            }
        }

        if (byStatus.hallucination.length > 0) {
            console.log(pc.magenta(`\n🎭 Hallucinations (${byStatus.hallucination.length}):`));
            for (const a of byStatus.hallucination) {
                console.log(pc.dim(`  - ${a.path}: ${a.summary}`));
                console.log(pc.dim(`    Reason: ${a.reason}`));
            }
        }

        if (byStatus.cannot_fix.length > 0) {
            console.log(pc.cyan(`\n🔒 Cannot fix automatically (${byStatus.cannot_fix.length}):`));
            for (const a of byStatus.cannot_fix) {
                console.log(pc.dim(`  - ${a.path}: ${a.summary}`));
            }
        }

        // Resolve threads that should be resolved
        if (resolve && !dryRun) {
            const toResolve = assessments.filter((a) => a.shouldResolve);
            if (toResolve.length > 0) {
                console.log(pc.blue(`\n🔧 Resolving ${toResolve.length} threads...`));
                for (const a of toResolve) {
                    const resolved = await resolveReviewThread(a.threadId);
                    if (resolved) {
                        console.log(pc.green(`  ✓ Resolved: ${a.path}`));
                    } else {
                        console.log(pc.dim(`  - Could not resolve: ${a.path} (may be code scanning)`));
                    }
                }
            }
        }
    }

    // Mark as ready for review if requested
    if (readyForReview) {
        await handleReadyForReview(prNumber, dryRun);
    }

    console.log(pc.green('\n✅ Feedback processing complete!'));
}

async function assessThreads(threads: ReviewThread[], verbose: boolean): Promise<FeedbackAssessment[]> {
    const assessments: FeedbackAssessment[] = [];

    // Build a prompt with all threads for batch assessment
    const threadSummaries = threads.map((t, i) => {
        const firstComment = t.comments[0];
        const summary = firstComment?.body.split('\n')[0] ?? 'No comment';
        return `
Thread ${i + 1}:
- Path: ${t.path}
- Author: ${firstComment?.author ?? 'unknown'}
- Outdated: ${t.isOutdated}
- Comment: ${firstComment?.body.slice(0, 500)}${(firstComment?.body.length ?? 0) > 500 ? '...' : ''}
`;
    }).join('\n---\n');

    const prompt = `Assess these PR review threads. For each thread, determine if it's valid, already fixed, a hallucination, or cannot be fixed automatically.

${threadSummaries}

Respond in JSON format:
{
  "assessments": [
    {
      "thread": 1,
      "assessment": "valid|already_fixed|hallucination|cannot_fix",
      "reason": "brief explanation",
      "action": "what to do",
      "shouldResolve": true/false
    }
  ]
}`;

    if (verbose) {
        console.log(pc.dim('Sending to AI for assessment...'));
    }

    try {
        const response = await generate(prompt, { systemPrompt: SYSTEM_PROMPT });

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            for (const a of parsed.assessments) {
                const thread = threads[a.thread - 1];
                if (thread) {
                    assessments.push({
                        threadId: thread.id,
                        path: thread.path,
                        author: thread.comments[0]?.author ?? 'unknown',
                        summary: thread.comments[0]?.body.split('\n')[0] ?? '',
                        assessment: a.assessment,
                        reason: a.reason,
                        action: a.action,
                        shouldResolve: a.shouldResolve,
                    });
                }
            }
        }
    } catch (error) {
        console.log(pc.yellow('Could not parse AI assessment, falling back to manual review'));

        // Fallback: mark code scanning as cannot_fix, others as need review
        for (const thread of threads) {
            const author = thread.comments[0]?.author ?? 'unknown';
            const isCodeScanning = author === 'github-advanced-security';

            assessments.push({
                threadId: thread.id,
                path: thread.path,
                author,
                summary: thread.comments[0]?.body.split('\n')[0] ?? '',
                assessment: isCodeScanning ? 'cannot_fix' : 'valid',
                reason: isCodeScanning ? 'Code scanning alerts require code changes' : 'Requires manual review',
                action: isCodeScanning ? 'Fix the underlying code issue' : 'Review and address',
                shouldResolve: false,
            });
        }
    }

    return assessments;
}

async function handleReadyForReview(prNumber: number, dryRun: boolean): Promise<void> {
    console.log(pc.blue('\n🚀 Marking PR as ready for review...'));

    if (dryRun) {
        console.log(pc.yellow('[Dry run] Would mark PR as ready for review'));
        return;
    }

    try {
        const success = await markPRReadyForReview(prNumber);
        if (success) {
            console.log(pc.green('✅ PR marked as ready for review!'));
        } else {
            console.log(pc.yellow('PR is already ready for review'));
        }
    } catch (error) {
        console.log(pc.red('Failed to mark PR as ready for review'));
        console.log(pc.dim(String(error)));
    }
}
