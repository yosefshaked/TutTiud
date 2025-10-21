import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const entryRowPath = path.join('src','components','time-entry','EntryRow.jsx');
const modalPath = path.join('src','components','time-entry','MultiDateEntryModal.jsx');

function fileContent(p){
  return fs.readFileSync(p,'utf8');
}

describe('instructor day card layout guards', () => {
  const content = fileContent(entryRowPath);
  it('does not use absolute positioning', () => {
    assert(!/\babsolute\b/.test(content));
  });
  it('does not use negative margins', () => {
    assert(!/\b-mt-/.test(content));
    assert(!/\b-mb-/.test(content));
  });
});

describe('multi-date modal scroll safety', () => {
  const content = fileContent(modalPath);
  it('body has bottom padding to keep footer clear', () => {
    const bodyMatch = content.match(/className="([^"]+)"\s*data-testid="md-body"/);
    assert(bodyMatch, 'body element not found');
    const classes = bodyMatch[1];
    const pad = classes.match(/pb-(\d+)/);
    assert(pad && parseInt(pad[1],10) >= 24, 'expected pb-24 or greater');
  });
  it('footer is rendered outside of scrollable body', () => {
    const bodyIndex = content.indexOf('data-testid="md-body"');
    const footerIndex = content.indexOf('data-testid="md-footer"');
    assert(footerIndex > bodyIndex, 'footer should come after body');
    const between = content.slice(bodyIndex, footerIndex);
    assert(!between.includes('data-testid="md-footer"'), 'footer should not be inside body');
  });
});
