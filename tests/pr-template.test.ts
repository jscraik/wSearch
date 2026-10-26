import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/pr-pipeline.yml', import.meta.url), 'utf8');
const block = workflow.split('          script: |\n')[1]?.split('\n  dependency-chain:')[0];
if (!block) throw new Error('PR template workflow script missing');
const script = block.split('\n').map(line => line.replace(/^ {12}/, '')).join('\n');
const validate = (body: string) => {
  const errors: string[] = [];
  new Function('context', 'core', script)(
    { payload: { pull_request: { body } } },
    { setFailed: (message: string) => errors.push(message) },
  );
  return errors;
};
const body = `## Summary
Validate evidence.
## Checklist
- [x] Checked
## Testing
- Command: \`npm run check\` -> pass
## Review artifacts
- CodeRabbit: Pending included review.
- Codex: https://github.com/example/repo/pull/1#issuecomment-1
## Notes
No merge requested.
`;

describe('actual PR template workflow', () => {
  it('accepts recorded commands and explicit pending review', () => {
    expect(validate(body)).toEqual([]);
  });
  it('rejects empty testing despite a completed checklist', () => {
    expect(validate(body.replace('- Command: `npm run check` -> pass', ''))).not.toEqual([]);
  });
  it('rejects a command without a result', () => {
    expect(validate(body.replace(' -> pass', ''))).not.toEqual([]);
  });
  it('does not accept evidence moved outside its section', () => {
    expect(validate(body.replace('- Command: `npm run check` -> pass', '').replace('No merge requested.', '- Command: `npm run check` -> pass'))).not.toEqual([]);
  });
  it('rejects missing or empty reviewer evidence', () => {
    expect(validate(body.replace('- CodeRabbit: Pending included review.', '- CodeRabbit:'))).not.toEqual([]);
    expect(validate(body.replace('- Codex: https://github.com/example/repo/pull/1#issuecomment-1', ''))).not.toEqual([]);
  });
  it('retains checklist and required-heading rejection', () => {
    expect(validate(body.replace('[x]', '[ ]'))).not.toEqual([]);
    expect(validate(body.replace('## Summary', '## Removed'))).not.toEqual([]);
  });
});
