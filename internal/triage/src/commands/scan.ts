/**
 * Custom Security Scanner
 *
 * Scans for Strata-specific security issues:
 * - execSync without safe arguments
 * - Unsanitized user input in shader code
 * - Insecure WebGL patterns
 * - Potential XSS in React components
 */

import pc from 'picocolors';
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import { basename, relative } from 'node:path';

export interface ScanResult {
    file: string;
    line: number;
    column: number;
    rule: string;
    severity: 'error' | 'warning' | 'note';
    message: string;
}

interface ScanRule {
    id: string;
    name: string;
    description: string;
    severity: 'error' | 'warning' | 'note';
    pattern: RegExp;
    filePattern?: RegExp;
    validate?: (match: RegExpMatchArray, line: string, context: string[]) => boolean;
}

const SCAN_RULES: ScanRule[] = [
    {
        id: 'strata/exec-sync-shell',
        name: 'Unsafe execSync',
        description: 'execSync with string command allows shell injection',
        severity: 'error',
        pattern: /execSync\s*\(\s*[`"']/,
        filePattern: /\.tsx?$/,
        validate: (match, line) => {
            // Check if it's not using execFileSync
            return !line.includes('execFileSync');
        },
    },
    {
        id: 'strata/child-process-shell',
        name: 'Shell option enabled',
        description: 'Spawning process with shell: true is vulnerable',
        severity: 'error',
        pattern: /shell\s*:\s*true/,
        filePattern: /\.tsx?$/,
    },
    {
        id: 'strata/eval-usage',
        name: 'eval() usage',
        description: 'eval() can execute arbitrary code',
        severity: 'error',
        pattern: /\beval\s*\(/,
        filePattern: /\.tsx?$/,
        validate: (match, line) => {
            // Ignore comments
            return !line.trim().startsWith('//') && !line.trim().startsWith('*');
        },
    },
    {
        id: 'strata/dangerously-set-html',
        name: 'dangerouslySetInnerHTML',
        description: 'Potential XSS vulnerability with unsanitized HTML',
        severity: 'warning',
        pattern: /dangerouslySetInnerHTML/,
        filePattern: /\.tsx?$/,
    },
    {
        id: 'strata/new-function',
        name: 'new Function()',
        description: 'new Function() can execute arbitrary code like eval',
        severity: 'error',
        pattern: /new\s+Function\s*\(/,
        filePattern: /\.tsx?$/,
    },
    {
        id: 'strata/shader-injection',
        name: 'Shader string interpolation',
        description: 'User input in shader strings may cause WebGL issues',
        severity: 'warning',
        pattern: /glsl\s*`[^`]*\$\{/,
        filePattern: /\.tsx?$/,
    },
    {
        id: 'strata/prototype-pollution',
        name: 'Prototype pollution risk',
        description: 'Object property access with bracket notation may allow pollution',
        severity: 'note',
        pattern: /\[.*\]\s*=/,
        filePattern: /\.tsx?$/,
        validate: (match, line, context) => {
            // Only flag if it's assignment to dynamic key from user input
            return line.includes('input') || line.includes('data') || line.includes('params');
        },
    },
    {
        id: 'strata/hardcoded-secret',
        name: 'Hardcoded secret',
        description: 'Potential hardcoded credential or API key',
        severity: 'error',
        pattern: /(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
        filePattern: /\.tsx?$/,
        validate: (match, line) => {
            // Ignore type definitions and examples
            return !line.includes('process.env') && 
                   !line.includes('interface') && 
                   !line.includes('type ') &&
                   !line.includes('// example');
        },
    },
    {
        id: 'strata/insecure-random',
        name: 'Insecure random',
        description: 'Math.random() is not cryptographically secure',
        severity: 'note',
        pattern: /Math\.random\s*\(/,
        filePattern: /\.tsx?$/,
        validate: (match, line, context) => {
            // Only flag in security-sensitive contexts
            const contextStr = context.join('\n').toLowerCase();
            return contextStr.includes('token') || 
                   contextStr.includes('key') || 
                   contextStr.includes('secret') ||
                   contextStr.includes('password');
        },
    },
    {
        id: 'strata/http-fetch',
        name: 'Insecure HTTP',
        description: 'HTTP (not HTTPS) URL may leak data',
        severity: 'warning',
        pattern: /fetch\s*\(\s*['"`]http:\/\//,
        filePattern: /\.tsx?$/,
    },
];

export interface ScanOptions {
    /** Directories to scan */
    directories?: string[];
    /** Output SARIF file */
    sarifOutput?: string;
    /** Fix issues automatically (where possible) */
    fix?: boolean;
    /** Verbose output */
    verbose?: boolean;
}

export async function scan(options: ScanOptions = {}): Promise<ScanResult[]> {
    const {
        directories = ['src', 'internal'],
        sarifOutput,
        verbose = false,
    } = options;

    console.log(pc.blue('🔍 Scanning for security issues...'));

    const results: ScanResult[] = [];

    // Find all TypeScript files
    const patterns = directories.map(dir => `${dir}/**/*.{ts,tsx}`);
    const files = globSync(patterns, { 
        ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.test.tsx'],
    });

    console.log(pc.dim(`Scanning ${files.length} files...`));

    for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (const rule of SCAN_RULES) {
            // Skip if file doesn't match pattern
            if (rule.filePattern && !rule.filePattern.test(file)) {
                continue;
            }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = line.match(rule.pattern);

                if (match) {
                    // Get context (3 lines before/after)
                    const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4));

                    // Run validation if present
                    if (rule.validate && !rule.validate(match, line, context)) {
                        continue;
                    }

                    results.push({
                        file,
                        line: i + 1,
                        column: match.index || 0,
                        rule: rule.id,
                        severity: rule.severity,
                        message: rule.description,
                    });
                }
            }
        }
    }

    // Group and display results
    const byFile = new Map<string, ScanResult[]>();
    for (const result of results) {
        const existing = byFile.get(result.file) || [];
        existing.push(result);
        byFile.set(result.file, existing);
    }

    if (results.length === 0) {
        console.log(pc.green('✅ No security issues found!'));
    } else {
        console.log(pc.yellow(`\n⚠️  Found ${results.length} issue(s) in ${byFile.size} file(s):\n`));

        for (const [file, fileResults] of byFile) {
            console.log(pc.bold(relative(process.cwd(), file)));
            for (const result of fileResults) {
                const color = result.severity === 'error' ? pc.red : 
                             result.severity === 'warning' ? pc.yellow : pc.dim;
                console.log(color(`  ${result.line}:${result.column} ${result.rule}`));
                console.log(pc.dim(`    ${result.message}`));
            }
            console.log();
        }

        // Summary
        const errors = results.filter(r => r.severity === 'error').length;
        const warnings = results.filter(r => r.severity === 'warning').length;
        const notes = results.filter(r => r.severity === 'note').length;

        console.log(pc.bold('Summary:'));
        if (errors > 0) console.log(pc.red(`  ❌ ${errors} error(s)`));
        if (warnings > 0) console.log(pc.yellow(`  ⚠️  ${warnings} warning(s)`));
        if (notes > 0) console.log(pc.dim(`  ℹ️  ${notes} note(s)`));
    }

    // Generate SARIF if requested
    if (sarifOutput) {
        console.log(pc.blue(`\n📄 Generating SARIF: ${sarifOutput}`));
        const sarif = generateScanSarif(results);
        writeFileSync(sarifOutput, JSON.stringify(sarif, null, 2));
        console.log(pc.green(`✅ SARIF written to ${sarifOutput}`));
    }

    return results;
}

function generateScanSarif(results: ScanResult[]): object {
    const rules = SCAN_RULES.map(rule => ({
        id: rule.id,
        name: rule.name,
        shortDescription: { text: rule.description },
        defaultConfiguration: { level: rule.severity },
    }));

    const sarifResults = results.map(result => ({
        ruleId: result.rule,
        level: result.severity,
        message: { text: result.message },
        locations: [{
            physicalLocation: {
                artifactLocation: { uri: relative(process.cwd(), result.file) },
                region: {
                    startLine: result.line,
                    startColumn: result.column + 1,
                },
            },
        }],
    }));

    return {
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [{
            tool: {
                driver: {
                    name: 'strata-scanner',
                    version: '1.0.0',
                    informationUri: 'https://github.com/jbcom/strata',
                    rules,
                },
            },
            results: sarifResults,
        }],
    };
}
