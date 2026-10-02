import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  saveCommunityInterestSelection,
  toggleCommunityInterestCategory,
  withdrawCommunityInterestSelection,
} from '../src/content/communityInterest.ts';
import type { CommunityInterestCategory } from '../src/content/softLandingContent.ts';

const professional = 'professional-networking' satisfies CommunityInterestCategory;
const outdoors = 'sports-outdoors' satisfies CommunityInterestCategory;

test('community topics can be selected and deselected locally before consent', () => {
  const first = toggleCommunityInterestCategory([], professional);
  assert.deepEqual(first, [professional]);
  const second = toggleCommunityInterestCategory(first, outdoors);
  assert.deepEqual(second, [professional, outdoors]);
  assert.deepEqual(toggleCommunityInterestCategory(second, professional), [outdoors]);
  assert.deepEqual(first, [professional], 'selection updates must not mutate prior state');
});

test('community interests are not saved without explicit consent or a user-selected category', () => {
  assert.equal(saveCommunityInterestSelection([professional], false), null);
  assert.equal(saveCommunityInterestSelection([], true), null);
});

test('explicit opt-in stores only selected categories, and withdrawal deletes them', () => {
  const optedIn = saveCommunityInterestSelection([professional, outdoors, professional], true);
  assert.deepEqual(optedIn, { consented: true, categories: [professional, outdoors] });

  const withdrawn = withdrawCommunityInterestSelection();
  assert.deepEqual(withdrawn, { consented: false, categories: [] });
  assert.notEqual(withdrawn, optedIn);
});
