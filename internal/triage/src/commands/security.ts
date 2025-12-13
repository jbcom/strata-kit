/**
 * Security Command
 *
 * Analyze security alerts and provide recommendations:
 * - CodeQL/code scanning alerts
 * - Dependabot vulnerability alerts
 * - Security best practices
 */

import pc from 'picocolors';
import { generate } from '../ai.js';
import {
    getCodeScanningAlerts,
    getPRCodeScanningAlerts,
    getDependabotAlerts,
    formatAlertsForAI,
    type CodeScanningAlert,
    type DependabotAlert,
} from '../octokit.js';
import { commentOnPR, commentOnIssue } from '../github.js';

const SYSTEM_PROMPT = `You are a security expert analyzing code for vulnerabilities in Strata, a procedural 3D graphics library for React Three Fiber.

Analyze security alerts and provide:

1. **Risk Assessment**
   - Critical: Immediately exploitable, data breach risk
   - High: Significant security issue
   - Medium: Potential issue under certain conditions
   - Low: Minor issue or best practice

2. **Impact Analysis**
   - What could an attacker do?
   - What data is at risk?
   - What's the attack surface?

3. **Remediation Steps**
   - Specific code changes needed
   - Dependency updates required
   - Configuration changes

4. **Prevention**
   - How to prevent similar issues
   - Security patterns to follow

For dependency vulnerabilities, check if the vulnerable code path is actually used.
For code scanning alerts, evaluate if the issue is a true positive.`;

export interface SecurityOptions {
    /** Check PR-specific alerts */
    pr?: number;
    /** Check issue-related code */
    issue?: number;
    /** Include dependabot alerts */
    dependabot?: boolean;
    /** Include code scanning alerts */
    codeScanning?: boolean;
    /** Output SARIF file for GitHub upload */
    sarifOutput?: string;
    /** Dry run */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

interface SarifResult {
    ruleId: string;
    level: 'error' | 'warning' | 'note';
    message: { text: string };
    locations: Array<{
        physicalLocation: {
            artifactLocation: { uri: string };
            region?: { startLine: number; endLine?: number };
        };
    }>;
}

interface SarifReport {
    $schema: string;
    version: string;
    runs: Array<{
        tool: {
            driver: {
                name: string;
                version: string;
                informationUri: string;
                rules: Array<{
                    id: string;
                    name: string;
                    shortDescription: { text: string };
                    defaultConfiguration: { level: string };
                }>;
            };
        };
        results: SarifResult[];
    }>;
}

export async function security(options: SecurityOptions = {}): Promise<void> {
    const {
        pr,
        dependabot = true,
        codeScanning = true,
        dryRun = false,
        verbose = false,
    } = options;

    console.log(pc.blue('🔒 Analyzing security alerts...'));

    let codeScanningAlerts: CodeScanningAlert[] = [];
    let dependabotAlerts: DependabotAlert[] = [];

    // Fetch alerts
    if (codeScanning) {
        console.log(pc.dim('Fetching code scanning alerts...'));
        try {
            codeScanningAlerts = pr
                ? await getPRCodeScanningAlerts(pr)
                : await getCodeScanningAlerts('open');
            console.log(pc.dim(`Found ${codeScanningAlerts.length} code scanning alert(s)`));
        } catch (error) {
            console.log(pc.yellow('Code scanning not available or not enabled'));
            if (verbose) {
                console.log(pc.dim(String(error)));
            }
        }
    }

    if (dependabot) {
        console.log(pc.dim('Fetching Dependabot alerts...'));
        try {
            dependabotAlerts = await getDependabotAlerts('open');
            console.log(pc.dim(`Found ${dependabotAlerts.length} Dependabot alert(s)`));
        } catch (error) {
            console.log(pc.yellow('Dependabot alerts not available'));
            if (verbose) {
                console.log(pc.dim(String(error)));
            }
        }
    }

    // Check if there are any alerts
    if (codeScanningAlerts.length === 0 && dependabotAlerts.length === 0) {
        console.log(pc.green('✅ No security alerts found!'));
        return;
    }

    // Format for AI analysis
    const alertsText = formatAlertsForAI(codeScanningAlerts, dependabotAlerts);

    // Summary
    console.log('\n' + pc.bold('Security Alert Summary:'));

    if (codeScanningAlerts.length > 0) {
        const bySeverity = groupBy(codeScanningAlerts, (a) => a.rule.severity);
        console.log(pc.red(`  Code Scanning: ${codeScanningAlerts.length} alert(s)`));
        for (const [severity, alerts] of Object.entries(bySeverity)) {
            console.log(pc.dim(`    - ${severity}: ${alerts.length}`));
        }
    }

    if (dependabotAlerts.length > 0) {
        const bySeverity = groupBy(dependabotAlerts, (a) => a.securityVulnerability.severity);
        console.log(pc.yellow(`  Dependabot: ${dependabotAlerts.length} alert(s)`));
        for (const [severity, alerts] of Object.entries(bySeverity)) {
            console.log(pc.dim(`    - ${severity}: ${alerts.length}`));
        }
    }

    // AI Analysis
    console.log(pc.blue('\nAnalyzing with AI...'));

    const prompt = `Analyze these security alerts and provide recommendations:

${alertsText}

Provide:
1. Overall risk assessment
2. Priority order for remediation
3. Specific fix recommendations
4. Quick wins vs long-term fixes`;

    const analysis = await generate(prompt, { systemPrompt: SYSTEM_PROMPT });

    console.log('\n' + pc.green('Security Analysis:'));
    console.log(analysis);

    if (dryRun) {
        console.log(pc.yellow('\n[Dry run] Would post security report'));
        return;
    }

    // Post to PR if specified
    if (pr) {
        const comment = `## 🔒 Security Analysis

${analysis}

### Alerts Summary
- Code Scanning: ${codeScanningAlerts.length} alert(s)
- Dependabot: ${dependabotAlerts.length} alert(s)

---
_Analyzed by @strata/triage_`;

        commentOnPR(pr, comment);
        console.log(pc.dim(`Posted security analysis to PR #${pr}`));
    }

    // Generate SARIF output if requested
    if (options.sarifOutput) {
        console.log(pc.blue(`\n📄 Generating SARIF report: ${options.sarifOutput}`));
        const sarif = generateSarifReport(codeScanningAlerts, dependabotAlerts, analysis);
        const { writeFileSync } = await import('node:fs');
        writeFileSync(options.sarifOutput, JSON.stringify(sarif, null, 2));
        console.log(pc.green(`✅ SARIF report written to ${options.sarifOutput}`));
    }

    console.log(pc.green('\nSecurity analysis complete!'));
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    for (const item of items) {
        const key = keyFn(item);
        if (!result[key]) result[key] = [];
        result[key].push(item);
    }
    return result;
}

function generateSarifReport(
    codeScanningAlerts: CodeScanningAlert[],
    dependabotAlerts: DependabotAlert[],
    aiAnalysis: string
): SarifReport {
    const rules: SarifReport['runs'][0]['tool']['driver']['rules'] = [];
    const results: SarifResult[] = [];

    // Convert code scanning alerts to SARIF
    for (const alert of codeScanningAlerts) {
        const ruleId = `strata/${alert.rule.id}`;
        
        // Add rule if not exists
        if (!rules.find(r => r.id === ruleId)) {
            rules.push({
                id: ruleId,
                name: alert.rule.name || alert.rule.id,
                shortDescription: { text: alert.rule.description },
                defaultConfiguration: {
                    level: severityToLevel(alert.rule.severity),
                },
            });
        }

        results.push({
            ruleId,
            level: severityToLevel(alert.rule.severity) as 'error' | 'warning' | 'note',
            message: { text: alert.rule.description },
            locations: alert.location ? [{
                physicalLocation: {
                    artifactLocation: { uri: alert.location.path },
                    region: {
                        startLine: alert.location.startLine,
                        endLine: alert.location.endLine,
                    },
                },
            }] : [],
        });
    }

    // Convert dependabot alerts to SARIF
    for (const alert of dependabotAlerts) {
        const ruleId = `strata/dependency/${alert.dependency.package}`;
        
        if (!rules.find(r => r.id === ruleId)) {
            rules.push({
                id: ruleId,
                name: `Vulnerable dependency: ${alert.dependency.package}`,
                shortDescription: { text: alert.securityAdvisory.summary },
                defaultConfiguration: {
                    level: severityToLevel(alert.securityVulnerability.severity),
                },
            });
        }

        results.push({
            ruleId,
            level: severityToLevel(alert.securityVulnerability.severity) as 'error' | 'warning' | 'note',
            message: {
                text: `${alert.securityAdvisory.summary}. Fix: upgrade to ${alert.securityVulnerability.firstPatchedVersion || 'latest'}`,
            },
            locations: [{
                physicalLocation: {
                    artifactLocation: { uri: 'package.json' },
                },
            }],
        });
    }

    // Add AI analysis as a note
    if (aiAnalysis) {
        rules.push({
            id: 'strata/ai-analysis',
            name: 'AI Security Analysis',
            shortDescription: { text: 'AI-generated security analysis and recommendations' },
            defaultConfiguration: { level: 'note' },
        });

        results.push({
            ruleId: 'strata/ai-analysis',
            level: 'note',
            message: { text: aiAnalysis.slice(0, 2000) }, // SARIF has size limits
            locations: [{
                physicalLocation: {
                    artifactLocation: { uri: 'SECURITY.md' },
                },
            }],
        });
    }

    return {
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [{
            tool: {
                driver: {
                    name: 'strata-triage',
                    version: '1.0.0',
                    informationUri: 'https://github.com/jbcom/strata',
                    rules,
                },
            },
            results,
        }],
    };
}

function severityToLevel(severity: string): string {
    switch (severity.toLowerCase()) {
        case 'critical':
        case 'high':
            return 'error';
        case 'medium':
            return 'warning';
        default:
            return 'note';
    }
}
