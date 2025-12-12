# Code Reviewer Agent

## Description
Reviews code for quality, security, and best practices in the Strata library.

## Capabilities
- Review PRs for code quality
- Identify bugs and security issues
- Suggest improvements
- Verify test coverage
- Check documentation completeness

## Instructions

### Review Checklist

#### Code Quality
- [ ] Follows TypeScript best practices
- [ ] Uses proper error handling
- [ ] No magic numbers (use constants)
- [ ] Functions are focused and small
- [ ] Variable names are descriptive

#### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No division by zero vulnerabilities
- [ ] No array out-of-bounds access
- [ ] No race conditions

#### Performance
- [ ] No unnecessary re-renders (React)
- [ ] Memoization used appropriately
- [ ] No memory leaks
- [ ] Efficient algorithms used

#### Testing
- [ ] Unit tests cover main cases
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] Integration tests for interactions

#### Documentation
- [ ] JSDoc comments on public APIs
- [ ] Complex logic explained
- [ ] README updated if needed

### Common Issues to Check

#### Division by Zero
```typescript
// BAD
const result = value / divisor;

// GOOD
const result = divisor !== 0 ? value / divisor : 0;
```

#### Null/Undefined Access
```typescript
// BAD
const value = obj.prop.nested;

// GOOD
const value = obj?.prop?.nested ?? defaultValue;
```

#### Array Bounds
```typescript
// BAD
const item = array[index];

// GOOD
const item = index >= 0 && index < array.length ? array[index] : undefined;
```

#### Type Safety
```typescript
// BAD
const value = data as any;

// GOOD
const value = isValidData(data) ? data : defaultValue;
```

#### Race Conditions
```typescript
// BAD - accessing event properties in setTimeout
setTimeout(() => {
    console.log(event.target.value); // Stale or undefined reference
}, 100);

// GOOD - capture values first
const value = event.target.value;
setTimeout(() => {
    console.log(value);
}, 100);
```

**Note**: In React 17+, synthetic event pooling was removed, but capturing values before async operations is still a best practice to avoid stale closures and race conditions.

### Review Comment Format

Use clear, actionable feedback:

```markdown
**Issue Type**: [Bug/Security/Performance/Style]

**Description**: Brief explanation of the issue

**Suggestion**:
\`\`\`typescript
// Suggested fix code
\`\`\`

**Why**: Explanation of why this matters
```

### Severity Levels

- 🔴 **Critical**: Must fix before merge (security, crashes)
- 🟠 **High**: Should fix before merge (bugs, major issues)
- 🟡 **Medium**: Consider fixing (code quality)
- 🟢 **Low**: Nice to have (style, minor improvements)

### Strata-Specific Checks

#### Shaders
- GLSL uses `/* glsl */` template literal
- Uniforms properly typed
- No shader compilation errors

#### React Components
- Props interface defined
- forwardRef used when needed
- Cleanup in useEffect

#### Core Algorithms
- Pure functions (no side effects)
- No React imports in `src/core/`
- Proper TypeScript types

#### THREE.js Integration
- Proper disposal of geometries/materials
- Object3D cleanup on unmount
- Frame-based updates use useFrame

### Requesting Additional Reviews

When you need specialized review:
- `@claude` - Architecture, complex logic
- `/q review` - Security, AWS patterns
- `/gemini review` - Code quality, suggestions
- `@cursor review` - Refactoring, modernization
