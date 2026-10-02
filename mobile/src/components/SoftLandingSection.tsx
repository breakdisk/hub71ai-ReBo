import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ARRIVAL_GUIDE,
  ARRIVAL_GUIDE_ACTION,
  COMMUNITY_DIRECTORY_PLACEHOLDER,
  COMMUNITY_OPT_IN_ACTION,
  SOFT_LANDING_REVIEW_NOTICE,
  WORKPLACE_CONTEXT_NOTE,
  WORKPLACE_ETIQUETTE,
} from '../content/softLandingContent.ts';

/**
 * View-only soft-landing content. Disclosure state is in memory and is never
 * persisted, passed to the onboarding outbox, or sent to the API.
 */
export function SoftLandingSection() {
  const [arrivalGuideOpen, setArrivalGuideOpen] = useState(false);
  const [communityNoteOpen, setCommunityNoteOpen] = useState(false);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>A GENTLER LANDING</Text>
          <Text style={styles.title}>Settle in, at your pace</Text>
        </View>
        <Text style={styles.reviewTag}>LOCAL REVIEW</Text>
      </View>
      <Text style={styles.notice}>{SOFT_LANDING_REVIEW_NOTICE}</Text>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={[styles.iconBadge, styles.arrivalBadge]}><Text style={styles.iconText}>01</Text></View>
          <View style={styles.cardHeadingCopy}>
            <Text style={styles.cardTitle}>Your arrival guide</Text>
            <Text style={styles.cardSubtitle}>A short, static checklist saved in the app</Text>
          </View>
        </View>
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
        <View style={styles.cardHeading}>
          <View style={[styles.iconBadge, styles.workplaceBadge]}><Text style={styles.iconText}>02</Text></View>
          <View style={styles.cardHeadingCopy}>
            <Text style={styles.cardTitle}>UAE workplace etiquette</Text>
            <Text style={styles.cardSubtitle}>Three practical prompts for your first conversations</Text>
          </View>
        </View>
        <View style={styles.guideList}>
          {WORKPLACE_ETIQUETTE.map((item, index) => <GuideItem key={item.title} item={item} number={index + 1} />)}
        </View>
        <Text style={styles.contextNote}>{WORKPLACE_CONTEXT_NOTE}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={[styles.iconBadge, styles.communityBadge]}><Text style={styles.iconText}>03</Text></View>
          <View style={styles.cardHeadingCopy}>
            <Text style={styles.cardTitle}>Family & community</Text>
            <Text style={styles.cardSubtitle}>An optional directory / human-referral concept</Text>
          </View>
        </View>
        <Text style={styles.communityIntro}>You decide whether to view this placeholder. There is no automatic matchmaking.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: communityNoteOpen }}
          onPress={() => setCommunityNoteOpen((open) => !open)}
          style={({ pressed }) => [styles.communityButton, pressed && styles.pressed]}
        >
          <Text style={styles.communityButtonText}>{communityNoteOpen ? 'Hide optional note' : COMMUNITY_OPT_IN_ACTION}</Text>
          <Text style={styles.communityChevron}>{communityNoteOpen ? '−' : '+'}</Text>
        </Pressable>
        {communityNoteOpen && (
          <View style={styles.communityDisclosure}>
            <Text style={styles.disclosureTitle}>{COMMUNITY_DIRECTORY_PLACEHOLDER.title}</Text>
            <Text style={styles.disclosureBody}>{COMMUNITY_DIRECTORY_PLACEHOLDER.body}</Text>
            <Text style={styles.disclosureNext}>{COMMUNITY_DIRECTORY_PLACEHOLDER.nextStep}</Text>
          </View>
        )}
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
  notice: { color: '#788692', fontSize: 8, fontWeight: '700', letterSpacing: 0.6, marginTop: 8, marginBottom: 10 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E4E9EC', borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 8 },
  cardHeading: { flexDirection: 'row', alignItems: 'center' },
  iconBadge: { width: 33, height: 33, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  arrivalBadge: { backgroundColor: '#E6F2EF' },
  workplaceBadge: { backgroundColor: '#E9EFF6' },
  communityBadge: { backgroundColor: '#F3EAF0' },
  iconText: { color: '#3C6574', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardHeadingCopy: { flex: 1 },
  cardTitle: { color: '#203649', fontSize: 13, fontWeight: '700' },
  cardSubtitle: { color: '#758492', fontSize: 10, lineHeight: 14, marginTop: 3 },
  disclosureButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EDF0F2', marginTop: 12, paddingTop: 10 },
  disclosureText: { color: '#19856B', fontSize: 10, fontWeight: '700' },
  chevron: { color: '#19856B', fontSize: 18, fontWeight: '500' },
  pressed: { opacity: 0.65 },
  guideList: { borderTopWidth: 1, borderColor: '#EDF0F2', marginTop: 10, paddingTop: 2 },
  guideItem: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12 },
  guideNumber: { width: 27, paddingTop: 2 },
  guideNumberText: { color: '#8B9AA4', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  guideItemCopy: { flex: 1 },
  guideTitle: { color: '#263F53', fontSize: 11, fontWeight: '700' },
  guideBody: { color: '#617281', fontSize: 10, lineHeight: 15, marginTop: 3 },
  contextNote: { color: '#657484', backgroundColor: '#F4F7F8', borderRadius: 8, padding: 10, fontSize: 9, lineHeight: 14, marginTop: 13 },
  communityIntro: { color: '#617281', fontSize: 10, lineHeight: 15, marginTop: 12 },
  communityButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F8F8', borderRadius: 8, paddingHorizontal: 10, marginTop: 10 },
  communityButtonText: { color: '#38676B', fontSize: 10, fontWeight: '700', flex: 1 },
  communityChevron: { color: '#38676B', fontSize: 17, paddingLeft: 8 },
  communityDisclosure: { backgroundColor: '#FBF8FA', borderLeftWidth: 2, borderLeftColor: '#9B6D87', paddingHorizontal: 11, paddingVertical: 10, marginTop: 10 },
  disclosureTitle: { color: '#493343', fontSize: 10, fontWeight: '700' },
  disclosureBody: { color: '#675967', fontSize: 9, lineHeight: 14, marginTop: 5 },
  disclosureNext: { color: '#675967', fontSize: 9, lineHeight: 14, marginTop: 6, fontStyle: 'italic' },
});
