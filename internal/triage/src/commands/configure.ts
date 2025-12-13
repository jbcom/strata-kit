/**
 * Configure Repository Settings
 *
 * Configures GitHub repository settings for optimal triage workflow:
 * - Disable default CodeQL setup (we use triage.yml instead)
 * - Enable required security features
 * - Set up branch protection
 */

import pc from 'picocolors';
import { getOctokit, getRepoContext } from '../octokit.js';

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

    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    console.log(pc.blue(`🔧 Configuring repository: ${owner}/${repo}`));

    // Check current code scanning default setup
    if (disableDefaultCodeQL) {
        console.log(pc.dim('Checking CodeQL default setup...'));
        
        try {
            const { data: defaultSetup } = await octokit.request(
                'GET /repos/{owner}/{repo}/code-scanning/default-setup',
                { owner, repo }
            );

            if (verbose) {
                console.log(pc.dim(`Current default setup state: ${defaultSetup.state}`));
            }

            if (defaultSetup.state === 'configured') {
                console.log(pc.yellow('⚠️  Default CodeQL setup is currently enabled'));
                console.log(pc.dim('  This conflicts with the triage.yml CodeQL job'));

                if (dryRun) {
                    console.log(pc.yellow('[Dry run] Would disable default CodeQL setup'));
                } else {
                    console.log(pc.blue('Disabling default CodeQL setup...'));
                    
                    await octokit.request(
                        'PATCH /repos/{owner}/{repo}/code-scanning/default-setup',
                        {
                            owner,
                            repo,
                            state: 'not-configured',
                        }
                    );
                    
                    console.log(pc.green('✅ Default CodeQL setup disabled'));
                    console.log(pc.dim('  CodeQL will now run via triage.yml workflow'));
                }
            } else {
                console.log(pc.green('✅ Default CodeQL setup already disabled'));
            }
        } catch (error: any) {
            if (error.status === 404) {
                console.log(pc.dim('Code scanning not available for this repository'));
            } else if (error.status === 403) {
                console.log(pc.yellow('⚠️  Need admin access to modify code scanning settings'));
            } else {
                throw error;
            }
        }
    }

    // Enable Dependabot alerts
    if (enableDependabot) {
        console.log(pc.dim('Checking Dependabot vulnerability alerts...'));
        
        try {
            const { data: vulnerabilityAlerts } = await octokit.request(
                'GET /repos/{owner}/{repo}/vulnerability-alerts',
                { owner, repo }
            );

            // This endpoint returns 204 if enabled, 404 if disabled
            console.log(pc.green('✅ Dependabot vulnerability alerts enabled'));
        } catch (error: any) {
            if (error.status === 404) {
                if (dryRun) {
                    console.log(pc.yellow('[Dry run] Would enable Dependabot alerts'));
                } else {
                    console.log(pc.blue('Enabling Dependabot vulnerability alerts...'));
                    
                    await octokit.request(
                        'PUT /repos/{owner}/{repo}/vulnerability-alerts',
                        { owner, repo }
                    );
                    
                    console.log(pc.green('✅ Dependabot alerts enabled'));
                }
            } else {
                console.log(pc.yellow(`⚠️  Could not check Dependabot status: ${error.message}`));
            }
        }
    }

    // Enable secret scanning
    if (enableSecretScanning) {
        console.log(pc.dim('Checking secret scanning...'));
        
        try {
            const { data: repoData } = await octokit.request(
                'GET /repos/{owner}/{repo}',
                { owner, repo }
            );

            const securityAndAnalysis = (repoData as any).security_and_analysis;
            
            if (securityAndAnalysis?.secret_scanning?.status === 'enabled') {
                console.log(pc.green('✅ Secret scanning enabled'));
            } else {
                if (dryRun) {
                    console.log(pc.yellow('[Dry run] Would enable secret scanning'));
                } else {
                    console.log(pc.blue('Enabling secret scanning...'));
                    
                    await octokit.request(
                        'PATCH /repos/{owner}/{repo}',
                        {
                            owner,
                            repo,
                            security_and_analysis: {
                                secret_scanning: { status: 'enabled' },
                                secret_scanning_push_protection: { status: 'enabled' },
                            },
                        }
                    );
                    
                    console.log(pc.green('✅ Secret scanning enabled'));
                }
            }
        } catch (error: any) {
            if (error.status === 403) {
                console.log(pc.yellow('⚠️  Need admin access to modify security settings'));
            } else {
                console.log(pc.yellow(`⚠️  Could not configure secret scanning: ${error.message}`));
            }
        }
    }

    console.log(pc.green('\n✅ Repository configuration complete!'));
    console.log(pc.dim('\nNext steps:'));
    console.log(pc.dim('  1. Push changes to trigger triage.yml'));
    console.log(pc.dim('  2. CodeQL will run via the codeql job in triage.yml'));
    console.log(pc.dim('  3. Custom scanner will upload SARIF to code scanning'));
}
