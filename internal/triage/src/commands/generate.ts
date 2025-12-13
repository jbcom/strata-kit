/**
 * Generate Command
 *
 * AI-powered test generation from source code analysis.
 * Inspired by Java/Spring Boot AI test generation patterns.
 *
 * Flow:
 * 1. Parse source file(s) to understand structure
 * 2. Extract functions, classes, exports
 * 3. Analyze dependencies and types
 * 4. Generate comprehensive tests with AI
 * 5. Validate generated tests compile
 * 6. Run tests to verify
 */

import pc from 'picocolors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, basename, join, relative } from 'node:path';
import { generate as aiGenerate, generateWithTools } from '../ai.js';
import { createInlineFilesystemClient, type MCPClient } from '../mcp.js';

const SYSTEM_PROMPT = `You are an expert TypeScript/React test engineer. Generate comprehensive unit tests following these principles:

## Test Structure (AAA Pattern)
- **Arrange**: Set up test data and mocks
- **Act**: Execute the function/component
- **Assert**: Verify expected outcomes

## Coverage Goals
- Happy path scenarios
- Edge cases (null, undefined, empty, boundary values)
- Error conditions and exception handling
- Async behavior (if applicable)
- Type edge cases

## Test Quality
- Each test should test ONE thing
- Descriptive test names that document behavior
- Minimal mocking - prefer real implementations
- No test interdependencies
- Fast execution

## Frameworks
- Use Vitest for unit tests
- Use @testing-library/react for React components
- Use @testing-library/react-hooks for hooks
- Mock Three.js/R3F objects appropriately

## Output Format
Generate complete, runnable test files. Include all imports.
Use TypeScript with proper types.

Example structure:
\`\`\`typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { functionUnderTest } from './source';

describe('functionUnderTest', () => {
  describe('when given valid input', () => {
    it('should return expected result', () => {
      // Arrange
      const input = { ... };
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expected);
    });
  });

  describe('edge cases', () => {
    it('should handle null input', () => { ... });
    it('should handle empty array', () => { ... });
  });

  describe('error handling', () => {
    it('should throw on invalid input', () => { ... });
  });
});
\`\`\``;

export interface GenerateOptions {
    /** Source file or directory to generate tests for */
    source: string;
    /** Output directory for tests */
    output?: string;
    /** Test type to generate */
    type?: 'unit' | 'integration' | 'component';
    /** Dry run - show what would be generated */
    dryRun?: boolean;
    /** Verbose output */
    verbose?: boolean;
    /** Run generated tests immediately */
    run?: boolean;
    /** Overwrite existing test files */
    overwrite?: boolean;
}

interface SourceAnalysis {
    filePath: string;
    exports: ExportInfo[];
    imports: string[];
    dependencies: string[];
    isReactComponent: boolean;
    isHook: boolean;
    hasAsync: boolean;
}

interface ExportInfo {
    name: string;
    type: 'function' | 'class' | 'const' | 'type' | 'interface' | 'component' | 'hook';
    isDefault: boolean;
    signature?: string;
    jsdoc?: string;
}

export async function generateTests(options: GenerateOptions): Promise<void> {
    const {
        source,
        output,
        type = 'unit',
        dryRun = false,
        verbose = false,
        run = false,
        overwrite = false,
    } = options;

    console.log(pc.blue(`🧪 Generating ${type} tests for: ${source}`));

    // Verify source exists
    if (!existsSync(source)) {
        throw new Error(`Source not found: ${source}`);
    }

    // Analyze source file
    console.log(pc.dim('Analyzing source code...'));
    const analysis = analyzeSource(source);

    if (verbose) {
        console.log(pc.dim(`Found ${analysis.exports.length} exports`));
        console.log(pc.dim(`React component: ${analysis.isReactComponent}`));
        console.log(pc.dim(`Custom hook: ${analysis.isHook}`));
    }

    if (analysis.exports.length === 0) {
        console.log(pc.yellow('No testable exports found'));
        return;
    }

    // Determine test file path
    const testFilePath = getTestFilePath(source, output, type);

    if (existsSync(testFilePath) && !overwrite) {
        console.log(pc.yellow(`Test file already exists: ${testFilePath}`));
        console.log(pc.dim('Use --overwrite to replace'));
        return;
    }

    // Read source content
    const sourceContent = readFileSync(source, 'utf-8');

    // Build generation prompt
    const prompt = buildGenerationPrompt(analysis, sourceContent, type);

    if (verbose) {
        console.log(pc.dim('\nGeneration prompt:'));
        console.log(pc.dim(prompt.slice(0, 500) + '...'));
    }

    console.log(pc.blue('Generating tests with AI...'));

    let fsClient: MCPClient | null = null;

    try {
        // Use filesystem tools to read related files for context
        fsClient = await createInlineFilesystemClient(dirname(source));
        const tools = await fsClient.tools();

        const result = await generateWithTools(prompt, tools, {
            systemPrompt: SYSTEM_PROMPT,
        });

        // Extract test code from response
        const testCode = extractTestCode(result.text);

        if (!testCode) {
            console.log(pc.red('Failed to generate valid test code'));
            console.log(pc.dim('AI Response:'));
            console.log(result.text.slice(0, 1000));
            return;
        }

        if (dryRun) {
            console.log(pc.yellow('\n[Dry run] Generated test code:'));
            console.log(testCode);
            return;
        }

        // Write test file
        mkdirSync(dirname(testFilePath), { recursive: true });
        writeFileSync(testFilePath, testCode);
        console.log(pc.green(`✅ Generated: ${testFilePath}`));

        // Validate TypeScript compiles
        console.log(pc.dim('Validating TypeScript...'));
        try {
            execFileSync('npx', ['tsc', '--noEmit', testFilePath], {
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            console.log(pc.green('✅ TypeScript valid'));
        } catch (err) {
            console.log(pc.yellow('⚠️ TypeScript errors detected'));
            if (verbose) {
                console.log((err as { stdout?: string }).stdout || '');
            }
        }

        // Run tests if requested
        if (run) {
            console.log(pc.blue('\nRunning generated tests...'));
            try {
                const testResult = execFileSync('npx', ['vitest', 'run', testFilePath, '--reporter=verbose'], {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                });
                console.log(testResult);
                console.log(pc.green('✅ Tests passed!'));
            } catch (err) {
                console.log(pc.yellow('⚠️ Some tests failed'));
                console.log((err as { stdout?: string }).stdout || '');
            }
        }

        console.log(pc.green('\nTest generation complete!'));

    } finally {
        if (fsClient) await fsClient.close();
    }
}

function analyzeSource(filePath: string): SourceAnalysis {
    const content = readFileSync(filePath, 'utf-8');
    const exports: ExportInfo[] = [];
    const imports: string[] = [];

    // Extract imports
    const importMatches = content.matchAll(/import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
        imports.push(match[3]);
    }

    // Detect React patterns
    const isReactComponent = /import\s+.*React/.test(content) ||
        /from\s+['"]react['"]/.test(content) ||
        /export\s+(?:default\s+)?function\s+\w+\s*\([^)]*\)\s*(?::\s*(?:JSX\.Element|React\.|FC))/.test(content) ||
        /<[A-Z]/.test(content);

    const isHook = /export\s+(?:const|function)\s+use[A-Z]/.test(content);

    const hasAsync = /async\s+function|async\s*\(|\.then\(|await\s/.test(content);

    // Extract exports
    // Named exports
    const namedExportMatches = content.matchAll(
        /export\s+(?:async\s+)?(function|const|class|interface|type)\s+(\w+)/g
    );
    for (const match of namedExportMatches) {
        const [, kind, name] = match;
        let type: ExportInfo['type'] = kind as ExportInfo['type'];

        // Detect components and hooks
        if (kind === 'function' || kind === 'const') {
            if (name.startsWith('use') && name[3]?.match(/[A-Z]/)) {
                type = 'hook';
            } else if (name[0]?.match(/[A-Z]/) && isReactComponent) {
                type = 'component';
            }
        }

        exports.push({ name, type, isDefault: false });
    }

    // Default exports
    const defaultMatch = content.match(/export\s+default\s+(?:async\s+)?(?:function|class)?\s*(\w+)?/);
    if (defaultMatch) {
        const name = defaultMatch[1] || 'default';
        exports.push({
            name,
            type: isReactComponent ? 'component' : 'function',
            isDefault: true,
        });
    }

    // Extract dependencies (external packages)
    const dependencies = imports.filter((i) => !i.startsWith('.') && !i.startsWith('@/'));

    return {
        filePath,
        exports,
        imports,
        dependencies,
        isReactComponent,
        isHook,
        hasAsync,
    };
}

function getTestFilePath(sourcePath: string, outputDir: string | undefined, type: string): string {
    const fileName = basename(sourcePath, '.ts').replace('.tsx', '');
    const extension = sourcePath.endsWith('.tsx') ? '.tsx' : '.ts';

    if (outputDir) {
        return join(outputDir, `${fileName}.test${extension}`);
    }

    // Default: place test next to source in __tests__ folder
    const dir = dirname(sourcePath);
    const testDir = join(dir, '__tests__');

    return join(testDir, `${fileName}.test${extension}`);
}

function buildGenerationPrompt(analysis: SourceAnalysis, sourceContent: string, type: string): string {
    const lines: string[] = [];

    lines.push(`Generate comprehensive ${type} tests for this TypeScript file.`);
    lines.push('');
    lines.push('## Source Code');
    lines.push('```typescript');
    lines.push(sourceContent);
    lines.push('```');
    lines.push('');

    lines.push('## Exports to Test');
    for (const exp of analysis.exports) {
        lines.push(`- \`${exp.name}\` (${exp.type}${exp.isDefault ? ', default' : ''})`);
    }
    lines.push('');

    if (analysis.isReactComponent) {
        lines.push('## React Testing Notes');
        lines.push('- Use @testing-library/react for rendering');
        lines.push('- Test user interactions with userEvent');
        lines.push('- Wrap in necessary providers if needed');
        lines.push('- For R3F components, mock Three.js objects');
        lines.push('');
    }

    if (analysis.isHook) {
        lines.push('## Hook Testing Notes');
        lines.push('- Use renderHook from @testing-library/react');
        lines.push('- Test state changes with act()');
        lines.push('- Test cleanup effects');
        lines.push('');
    }

    if (analysis.hasAsync) {
        lines.push('## Async Testing Notes');
        lines.push('- Use async/await in tests');
        lines.push('- Test loading states');
        lines.push('- Test error handling');
        lines.push('- Use waitFor for async assertions');
        lines.push('');
    }

    lines.push('## Requirements');
    lines.push('1. Generate a COMPLETE, RUNNABLE test file');
    lines.push('2. Include ALL necessary imports');
    lines.push('3. Cover happy path, edge cases, and errors');
    lines.push('4. Use descriptive test names');
    lines.push('5. Follow AAA pattern (Arrange, Act, Assert)');
    lines.push('');
    lines.push('Output ONLY the test file code, no explanations.');

    return lines.join('\n');
}

function extractTestCode(response: string): string | null {
    // Try to extract code from markdown code blocks
    const codeBlockMatch = response.match(/```(?:typescript|tsx?)\n([\s\S]*?)```/);
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
    }

    // If no code block, check if the response looks like code
    if (response.includes('import') && response.includes('describe')) {
        return response.trim();
    }

    return null;
}

// Alias for CLI
export { generateTests as generate };
