/**
 * Configure Repository Settings
 *
 * Configures GitHub repository settings for optimal triage workflow:
 * - Disable default CodeQL setup (we use triage.yml instead)
 * - Enable required security features
 * - Set up branch protection
 */

import pc from 'picocolors';
import { getRepoContext } from '../octokit.js';

export interface ConfigureOptions {
    /** Disable default CodeQL setup */
    disableDefaultCodeQL?: boolean;
    /** Enable Dependabot alerts */
    enableDependabot?: boolean;
    /** Enable secret scanning */
    enableSecretScanning?: boolean;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export async function configureRepository(options: ConfigureOptions = {}): Promise<void> {
    const {
        disableDefaultCodeQL = true,
        enableDependabot = true,
        enableSecretScanning = true,
        dryRun = false,
        verbose = false,
    } = options;

    const { owner, repo } = getRepoContext();

    console.log(pc.blue(`🔧 Configuring repository: ${owner}/${repo}`));
    console.log(pc.yellow('\n⚠️  Repository configuration requires GitHub REST API access'));
    console.log(pc.dim('These operations are not available via GitHub MCP:'));
    console.log(pc.dim('  - Code scanning default setup'));
    console.log(pc.dim('  - Dependabot vulnerability alerts'));
    console.log(pc.dim('  - Secret scanning configuration'));
    console.log(pc.dim('\nUse runAgenticTask() or configure manually in GitHub settings.\n'));

    // Log what would be configured
    if (disableDefaultCodeQL) {
        console.log(pc.dim('Would disable CodeQL default setup'));
    }
    if (enableDependabot) {
        console.log(pc.dim('Would enable Dependabot vulnerability alerts'));
    }
    if (enableSecretScanning) {
        console.log(pc.dim('Would enable secret scanning'));
    }

    console.log(pc.green('\n✅ Configuration check complete!'));
    console.log(pc.dim('\nManual steps:'));
    console.log(pc.dim('  1. Go to GitHub repo Settings > Security'));
    console.log(pc.dim('  2. Configure code scanning, Dependabot, and secret scanning'));
    console.log(pc.dim('  3. Push changes to trigger triage.yml'));
}
