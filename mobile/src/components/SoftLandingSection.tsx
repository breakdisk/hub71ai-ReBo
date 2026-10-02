import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  ARRIVAL_GUIDE,
  ARRIVAL_GUIDE_ACTION,
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
} from '../content/softLandingContent.ts';
import {
  saveCommunityInterestSelection,
  toggleCommunityInterestCategory,
  withdrawCommunityInterestSelection,
} from '../content/communityInterest.ts';
import type { CommunityInterestCategory } from '../content/softLandingContent.ts';

/**
 * Local-only resident guidance. Neighborhood and community choices stay in
 * component memory; this section has no location, persistence, or API access.
 */
export function SoftLandingSection() {
  const [arrivalGuideOpen, setArrivalGuideOpen] = useState(false);
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState<string | null>(null);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [communityEditorOpen, setCommunityEditorOpen] = useState(false);
  const [communityDraft, setCommunityDraft] = useState<CommunityInterestCategory[]>([]);
  const [communitySelection, setCommunitySelection] = useState(withdrawCommunityInterestSelection);
  const selectedNeighborhood = NEIGHBORHOOD_GUIDES.find((area) => area.id === selectedNeighborhoodId);

  const openCommunityEditor = () => {
    setCommunityDraft([]);
    setCommunityEditorOpen(true);
  };

  const closeCommunityEditor = () => {
    setCommunityDraft([]);
    setCommunityEditorOpen(false);
  };

  const saveCommunityInterests = () => {
    const saved = saveCommunityInterestSelection(communityDraft, true);
    if (!saved) return;
    setCommunitySelection(saved);
    setCommunityDraft([]);
    setCommunityEditorOpen(false);
  };

  const withdrawCommunityInterests = () => {
    setCommunitySelection(withdrawCommunityInterestSelection());
    setCommunityDraft([]);
    setCommunityEditorOpen(false);
  };

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>A GENTLER LANDING</Text>
          <Text style={styles.title}>Settle in, at your pace</Text>
        </View>
        <Text style={styles.reviewTag}>REVIEW PENDING</Text>
      </View>
      <Text style={styles.notice}>{SOFT_LANDING_REVIEW_NOTICE}</Text>
      <Text style={styles.reviewDate}>Content review date: {CONTENT_REVIEW_DATE}</Text>

      <View style={styles.card}>
        <CardHeading number="01" title="Your arrival guide" subtitle="An optional checklist with no location tracking" badgeStyle={styles.arrivalBadge} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: arrivalGuideOpen }}
          onPress={() => setArrivalGuideOpen((open) => !open)}
          style={({ pressed }) => [styles.disclosureButton, pressed && styles.pressed]}
        >
          <Text style={styles.disclosureText}>{arrivalGuideOpen ? 'Close arrival guide' : ARRIVAL_GUIDE_ACTION}</Text>
          <Text style={styles.chevron}>{arrivalGuideOpen ? '−' : '+'}</Text>
        </Pressable>
        {arrivalGuideOpen && (
          <View style={styles.guideList}>
            {ARRIVAL_GUIDE.map((item, index) => <GuideItem key={item.title} item={item} number={index + 1} />)}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <CardHeading number="02" title="Explore your area" subtitle="Choose a neighborhood manually, or skip" badgeStyle={styles.areaBadge} />
        <Text style={styles.sectionIntro}>{NEIGHBORHOOD_PRIVACY_NOTICE}</Text>
        <View style={styles.choiceWrap}>
          {NEIGHBORHOOD_GUIDES.map((area) => {
            const selected = selectedNeighborhoodId === area.id;
            return (
              <Pressable
                key={area.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setSelectedNeighborhoodId(area.id)}
                style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{area.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip neighborhood selection"
          onPress={() => setSelectedNeighborhoodId(null)}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
        >
          <Text style={styles.skipText}>{selectedNeighborhood ? 'Clear area selection' : 'Skip for now'}</Text>
        </Pressable>
        {selectedNeighborhood ? (
          <View accessibilityLiveRegion="polite" style={styles.guideList}>
            {selectedNeighborhood.tips.map((item, index) => <GuideItem key={item.title} item={item} number={index + 1} />)}
          </View>
        ) : (
          <Text style={styles.noAreaText}>No area selected. You can choose one whenever it is useful.</Text>
        )}
      </View>

      <View style={styles.card}>
        <CardHeading number="03" title="Cultural intelligence micro-lessons" subtitle="Short, optional practice prompts" badgeStyle={styles.workplaceBadge} />
        <Text style={styles.sectionIntro}>These are broad conversation prompts, not assumptions about any individual.</Text>
        {CQ_MICRO_LESSONS.map((lesson) => {
          const open = openLessonId === lesson.title;
          return (
            <View key={lesson.title} style={styles.lesson}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenLessonId(open ? null : lesson.title)}
                style={({ pressed }) => [styles.lessonButton, pressed && styles.pressed]}
              >
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.chevron}>{open ? '−' : '+'}</Text>
              </Pressable>
              {open && (
                <View style={styles.lessonBody}>
                  <Text style={styles.promptLabel}>SITUATION</Text>
                  <Text style={styles.guideBody}>{lesson.situation}</Text>
                  <Text style={[styles.promptLabel, styles.practiceLabel]}>TRY THIS</Text>
                  <Text style={styles.guideBody}>{lesson.practice}</Text>
                  <Text style={[styles.promptLabel, styles.practiceLabel]}>REFLECT</Text>
                  <Text style={styles.guideBody}>{lesson.reflection}</Text>
                </View>
              )}
            </View>
          );
        })}
        <Text style={styles.contextNote}>{CQ_CONTEXT_NOTE}</Text>
      </View>

      <View style={styles.card}>
        <CardHeading number="04" title="Community topics" subtitle="Optional, user-selected interests" badgeStyle={styles.communityBadge} />
        <Text style={styles.communityIntro}>{COMMUNITY_PRIVACY_NOTICE}</Text>
        {communitySelection.consented ? (
          <View accessibilityLiveRegion="polite" style={styles.savedBox}>
            <Text style={styles.savedTitle}>Your session-only interests</Text>
            <View style={styles.choiceWrap}>
              {communitySelection.categories.map((category) => {
                const label = COMMUNITY_INTEREST_CATEGORIES.find((item) => item.id === category)?.label ?? category;
                return <Text key={category} style={styles.savedChip}>{label}</Text>;
              })}
            </View>
            <Text style={styles.savedCopy}>Nothing was sent. These choices stay in this screen’s memory and are removed when you close the app.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={withdrawCommunityInterests}
              style={({ pressed }) => [styles.withdrawButton, pressed && styles.pressed]}
            >
              <Text style={styles.withdrawText}>{COMMUNITY_WITHDRAW_ACTION}</Text>
            </Pressable>
          </View>
        ) : communityEditorOpen ? (
          <View style={styles.communityEditor}>
            <Text style={styles.selectPrompt}>Select any topics you may want to explore. Do not include names or personal details.</Text>
            <View style={styles.choiceWrap}>
              {COMMUNITY_INTEREST_CATEGORIES.map(({ id, label }) => {
                const selected = communityDraft.includes(id);
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setCommunityDraft((current) => toggleCommunityInterestCategory(current, id))}
                    style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? '✓  ' : ''}{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: communityDraft.length === 0 }}
              disabled={communityDraft.length === 0}
              onPress={saveCommunityInterests}
              style={({ pressed }) => [styles.consentButton, communityDraft.length === 0 && styles.disabledButton, pressed && styles.pressed]}
            >
              <Text style={styles.consentButtonText}>{COMMUNITY_CONSENT_ACTION}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={closeCommunityEditor}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>Cancel and clear my choices</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={openCommunityEditor}
            style={({ pressed }) => [styles.communityButton, pressed && styles.pressed]}
          >
            <Text style={styles.communityButtonText}>{COMMUNITY_CHOOSE_ACTION}</Text>
            <Text style={styles.communityChevron}>→</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function CardHeading({
  number,
  title,
  subtitle,
  badgeStyle,
}: {
  number: string;
  title: string;
  subtitle: string;
  badgeStyle: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.cardHeading}>
      <View style={[styles.iconBadge, badgeStyle]}><Text style={styles.iconText}>{number}</Text></View>
      <View style={styles.cardHeadingCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function GuideItem({ item, number }: { item: { title: string; body: string }; number: number }) {
  return (
    <View style={styles.guideItem}>
      <View style={styles.guideNumber}><Text style={styles.guideNumberText}>{number.toString().padStart(2, '0')}</Text></View>
      <View style={styles.guideItemCopy}>
        <Text style={styles.guideTitle}>{item.title}</Text>
        <Text style={styles.guideBody}>{item.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 30 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headingCopy: { flex: 1 },
  kicker: { color: '#19856B', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginBottom: 7 },
  title: { color: '#162B40', fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  reviewTag: { color: '#805E1F', backgroundColor: '#F4ECD9', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8, fontSize: 8, fontWeight: '800', letterSpacing: 0.6, marginLeft: 10 },
  notice: { color: '#788692', fontSize: 8, fontWeight: '700', letterSpacing: 0.6, marginTop: 8 },
  reviewDate: { color: '#788692', fontSize: 9, marginTop: 4, marginBottom: 10 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E4E9EC', borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 8 },
  cardHeading: { flexDirection: 'row', alignItems: 'center' },
  iconBadge: { width: 33, height: 33, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  arrivalBadge: { backgroundColor: '#E6F2EF' },
  areaBadge: { backgroundColor: '#F2EFE4' },
  workplaceBadge: { backgroundColor: '#E9EFF6' },
  communityBadge: { backgroundColor: '#F3EAF0' },
  iconText: { color: '#3C6574', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardHeadingCopy: { flex: 1 },
  cardTitle: { color: '#203649', fontSize: 13, fontWeight: '700' },
  cardSubtitle: { color: '#758492', fontSize: 10, lineHeight: 14, marginTop: 3 },
  sectionIntro: { color: '#617281', fontSize: 10, lineHeight: 15, marginTop: 11 },
  disclosureButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EDF0F2', marginTop: 12, paddingTop: 10 },
  disclosureText: { color: '#19856B', fontSize: 10, fontWeight: '700' },
  chevron: { color: '#19856B', fontSize: 18, fontWeight: '500', paddingLeft: 8 },
  pressed: { opacity: 0.65 },
  guideList: { borderTopWidth: 1, borderColor: '#EDF0F2', marginTop: 10, paddingTop: 2 },
  guideItem: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12 },
  guideNumber: { width: 27, paddingTop: 2 },
  guideNumberText: { color: '#8B9AA4', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  guideItemCopy: { flex: 1 },
  guideTitle: { color: '#263F53', fontSize: 11, fontWeight: '700' },
  guideBody: { color: '#617281', fontSize: 10, lineHeight: 15, marginTop: 3 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  choice: { borderWidth: 1, borderColor: '#DCE4E7', backgroundColor: '#FBFCFC', borderRadius: 17, paddingVertical: 8, paddingHorizontal: 10 },
  choiceSelected: { borderColor: '#19856B', backgroundColor: '#E7F4F0' },
  choiceText: { color: '#536879', fontSize: 9, fontWeight: '600' },
  choiceTextSelected: { color: '#176F5C' },
  skipButton: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: 2, marginTop: 3 },
  skipText: { color: '#19856B', fontSize: 9, fontWeight: '700' },
  noAreaText: { color: '#788692', fontSize: 9, marginTop: 3 },
  lesson: { borderTopWidth: 1, borderColor: '#EDF0F2', marginTop: 10 },
  lessonButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lessonTitle: { color: '#263F53', fontSize: 10, lineHeight: 15, fontWeight: '700', flex: 1, paddingRight: 8 },
  lessonBody: { borderLeftWidth: 2, borderLeftColor: '#9DB3C2', paddingLeft: 10, paddingBottom: 10 },
  promptLabel: { color: '#78909F', fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 6 },
  practiceLabel: { marginTop: 10 },
  contextNote: { color: '#657484', backgroundColor: '#F4F7F8', borderRadius: 8, padding: 10, fontSize: 9, lineHeight: 14, marginTop: 13 },
  communityIntro: { color: '#617281', fontSize: 10, lineHeight: 15, marginTop: 12 },
  communityButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F8F8', borderRadius: 8, paddingHorizontal: 10, marginTop: 10 },
  communityButtonText: { color: '#38676B', fontSize: 10, fontWeight: '700', flex: 1 },
  communityChevron: { color: '#38676B', fontSize: 15, paddingLeft: 8 },
  communityEditor: { marginTop: 5 },
  selectPrompt: { color: '#617281', fontSize: 9, lineHeight: 14, marginTop: 8 },
  consentButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#19856B', borderRadius: 8, paddingHorizontal: 10, marginTop: 14 },
  consentButtonText: { color: '#FFFFFF', textAlign: 'center', fontSize: 9, fontWeight: '700', lineHeight: 14 },
  disabledButton: { opacity: 0.45 },
  cancelButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { color: '#657484', fontSize: 9, fontWeight: '600' },
  savedBox: { backgroundColor: '#F5F8F8', borderRadius: 9, padding: 11, marginTop: 12 },
  savedTitle: { color: '#203649', fontSize: 10, fontWeight: '700' },
  savedChip: { color: '#176F5C', backgroundColor: '#E7F4F0', overflow: 'hidden', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 9, fontSize: 9, fontWeight: '600' },
  savedCopy: { color: '#657484', fontSize: 9, lineHeight: 14, marginTop: 10 },
  withdrawButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDB5B1', borderRadius: 8, paddingHorizontal: 8, marginTop: 10 },
  withdrawText: { color: '#954A41', textAlign: 'center', fontSize: 9, fontWeight: '700' },
});
