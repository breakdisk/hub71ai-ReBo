import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARRIVAL_GUIDE,
  ARRIVAL_GUIDE_ACTION,
  COMMUNITY_DIRECTORY_PLACEHOLDER,
  COMMUNITY_OPT_IN_ACTION,
  SOFT_LANDING_REVIEW_NOTICE,
  WORKPLACE_CONTEXT_NOTE,
  WORKPLACE_ETIQUETTE,
  contentHasExternalLinks,
} from '../src/content/softLandingContent.ts';

test('soft-landing copy is static prototype content marked for local review', () => {
  assert.match(SOFT_LANDING_REVIEW_NOTICE, /prototype/i);
  assert.match(SOFT_LANDING_REVIEW_NOTICE, /local review/i);
  assert.equal(ARRIVAL_GUIDE.length, 3);
  assert.match(ARRIVAL_GUIDE_ACTION, /optional/i);
  assert.equal(WORKPLACE_ETIQUETTE.length, 3);
  assert.match(WORKPLACE_CONTEXT_NOTE, /diverse/i);
  assert.equal(contentHasExternalLinks(), false);
});

test('community exploration is explicit opt-in and only reveals a no-matchmaking placeholder', () => {
  assert.match(COMMUNITY_OPT_IN_ACTION, /choose/i);
  assert.match(COMMUNITY_OPT_IN_ACTION, /family & community/i);
  const disclosure = Object.values(COMMUNITY_DIRECTORY_PLACEHOLDER).join(' ');
  assert.match(disclosure, /no directory, referrals, or matching are active/i);
  assert.match(disclosure, /No family details or interests are collected or sent/i);
  assert.match(disclosure, /separate, informed choice/i);
  assert.equal(contentHasExternalLinks(), false);
});
