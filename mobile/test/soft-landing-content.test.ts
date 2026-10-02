import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARRIVAL_GUIDE,
  COMMUNITY_CHOOSE_ACTION,
  COMMUNITY_CONSENT_ACTION,
  COMMUNITY_INTEREST_CATEGORIES,
  COMMUNITY_PRIVACY_NOTICE,
  COMMUNITY_WITHDRAW_ACTION,
  CONTENT_REVIEW_DATE,
  CQ_CONTEXT_NOTE,
  CQ_MICRO_LESSONS,
  NEIGHBORHOOD_GUIDES,
  NEIGHBORHOOD_PRIVACY_NOTICE,
  SOFT_LANDING_REVIEW_NOTICE,
  contentHasExternalLinks,
} from '../src/content/softLandingContent.ts';

test('soft-landing content exposes an honest review state and optional manual area guides', () => {
  assert.match(SOFT_LANDING_REVIEW_NOTICE, /prototype guidance/i);
  assert.match(SOFT_LANDING_REVIEW_NOTICE, /local review pending/i);
  assert.equal(CONTENT_REVIEW_DATE, 'Not set');
  assert.equal(ARRIVAL_GUIDE.length, 3);
  assert.equal(NEIGHBORHOOD_GUIDES.length, 4);
  assert.deepEqual(NEIGHBORHOOD_GUIDES.map((area) => area.id), [
    'dubai-marina',
    'downtown-dubai',
    'jumeirah-lakes-towers',
    'abu-dhabi-corniche',
  ]);
  assert.ok(NEIGHBORHOOD_GUIDES.every((area) => area.tips.length > 0));
  assert.match(NEIGHBORHOOD_PRIVACY_NOTICE, /no GPS/i);
  assert.match(NEIGHBORHOOD_PRIVACY_NOTICE, /static prompts/i);
});

test('CQ micro-lessons are practical, non-prescriptive, and awaiting a local content review', () => {
  assert.equal(CQ_MICRO_LESSONS.length, 3);
  assert.ok(CQ_MICRO_LESSONS.every((lesson) => lesson.situation && lesson.practice && lesson.reflection));
  assert.match(CQ_CONTEXT_NOTE, /not rules/i);
  assert.match(CQ_CONTEXT_NOTE, /diverse/i);
});

test('community interests are broad, user-selected, and require a separate consent action', () => {
  assert.equal(COMMUNITY_INTEREST_CATEGORIES.length, 6);
  assert.match(COMMUNITY_CHOOSE_ACTION, /choose/i);
  assert.match(COMMUNITY_CONSENT_ACTION, /I consent/i);
  assert.match(COMMUNITY_CONSENT_ACTION, /this session/i);
  assert.match(COMMUNITY_WITHDRAW_ACTION, /withdraw consent/i);
  assert.match(COMMUNITY_WITHDRAW_ACTION, /delete/i);
  assert.match(COMMUNITY_PRIVACY_NOTICE, /not sent/i);
  assert.match(COMMUNITY_PRIVACY_NOTICE, /No directory, referral, or matching service is active/i);
  assert.match(COMMUNITY_PRIVACY_NOTICE, /does not ask for family, child, or contact details/i);
  assert.equal(contentHasExternalLinks(), false);
});
