import type { CommunityInterestCategory } from './softLandingContent.ts';

export type CommunityInterestSelection = {
  consented: boolean;
  categories: readonly CommunityInterestCategory[];
};

export function toggleCommunityInterestCategory(
  selected: readonly CommunityInterestCategory[],
  category: CommunityInterestCategory,
): CommunityInterestCategory[] {
  return selected.includes(category)
    ? selected.filter((item) => item !== category)
    : [...selected, category];
}

/** Returns null unless the user explicitly consents and has picked a topic. */
export function saveCommunityInterestSelection(
  categories: readonly CommunityInterestCategory[],
  explicitConsent: boolean,
): CommunityInterestSelection | null {
  const uniqueCategories = [...new Set(categories)];
  if (!explicitConsent || uniqueCategories.length === 0) return null;
  return { consented: true, categories: uniqueCategories };
}

/** Clearing this value withdraws consent and removes every selected topic. */
export function withdrawCommunityInterestSelection(): CommunityInterestSelection {
  return { consented: false, categories: [] };
}
