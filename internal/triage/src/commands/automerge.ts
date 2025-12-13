/**
 * Auto-merge Command
 *
 * Manage PR auto-merge and check status:
 * - Enable/disable auto-merge
 * - Wait for checks and merge
 * - Handle review requirements
 */

import pc from 'picocolors';
import {
    enableAutoMerge,
    disableAutoMerge,
    markPRReadyForReview,
    convertPRToDraft,
    getCheckRuns,
    areAllChecksPassing,
    waitForChecks,
    getPRReviews,
    submitPRReview,
} from '../octokit.js';
import { getPullRequest, commentOnPR } from '../github.js';

export interface AutomergeOptions {
    /** Action to perform */
    action: 'enable' | 'disable' | 'status' | 'wait' | 'draft' | 'ready';
    /** Merge method */
    mergeMethod?: 'MERGE' | 'SQUASH' | 'REBASE';
    /** Auto-approve if you're a reviewer */
    approve?: boolean;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export async function automerge(prNumber: number, options: AutomergeOptions): Promise<void> {
    const {
        action,
        mergeMethod = 'SQUASH',
        approve = false,
        dryRun = false,
        verbose = false,
    } = options;

    console.log(pc.blue(`🔀 PR #${prNumber}: ${action}`));

    const pr = getPullRequest(prNumber);

    if (verbose) {
        console.log(pc.dim(`Title: ${pr.title}`));
    }

    switch (action) {
        case 'enable': {
            if (dryRun) {
                console.log(pc.yellow('[Dry run] Would enable auto-merge'));
                return;
            }

            console.log(pc.dim('Enabling auto-merge...'));
            await enableAutoMerge(prNumber, mergeMethod);

            if (approve) {
                console.log(pc.dim('Submitting approval...'));
                await submitPRReview(prNumber, 'APPROVE', 'Auto-approved by @strata/triage');
            }

            commentOnPR(prNumber, `✅ Auto-merge enabled (${mergeMethod})\n\n_Managed by @strata/triage_`);
            console.log(pc.green('✅ Auto-merge enabled'));
            break;
        }

        case 'disable': {
            if (dryRun) {
                console.log(pc.yellow('[Dry run] Would disable auto-merge'));
                return;
            }

            console.log(pc.dim('Disabling auto-merge...'));
            await disableAutoMerge(prNumber);

            console.log(pc.green('✅ Auto-merge disabled'));
            break;
        }

        case 'draft': {
            if (dryRun) {
                console.log(pc.yellow('[Dry run] Would convert to draft'));
                return;
            }

            console.log(pc.dim('Converting to draft...'));
            await convertPRToDraft(prNumber);

            console.log(pc.green('✅ Converted to draft'));
            break;
        }

        case 'ready': {
            if (dryRun) {
                console.log(pc.yellow('[Dry run] Would mark as ready for review'));
                return;
            }

            console.log(pc.dim('Marking as ready for review...'));
            await markPRReadyForReview(prNumber);

            console.log(pc.green('✅ Marked as ready for review'));
            break;
        }

        case 'status': {
            console.log(pc.dim('Fetching check status...'));

            // Get PR head SHA
            const headRef = `refs/pull/${prNumber}/head`;
            const checks = await getCheckRuns(headRef);
            const { passing, pending, failed } = await areAllChecksPassing(headRef);

            console.log('\n' + pc.bold('Check Status:'));
            console.log(`  Total: ${checks.length}`);
            console.log(`  Pending: ${pending}`);
            console.log(`  Failed: ${failed.length}`);

            if (passing) {
                console.log(pc.green('\n✅ All checks passing!'));
            } else if (pending > 0) {
                console.log(pc.yellow(`\n⏳ ${pending} check(s) still running`));
            } else {
                console.log(pc.red('\n❌ Some checks failed:'));
                for (const name of failed) {
                    console.log(pc.red(`  - ${name}`));
                }
            }

            // Show reviews
            const reviews = await getPRReviews(prNumber);
            if (reviews.length > 0) {
                console.log('\n' + pc.bold('Reviews:'));
                for (const review of reviews) {
                    const icon = review.state === 'APPROVED' ? '✅' :
                        review.state === 'CHANGES_REQUESTED' ? '❌' : '💬';
                    console.log(`  ${icon} ${review.user}: ${review.state}`);
                }
            }

            break;
        }

        case 'wait': {
            console.log(pc.dim('Waiting for checks to complete...'));

            const headRef = `refs/pull/${prNumber}/head`;

            try {
                const result = await waitForChecks(headRef, {
                    timeout: 600000, // 10 minutes
                    pollInterval: 30000, // 30 seconds
                });

                if (result.passing) {
                    console.log(pc.green('\n✅ All checks passed!'));

                    if (!dryRun) {
                        // Enable auto-merge now that checks pass
                        console.log(pc.dim('Enabling auto-merge...'));
                        await enableAutoMerge(prNumber, mergeMethod);
                        console.log(pc.green('✅ Auto-merge enabled'));
                    }
                } else {
                    console.log(pc.red('\n❌ Some checks failed:'));
                    for (const name of result.failed) {
                        console.log(pc.red(`  - ${name}`));
                    }
                }
            } catch (error) {
                console.log(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
            }

            break;
        }
    }
}
