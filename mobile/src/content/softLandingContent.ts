export type StaticGuideItem = {
  title: string;
  body: string;
};

export type NeighborhoodGuide = {
  id: string;
  name: string;
  tips: readonly StaticGuideItem[];
};

export type CqMicroLesson = {
  title: string;
  situation: string;
  practice: string;
  reflection: string;
};

export const SOFT_LANDING_REVIEW_NOTICE = 'PROTOTYPE GUIDANCE · LOCAL REVIEW PENDING';
export const CONTENT_REVIEW_DATE = 'Not set';
export const NEIGHBORHOOD_PRIVACY_NOTICE = 'No GPS or device location is used. Area tips are static prompts, not directions or live recommendations.';

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

/**
 * Static, manually selected neighborhood prompts. They intentionally avoid
 * live venue recommendations, directions, location access, and service claims.
 */
export const NEIGHBORHOOD_GUIDES: readonly NeighborhoodGuide[] = [
  {
    id: 'dubai-marina',
    name: 'Dubai Marina',
    tips: [
      { title: 'Confirm your building entrance', body: 'Ask your host which entrance and pickup point to use, especially if a building has more than one access point.' },
      { title: 'Check transport on the day', body: 'If you plan to use public transport, check current routes and service information through official transit channels before leaving.' },
    ],
  },
  {
    id: 'downtown-dubai',
    name: 'Downtown Dubai',
    tips: [
      { title: 'Agree on a meeting point', body: 'Confirm the building entrance or meeting point with your host so you can find one another without sharing your live location.' },
      { title: 'Check transport on the day', body: 'Check current routes, access, and service information through official transit channels before travelling.' },
    ],
  },
  {
    id: 'jumeirah-lakes-towers',
    name: 'Jumeirah Lakes Towers',
    tips: [
      { title: 'Confirm the tower and pickup point', body: 'Ask your host to confirm the exact tower or building name and agreed pickup point before arranging a visit.' },
      { title: 'Check transport on the day', body: 'Check current routes and service information through official transit channels before leaving.' },
    ],
  },
  {
    id: 'abu-dhabi-corniche',
    name: 'Abu Dhabi Corniche',
    tips: [
      { title: 'Ask about visitor access', body: 'Check with your accommodation host about the entrance and any visitor access steps for your building.' },
      { title: 'Check transport on the day', body: 'Check current local routes and service information through official transit channels before travelling.' },
    ],
  },
];

export const CQ_MICRO_LESSONS: readonly CqMicroLesson[] = [
  {
    title: 'Names, greetings, and personal space',
    situation: 'You are meeting a colleague or neighbor for the first time.',
    practice: 'Use the name or title they share, follow their lead on greetings, and give them room to set a comfortable pace.',
    reflection: 'What could you ask if you are unsure how someone prefers to be addressed?',
  },
  {
    title: 'Clear, respectful communication',
    situation: 'A meeting ends with an unclear decision or next step.',
    practice: 'Summarize what you heard and ask who owns the next step and when to check back. Team preferences can differ.',
    reflection: 'How would you check your own understanding without assuming everyone communicates the same way?',
  },
  {
    title: 'Schedules and observances',
    situation: 'You are planning a meeting or deadline around a holiday or observance.',
    practice: 'Ask about availability and working arrangements directly. Avoid assuming that one schedule or practice applies to everyone.',
    reflection: 'What open-ended question could help you plan inclusively?',
  },
];

export const CQ_CONTEXT_NOTE =
  'The UAE is diverse. These short prompts are conversation practice, not rules about how any person or workplace will behave.';

export const COMMUNITY_INTEREST_CATEGORIES = [
  { id: 'professional-networking', label: 'Professional networking' },
  { id: 'sports-outdoors', label: 'Sports and outdoors' },
  { id: 'arts-culture', label: 'Arts and culture' },
  { id: 'language-exchange', label: 'Language exchange' },
  { id: 'volunteering', label: 'Volunteering' },
  { id: 'neighborhood-events', label: 'Neighborhood events' },
] as const;

export type CommunityInterestCategory = (typeof COMMUNITY_INTEREST_CATEGORIES)[number]['id'];

export const COMMUNITY_PRIVACY_NOTICE =
  'Choose broad topics only. If you explicitly consent, your selected categories are kept in this screen’s memory for this session. They are not sent to an employer, directory, or other person. No directory, referral, or matching service is active. The app does not ask for family, child, or contact details.';
export const COMMUNITY_CHOOSE_ACTION = 'Choose community topics';
export const COMMUNITY_CONSENT_ACTION = 'I consent: keep these topics for this session';
export const COMMUNITY_WITHDRAW_ACTION = 'Withdraw consent and delete interests';

export function contentHasExternalLinks(): boolean {
  const strings = [
    SOFT_LANDING_REVIEW_NOTICE,
    NEIGHBORHOOD_PRIVACY_NOTICE,
    ...ARRIVAL_GUIDE.flatMap(({ title, body }) => [title, body]),
    ...NEIGHBORHOOD_GUIDES.flatMap(({ name, tips }) => [name, ...tips.flatMap(({ title, body }) => [title, body])]),
    ...CQ_MICRO_LESSONS.flatMap(({ title, situation, practice, reflection }) => [title, situation, practice, reflection]),
    CQ_CONTEXT_NOTE,
    COMMUNITY_PRIVACY_NOTICE,
    COMMUNITY_CHOOSE_ACTION,
    COMMUNITY_CONSENT_ACTION,
    COMMUNITY_WITHDRAW_ACTION,
    ...COMMUNITY_INTEREST_CATEGORIES.map(({ label }) => label),
  ];
  return strings.some((text) => /https?:\/\//i.test(text));
}
