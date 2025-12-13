/**
 * Release Command
 *
 * AI-powered release management:
 * - Analyzes commits since last release
 * - Generates changelog with AI summaries
 * - Determines semver bump from conventional commits
 * - Creates GitHub release with rich notes
 * - Handles tagging and version updates
 */

import pc from 'picocolors';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generate } from '../ai.js';
import { getOctokit, getRepoContext } from '../octokit.js';

const CHANGELOG_PROMPT = `You are a technical writer creating release notes for Strata, a procedural 3D graphics library for React Three Fiber.

Given a list of commits, create a well-organized changelog that:
1. Groups changes by category (Features, Bug Fixes, Performance, Breaking Changes, etc.)
2. Writes clear, user-friendly descriptions (not just commit messages)
3. Highlights breaking changes prominently
4. Mentions contributors where appropriate
5. Is concise but informative

Format as Markdown with ## headings for categories.`;

interface Commit {
    hash: string;
    type: string;
    scope: string | null;
    subject: string;
    body: string;
    breaking: boolean;
    author: string;
}

interface ReleaseInfo {
    version: string;
    bump: 'major' | 'minor' | 'patch';
    commits: Commit[];
    changelog: string;
    breaking: boolean;
}

export interface ReleaseOptions {
    dryRun?: boolean;
    verbose?: boolean;
    prerelease?: string;  // e.g., 'alpha', 'beta', 'rc'
    skipChangelog?: boolean;
    skipTag?: boolean;
    skipGithub?: boolean;
    skipNpm?: boolean;
    npmTag?: string;  // e.g., 'latest', 'next', 'beta'
}

export async function releaseCommand(options: ReleaseOptions = {}): Promise<void> {
    const { dryRun = false, verbose = false } = options;

    console.log(pc.blue('\n🚀 Preparing release...\n'));

    // Get current version
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
    const currentVersion = packageJson.version;
    console.log(pc.dim(`Current version: ${currentVersion}`));

    // Get last tag
    const lastTag = getLastTag();
    console.log(pc.dim(`Last tag: ${lastTag || 'none'}`));

    // Get commits since last tag
    const commits = getCommitsSinceTag(lastTag);
    if (commits.length === 0) {
        console.log(pc.yellow('No commits since last release'));
        return;
    }
    console.log(pc.dim(`Commits since last release: ${commits.length}`));

    if (verbose) {
        console.log(pc.dim('\nCommits:'));
        for (const c of commits.slice(0, 10)) {
            console.log(pc.dim(`  ${c.type}${c.scope ? `(${c.scope})` : ''}: ${c.subject}`));
        }
        if (commits.length > 10) {
            console.log(pc.dim(`  ... and ${commits.length - 10} more`));
        }
    }

    // Determine version bump
    const bump = determineBump(commits, options.prerelease);
    const newVersion = bumpVersion(currentVersion, bump, options.prerelease);
    const hasBreaking = commits.some(c => c.breaking);

    console.log(pc.blue(`\n📦 Version: ${currentVersion} → ${pc.bold(newVersion)} (${bump})`));
    if (hasBreaking) {
        console.log(pc.red('⚠️  Contains breaking changes!'));
    }

    // Generate changelog
    let changelog = '';
    if (!options.skipChangelog) {
        console.log(pc.blue('\n📝 Generating changelog with AI...'));
        changelog = await generateChangelog(commits, newVersion);
        
        if (verbose) {
            console.log(pc.dim('\n--- Changelog Preview ---'));
            console.log(changelog.slice(0, 1000));
            if (changelog.length > 1000) console.log(pc.dim('...'));
            console.log(pc.dim('--- End Preview ---\n'));
        }
    }

    if (dryRun) {
        console.log(pc.yellow('\n[Dry run] Would perform the following:'));
        console.log(pc.dim(`  - Update package.json version to ${newVersion}`));
        console.log(pc.dim(`  - Update CHANGELOG.md`));
        if (!options.skipTag) console.log(pc.dim(`  - Create git tag v${newVersion}`));
        if (!options.skipTag) console.log(pc.dim(`  - Push commits and tags`));
        if (!options.skipGithub) console.log(pc.dim(`  - Create GitHub release`));
        if (!options.skipNpm) console.log(pc.dim(`  - Publish to npm${options.npmTag ? ` with tag '${options.npmTag}'` : ''}`));
        return;
    }

    // Update package.json
    console.log(pc.blue('\n📄 Updating package.json...'));
    packageJson.version = newVersion;
    writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');

    // Update CHANGELOG.md
    if (!options.skipChangelog && changelog) {
        console.log(pc.blue('📄 Updating CHANGELOG.md...'));
        updateChangelog(newVersion, changelog);
    }

    // Commit changes
    console.log(pc.blue('💾 Committing version bump...'));
    execFileSync('git', ['add', 'package.json', 'CHANGELOG.md'], { stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', `chore(release): ${newVersion}`], { stdio: 'pipe' });

    // Create tag
    if (!options.skipTag) {
        console.log(pc.blue(`🏷️  Creating tag v${newVersion}...`));
        const tagMessage = `Release ${newVersion}\n\n${changelog.slice(0, 500)}`;
        execFileSync('git', ['tag', '-a', `v${newVersion}`, '-m', tagMessage], { stdio: 'pipe' });

        // Push commits and tags
        console.log(pc.blue('📤 Pushing to remote...'));
        execFileSync('git', ['push', 'origin', 'HEAD', '--tags'], { stdio: 'pipe' });
    }

    // Create GitHub release
    if (!options.skipGithub) {
        console.log(pc.blue('🐙 Creating GitHub release...'));
        await createGitHubRelease(newVersion, changelog, hasBreaking, options.prerelease);
    }

    // Publish to npm
    if (!options.skipNpm) {
        console.log(pc.blue('📦 Publishing to npm...'));
        const npmArgs = ['publish', '--access', 'public'];
        if (options.npmTag) {
            npmArgs.push('--tag', options.npmTag);
        } else if (options.prerelease) {
            npmArgs.push('--tag', options.prerelease);
        }
        try {
            execFileSync('npm', npmArgs, { stdio: 'inherit' });
            console.log(pc.green('✅ Published to npm!'));
        } catch (err) {
            console.log(pc.red('❌ npm publish failed'));
            throw err;
        }
    }

    console.log(pc.green(`\n✅ Released ${newVersion}!`));
}

function getLastTag(): string | null {
    try {
        return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    } catch {
        return null;
    }
}

function getCommitsSinceTag(tag: string | null): Commit[] {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const format = '%H%n%s%n%b%n%an%n---COMMIT---';
    
    let output: string;
    try {
        output = execFileSync('git', ['log', range, `--format=${format}`], {
            encoding: 'utf-8',
        });
    } catch {
        return [];
    }

    const commits: Commit[] = [];
    const entries = output.split('---COMMIT---').filter(Boolean);

    for (const entry of entries) {
        const lines = entry.trim().split('\n');
        if (lines.length < 2) continue;

        const hash = lines[0];
        const subject = lines[1];
        const body = lines.slice(2, -1).join('\n');
        const author = lines[lines.length - 1];

        // Parse conventional commit
        const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
        if (match) {
            commits.push({
                hash,
                type: match[1],
                scope: match[2] || null,
                subject: match[4],
                body,
                breaking: !!match[3] || body.includes('BREAKING CHANGE'),
                author,
            });
        } else {
            // Non-conventional commit
            commits.push({
                hash,
                type: 'other',
                scope: null,
                subject,
                body,
                breaking: false,
                author,
            });
        }
    }

    return commits;
}

function determineBump(commits: Commit[], prerelease?: string): 'major' | 'minor' | 'patch' {
    const hasBreaking = commits.some(c => c.breaking);
    const hasFeature = commits.some(c => c.type === 'feat');
    
    if (hasBreaking && !prerelease) return 'major';
    if (hasFeature) return 'minor';
    return 'patch';
}

function bumpVersion(current: string, bump: 'major' | 'minor' | 'patch', prerelease?: string): string {
    const [major, minor, patch] = current.replace(/-.*$/, '').split('.').map(Number);
    
    let newVersion: string;
    switch (bump) {
        case 'major':
            newVersion = `${major + 1}.0.0`;
            break;
        case 'minor':
            newVersion = `${major}.${minor + 1}.0`;
            break;
        case 'patch':
            newVersion = `${major}.${minor}.${patch + 1}`;
            break;
    }

    if (prerelease) {
        // Check if already has prerelease of same type
        const prereleaseMatch = current.match(new RegExp(`-${prerelease}\\.(\\d+)$`));
        if (prereleaseMatch) {
            const num = parseInt(prereleaseMatch[1]) + 1;
            newVersion = `${current.replace(/-.*$/, '')}-${prerelease}.${num}`;
        } else {
            newVersion = `${newVersion}-${prerelease}.0`;
        }
    }

    return newVersion;
}

async function generateChangelog(commits: Commit[], version: string): Promise<string> {
    const commitList = commits.map(c => {
        let line = `- ${c.type}${c.scope ? `(${c.scope})` : ''}: ${c.subject}`;
        if (c.breaking) line += ' [BREAKING]';
        line += ` (@${c.author})`;
        return line;
    }).join('\n');

    const prompt = `Generate a changelog for version ${version} from these commits:

${commitList}

Create a well-organized, user-friendly changelog.`;

    try {
        const response = await generate(prompt, { systemPrompt: CHANGELOG_PROMPT });
        return response;
    } catch {
        // Fallback to simple changelog
        return generateSimpleChangelog(commits, version);
    }
}

function generateSimpleChangelog(commits: Commit[], version: string): string {
    const groups: Record<string, Commit[]> = {
        'Breaking Changes': commits.filter(c => c.breaking),
        'Features': commits.filter(c => c.type === 'feat' && !c.breaking),
        'Bug Fixes': commits.filter(c => c.type === 'fix'),
        'Performance': commits.filter(c => c.type === 'perf'),
        'Documentation': commits.filter(c => c.type === 'docs'),
        'Other': commits.filter(c => !['feat', 'fix', 'perf', 'docs'].includes(c.type) && !c.breaking),
    };

    let changelog = `## ${version} (${new Date().toISOString().split('T')[0]})\n\n`;

    for (const [title, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        changelog += `### ${title}\n\n`;
        for (const c of items) {
            changelog += `- ${c.scope ? `**${c.scope}:** ` : ''}${c.subject}\n`;
        }
        changelog += '\n';
    }

    return changelog;
}

function updateChangelog(version: string, content: string): void {
    const changelogPath = 'CHANGELOG.md';
    let existing = '';
    
    if (existsSync(changelogPath)) {
        existing = readFileSync(changelogPath, 'utf-8');
    }

    // Insert new version after header
    const header = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
    const newContent = existing.startsWith('# Changelog')
        ? existing.replace(/^# Changelog.*?\n\n/, header + content + '\n')
        : header + content + '\n' + existing;

    writeFileSync(changelogPath, newContent);
}

async function createGitHubRelease(
    version: string,
    changelog: string,
    isBreaking: boolean,
    prerelease?: string
): Promise<void> {
    const octokit = getOctokit();
    const { owner, repo } = getRepoContext();

    await octokit.rest.repos.createRelease({
        owner,
        repo,
        tag_name: `v${version}`,
        name: `v${version}`,
        body: changelog,
        prerelease: !!prerelease,
        generate_release_notes: false,
    });
}
