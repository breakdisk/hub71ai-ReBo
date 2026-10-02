export type StaticGuideItem = {
  title: string;
  body: string;
};

export const SOFT_LANDING_REVIEW_NOTICE =
  'PROTOTYPE CONTENT · FOR LOCAL REVIEW BEFORE RELEASE';

export const ARRIVAL_GUIDE_ACTION = 'Open the optional arrival guide';
export const ARRIVAL_GUIDE: readonly StaticGuideItem[] = [
  {
    title: 'Before you travel',
    body: 'Use your employer’s current checklist to confirm entry documents, your flight and accommodation arrangements, and the agreed arrival plan. Requirements and arrangements can change, so confirm details with your relocation coordinator.',
  },
  {
    title: 'On arrival day',
    body: 'Keep the pickup and accommodation details shared by your employer available. Follow your chosen transport plan; this app does not request your location or plan a route.',
  },
  {
    title: 'During your first week',
    body: 'Ask your coordinator which onboarding appointments need to be arranged and what to bring. Follow current instructions from the relevant service and your appointment confirmation.',
  },
];

export const WORKPLACE_ETIQUETTE: readonly StaticGuideItem[] = [
  {
    title: 'Start with respect and curiosity',
    body: 'Use the name or title your colleague prefers. Let the other person set the pace for greetings and personal space; customs vary by person and situation.',
  },
  {
    title: 'Make meetings easy to follow',
    body: 'Aim to arrive on time, listen closely, and confirm owners and next steps. If a decision or process is unclear, ask how your team prefers to handle it.',
  },
  {
    title: 'Check your team’s norms',
    body: 'Ask your employer about dress expectations and client-site practices. During Ramadan or other observances, check with colleagues about schedules rather than making assumptions.',
  },
];

export const WORKPLACE_CONTEXT_NOTE =
  'The UAE is diverse. These are conversation starters, not rules for every person or workplace.';

export const COMMUNITY_OPT_IN_ACTION = 'I choose to explore family & community options';
export const COMMUNITY_DIRECTORY_PLACEHOLDER = {
  title: 'Optional directory & referral service',
  body: 'This is a local prototype placeholder; no directory, referrals, or matching are active. Choosing to view this note does not create a profile or contact anyone. No family details or interests are collected or sent.',
  nextStep: 'A future service could offer a directory or a human referral only after a separate, informed choice.',
} as const;

export function contentHasExternalLinks(): boolean {
  const strings = [
    SOFT_LANDING_REVIEW_NOTICE,
    ARRIVAL_GUIDE_ACTION,
    WORKPLACE_CONTEXT_NOTE,
    COMMUNITY_OPT_IN_ACTION,
    ...ARRIVAL_GUIDE.flatMap(({ title, body }) => [title, body]),
    ...WORKPLACE_ETIQUETTE.flatMap(({ title, body }) => [title, body]),
    ...Object.values(COMMUNITY_DIRECTORY_PLACEHOLDER),
  ];
  return strings.some((text) => /https?:\/\//i.test(text));
}
