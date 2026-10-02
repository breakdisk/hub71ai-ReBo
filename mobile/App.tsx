import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Network from 'expo-network';
import { getEncryptedDatabase } from './src/db/encryptedDatabase.ts';
import { outboxRepository } from './src/db/outboxRepository.ts';
import { normalizeOnboardingDraft, validateOnboardingDraft, type ValidationErrors } from './src/onboardingValidation.ts';
import { OnboardingApiClient } from './src/sync/onboardingApi.ts';
import { SyncWorker } from './src/sync/syncWorker.ts';
import { IdentityVault } from './src/vault/identityVault.ts';
import { SoftLandingSection } from './src/components/SoftLandingSection.tsx';
import type { OnboardingDraft, OutboxItem } from './src/types.ts';

const apiClient = new OnboardingApiClient();
const syncWorker = new SyncWorker(outboxRepository, new IdentityVault(), (key, payload) => apiClient.submit(key, payload));
const EMPTY_DRAFT: OnboardingDraft = { firstName: '', lastName: '', email: '', identityToken: '' };

export default function App() {
  const network = Network.useNetworkState();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [storeReady, setStoreReady] = useState(false);
  const [storeFailed, setStoreFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState('Your progress saves on this device first.');
  const syncLock = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshItems = useCallback(async () => {
    const nextItems = await outboxRepository.getAll();
    setItems(nextItems);
  }, []);

  const runSync = useCallback(async () => {
    if (!storeReady || syncLock.current) return;
    if (network.isConnected === false) {
      setNotice('Saved on this device. Waiting for an internet connection to sync.');
      return;
    }

    syncLock.current = true;
    setIsSyncing(true);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    try {
      const result = await syncWorker.syncPending();
      await refreshItems();
      if (result.synced > 0) {
        setNotice(result.synced === 1 ? 'Your onboarding is now with the relocation team.' : `${result.synced} onboardings synced.`);
      } else if (result.needsAttention > 0) {
        setNotice('One item needs attention. Check its status below and submit updated details if needed.');
      } else if (result.retrying > 0) {
        setNotice('Saved here. We’ll retry automatically when the service is available.');
      }

      const nextRetryAt = await outboxRepository.getNextRetryAt();
      if (nextRetryAt !== null) {
        const delay = Math.max(250, Math.min(nextRetryAt - Date.now(), 60_000));
        retryTimer.current = setTimeout(() => void runSync(), delay);
      }
    } catch {
      // Storage and network errors can carry personal data; show a generic status and never log them.
      setNotice('Your details remain saved on this device. Sync will try again shortly.');
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
    }
  }, [network.isConnected, refreshItems, storeReady]);

  useEffect(() => {
    void (async () => {
      try {
        await getEncryptedDatabase();
        const savedDraft = await outboxRepository.getDraft();
        setDraft({ ...EMPTY_DRAFT, ...savedDraft });
        await refreshItems();
        setStoreReady(true);
      } catch {
        setStoreFailed(true);
      }
    })();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [refreshItems]);

  useEffect(() => {
    if (storeReady) void runSync();
  }, [network.isConnected, runSync, storeReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runSync();
    });
    return () => subscription.remove();
  }, [runSync]);

  const setField = (field: keyof OnboardingDraft, value: string) => {
    const nextDraft = { ...draft, [field]: value };
    setDraft(nextDraft);
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field !== 'identityToken') {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = setTimeout(() => {
        void outboxRepository.saveDraft({ firstName: nextDraft.firstName, lastName: nextDraft.lastName, email: nextDraft.email });
      }, 350);
    }
  };

  const submitOnboarding = async () => {
    const nextErrors = validateOnboardingDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setNotice('Check the highlighted fields to continue.');
      return;
    }
    if (!storeReady || isSaving) return;

    setIsSaving(true);
    try {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      const item = await outboxRepository.enqueue(normalizeOnboardingDraft(draft));
      await outboxRepository.clearDraft();
      await refreshItems();
      setDraft(EMPTY_DRAFT);
      setNotice(`Saved securely on this device. Reference ${item.idempotencyKey.slice(0, 8).toUpperCase()} is ready to sync.`);
      await runSync();
    } catch {
      setNotice('Could not save this onboarding locally. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const pendingCount = items.filter((item) => ['queued', 'retry', 'sending'].includes(item.status)).length;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.navy} />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>O</Text></View>
              <Text style={styles.brand}>ONBOARD ENGINE</Text>
              <View style={styles.secureTag}><Text style={styles.secureTagText}>PRIVATE BY DESIGN</Text></View>
            </View>
            <Text style={styles.eyebrow}>YOUR NEXT CHAPTER, MADE EASIER</Text>
            <Text style={styles.title}>A smoother start{ '\n' }to life in the UAE.</Text>
            <Text style={styles.heroCopy}>Share a few details once. We’ll keep your move progressing, even when you’re offline.</Text>
            <View style={styles.stepLine}>
              <Step number="01" label="Your details" active />
              <View style={styles.stepConnector} />
              <Step number="02" label="Visa & arrival" />
              <View style={styles.stepConnector} />
              <Step number="03" label="Settling in" />
            </View>
          </View>

          <View style={styles.main}>
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.kicker}>LET’S GET STARTED</Text>
                <Text style={styles.sectionTitle}>Your onboarding details</Text>
              </View>
              <View style={[styles.connectionPill, network.isConnected === false ? styles.connectionOffline : styles.connectionOnline]}>
                <View style={[styles.connectionDot, network.isConnected === false ? styles.dotOffline : styles.dotOnline]} />
                <Text style={styles.connectionText}>{network.isConnected === false ? 'OFFLINE' : 'CONNECTED'}</Text>
              </View>
            </View>
            <Text style={styles.sectionCopy}>We’ll save locally first and sync to your relocation pipeline when connected.</Text>

            <View style={styles.form}>
              <View style={styles.nameRow}>
                <FormField label="First name" value={draft.firstName} onChange={(value) => setField('firstName', value)} error={errors.firstName} autoComplete="given-name" />
                <FormField label="Last name" value={draft.lastName} onChange={(value) => setField('lastName', value)} error={errors.lastName} autoComplete="family-name" />
              </View>
              <FormField label="Email address" value={draft.email} onChange={(value) => setField('email', value)} error={errors.email} autoComplete="email" keyboardType="email-address" />
              <FormField
                label="Identity vault token"
                value={draft.identityToken}
                onChange={(value) => setField('identityToken', value)}
                error={errors.identityToken}
                autoCapitalize="none"
                autoComplete="off"
                placeholder="tok_demo_ref_1234ABCD"
                helper="Synthetic token references only. Never enter a passport number or upload an identity document."
              />

              <View style={styles.privacyNote}>
                <Text style={styles.lockIcon}>⌑</Text>
                <Text style={styles.privacyCopy}>Your profile is stored in an encrypted local outbox. The token reference stays in the device’s secure storage.</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => void submitOnboarding()}
                disabled={!storeReady || isSaving}
                style={({ pressed }) => [styles.submitButton, (pressed || isSaving) && styles.submitPressed, !storeReady && styles.submitDisabled]}
              >
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save & continue <Text style={styles.arrow}>→</Text></Text>}
              </Pressable>
              <Text style={styles.localFirst}>NO SIGNAL? NO PROBLEM. YOUR PROGRESS IS STORED LOCALLY.</Text>
            </View>

            <View style={styles.statusBar}>
              <View style={styles.statusIcon}><Text style={styles.statusIconText}>{pendingCount > 0 ? '↻' : '✓'}</Text></View>
              <View style={styles.statusMessageWrap}>
                <Text style={styles.statusLabel}>{pendingCount > 0 ? `${pendingCount} ITEM${pendingCount === 1 ? '' : 'S'} WAITING TO SYNC` : 'ONBOARDING STATUS'}</Text>
                <Text style={styles.statusMessage}>{storeFailed ? 'Secure local storage is unavailable on this build.' : notice}</Text>
              </View>
              {storeReady && pendingCount > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Sync now" onPress={() => void runSync()} disabled={isSyncing} style={styles.syncButton}>
                  {isSyncing ? <ActivityIndicator color={COLORS.green} size="small" /> : <Text style={styles.syncButtonText}>SYNC</Text>}
                </Pressable>
              )}
            </View>

            <SoftLandingSection />

            {items.length > 0 && (
              <View style={styles.activitySection}>
                <View style={styles.activityHeading}>
                  <View>
                    <Text style={styles.kicker}>YOUR RELOCATION JOURNEY</Text>
                    <Text style={styles.sectionTitle}>Recent activity</Text>
                  </View>
                  <Text style={styles.activityCount}>{items.length.toString().padStart(2, '0')}</Text>
                </View>
                {items.slice(0, 5).map((item) => <OutboxCard item={item} key={item.idempotencyKey} />)}
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Questions about your move?</Text>
              <Text style={styles.footerLink}>Your relocation coordinator is here to help.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Step({ number, label, active = false }: { number: string; label: string; active?: boolean }) {
  return (
    <View style={styles.step}>
      <Text style={[styles.stepNumber, active && styles.stepActiveNumber]}>{number}</Text>
      <Text style={[styles.stepLabel, active && styles.stepActiveLabel]}>{label}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChange,
  error,
  helper,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
} & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'onChange' | 'onChangeText'>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={COLORS.placeholder}
        selectionColor={COLORS.green}
        style={[styles.input, error ? styles.inputError : undefined]}
        returnKeyType="next"
        {...inputProps}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : helper ? <Text style={styles.helperText}>{helper}</Text> : null}
    </View>
  );
}

function OutboxCard({ item }: { item: OutboxItem }) {
  const status = statusPresentation(item);
  const date = new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <View style={styles.outboxCard}>
      <View style={styles.outboxTimeline}><View style={[styles.outboxDot, { backgroundColor: status.color }]} /><View style={styles.outboxLine} /></View>
      <View style={styles.outboxDetails}>
        <View style={styles.outboxTop}>
          <Text numberOfLines={1} style={styles.outboxName}>{item.firstName} {item.lastName}</Text>
          <Text style={[styles.outboxStatus, { color: status.color }]}>{status.label}</Text>
        </View>
        <Text style={styles.outboxSubline}>{item.pipelineId ? `Pipeline ${item.pipelineId.slice(0, 8)} · ${item.stage ?? 'In progress'}` : `Onboarding saved · ${date}`}</Text>
        {item.status === 'attention' && <Text style={styles.outboxHelp}>Please review your details and submit an updated onboarding.</Text>}
      </View>
    </View>
  );
}

function statusPresentation(item: OutboxItem): { label: string; color: string } {
  if (item.status === 'synced') return { label: 'IN PROGRESS', color: COLORS.green };
  if (item.status === 'attention') return { label: 'ACTION NEEDED', color: COLORS.orange };
  if (item.status === 'sending') return { label: 'SYNCING', color: COLORS.blue };
  return { label: 'SAVED OFFLINE', color: COLORS.muted };
}

const COLORS = {
  navy: '#10243A',
  navyDeep: '#0B1B2B',
  green: '#19856B',
  greenSoft: '#E7F4F0',
  blue: '#49759A',
  orange: '#B56E22',
  muted: '#708091',
  ink: '#162B40',
  copy: '#5F6F7F',
  line: '#E3E8EC',
  canvas: '#F5F7F8',
  placeholder: '#9AA6B1',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  keyboard: { flex: 1 },
  content: { flexGrow: 1 },
  hero: { backgroundColor: COLORS.navy, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 33 },
  brandMark: { width: 29, height: 29, borderRadius: 9, backgroundColor: '#D8B56A', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  brandMarkText: { color: COLORS.navyDeep, fontSize: 17, fontWeight: '800' },
  brand: { color: '#F3F5F4', fontSize: 11, fontWeight: '700', letterSpacing: 1.45 },
  secureTag: { marginLeft: 'auto', borderWidth: 1, borderColor: '#496074', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 9 },
  secureTagText: { fontSize: 8, letterSpacing: 1, color: '#C0CCD5', fontWeight: '700' },
  eyebrow: { color: '#C2AB78', fontSize: 9, letterSpacing: 2, fontWeight: '700', marginBottom: 11 },
  title: { color: '#FFFFFF', fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -0.8 },
  heroCopy: { color: '#CBD4DD', fontSize: 14, lineHeight: 22, maxWidth: 400, marginTop: 12 },
  stepLine: { flexDirection: 'row', alignItems: 'center', marginTop: 29 },
  step: { minWidth: 78 },
  stepNumber: { color: '#718397', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  stepActiveNumber: { color: '#E4C47E' },
  stepLabel: { color: '#8292A0', fontSize: 10 },
  stepActiveLabel: { color: '#F7F8F8' },
  stepConnector: { height: 1, backgroundColor: '#526477', flex: 1, marginHorizontal: 10, marginBottom: 14 },
  main: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: COLORS.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginBottom: 7 },
  sectionTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  sectionCopy: { color: COLORS.copy, fontSize: 12, lineHeight: 19, marginTop: 8 },
  connectionPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20 },
  connectionOnline: { backgroundColor: COLORS.greenSoft },
  connectionOffline: { backgroundColor: '#F7ECE0' },
  connectionDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  dotOnline: { backgroundColor: COLORS.green },
  dotOffline: { backgroundColor: COLORS.orange },
  connectionText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.65, color: COLORS.ink },
  form: { backgroundColor: '#FFFFFF', borderColor: '#E5E9EC', borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 22, shadowColor: '#172A3A', shadowOpacity: 0.035, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  nameRow: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, marginBottom: 15 },
  label: { color: '#31485B', fontSize: 11, fontWeight: '600', marginBottom: 7 },
  input: { height: 47, borderWidth: 1, borderColor: '#DDE4E8', borderRadius: 9, backgroundColor: '#FBFCFC', paddingHorizontal: 12, color: COLORS.ink, fontSize: 13 },
  inputError: { borderColor: '#BD5F50' },
  errorText: { color: '#A74435', fontSize: 10, marginTop: 5, lineHeight: 14 },
  helperText: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', padding: 11, backgroundColor: '#F3F7F7', borderRadius: 9, marginTop: 1, marginBottom: 16 },
  lockIcon: { color: COLORS.green, fontSize: 16, fontWeight: '700', marginRight: 9, lineHeight: 19 },
  privacyCopy: { flex: 1, color: '#496071', fontSize: 10, lineHeight: 15 },
  submitButton: { height: 49, backgroundColor: COLORS.green, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  submitPressed: { opacity: 0.85 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  arrow: { fontSize: 17 },
  localFirst: { color: '#81909B', fontSize: 8, fontWeight: '700', letterSpacing: 0.75, textAlign: 'center', marginTop: 13 },
  statusBar: { flexDirection: 'row', alignItems: 'center', marginTop: 18, padding: 13, backgroundColor: '#EAF3F0', borderRadius: 12, borderWidth: 1, borderColor: '#DDECE6' },
  statusIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#D6E9E1', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  statusIconText: { color: COLORS.green, fontWeight: '800', fontSize: 15 },
  statusMessageWrap: { flex: 1 },
  statusLabel: { color: COLORS.green, fontSize: 8, letterSpacing: 1, fontWeight: '800', marginBottom: 3 },
  statusMessage: { color: '#3D5667', fontSize: 10, lineHeight: 15 },
  syncButton: { paddingVertical: 9, paddingHorizontal: 11, marginLeft: 8 },
  syncButtonText: { color: COLORS.green, fontSize: 9, letterSpacing: 0.6, fontWeight: '800' },
  activitySection: { marginTop: 30 },
  activityHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 9 },
  activityCount: { color: '#9BA7B0', fontSize: 11, fontWeight: '700' },
  outboxCard: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12, paddingTop: 13, minHeight: 62 },
  outboxTimeline: { width: 17, alignItems: 'center', paddingTop: 3 },
  outboxDot: { width: 7, height: 7, borderRadius: 4 },
  outboxLine: { width: 1, flex: 1, backgroundColor: '#E0E6E9', marginTop: 4 },
  outboxDetails: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
  outboxTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  outboxName: { color: COLORS.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  outboxStatus: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6, marginLeft: 8 },
  outboxSubline: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  outboxHelp: { color: COLORS.orange, fontSize: 10, marginTop: 4 },
  footer: { paddingTop: 28, paddingBottom: 8, alignItems: 'center' },
  footerText: { color: COLORS.muted, fontSize: 10 },
  footerLink: { color: COLORS.green, fontSize: 10, marginTop: 3, fontWeight: '600' },
});
