import pc from 'picocolors';
import { getIssue, addLabels } from '../github.js';

const TRIAGE_LABELS = ['needs-triage'];
const SKIP_LABELS = ['bug', 'enhancement', 'feature', 'documentation', 'question'];

export interface LabelOptions {
    dryRun?: boolean;
    verbose?: boolean;
}

export async function autoLabel(issueNumber: number, options: LabelOptions = {}): Promise<void> {
    const { dryRun = false, verbose = false } = options;

    console.log(pc.blue(`Auto-labeling issue #${issueNumber}...`));

    // Get issue details
    const issue = getIssue(issueNumber);

    if (verbose) {
        console.log(pc.dim(`Title: ${issue.title}`));
        console.log(pc.dim(`Current labels: ${issue.labels.join(', ') || 'none'}`));
    }

    // Check if issue already has specific labels
    const hasSpecificLabel = issue.labels.some((l) => SKIP_LABELS.includes(l.toLowerCase()));

    if (hasSpecificLabel) {
        console.log(pc.yellow('Issue already has a specific label, skipping triage label'));
        return;
    }

    // Check if already has triage label
    const hasTriageLabel = issue.labels.some((l) => TRIAGE_LABELS.includes(l.toLowerCase()));

    if (hasTriageLabel) {
        console.log(pc.yellow('Issue already has triage label'));
        return;
    }

    if (dryRun) {
        console.log(pc.yellow(`[Dry run] Would add label: ${TRIAGE_LABELS[0]}`));
        return;
    }

    // Add triage label
    console.log(pc.blue(`Adding label: ${TRIAGE_LABELS[0]}`));
    addLabels(issueNumber, TRIAGE_LABELS);

    console.log(pc.green('Done!'));
}
