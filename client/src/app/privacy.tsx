import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { fonts, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

// The plain-English privacy policy, also the public policy URL (doubledone.app/
// privacy) for a store listing. Kept honest and calm, no legalese walls: it
// states the real posture (local-first, email-only PII, AI egress + pseudonymous
// retention, no selling) the way the rest of the app talks.
//
// SYNC NOTE: the public, crawlable copy is client/public/privacy.html (served at /privacy for
// store listings and crawlers, since this screen renders client-side). Keep both in step.
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six }]}>
        <BackLink fallback="/settings" />

        <Text style={styles.title}>Privacy</Text>
        <Text style={styles.updated}>Last updated 27 June 2026.</Text>

        <Text style={styles.lead}>
          DoubleDone is built to need almost nothing from you. It runs on your device, and nothing leaves it unless you
          choose to sync across devices or use an AI feature. This is the plain version of what that means.
        </Text>

        <Section styles={styles} heading="On your device by default">
          Your tasks live on your device. You can use the whole app, capture, break things down, the Lookback, all of
          it, with no account and nothing sent anywhere.
        </Section>

        <Section styles={styles} heading="If you choose to sync">
          Syncing across devices is optional. If you turn it on, the only personal information held is your email
          address, used to send a one-time sign-in code. There is no password. Your tasks are stored in rows only you
          can read (row-level security scopes every row to your account). You can sign out, or stop syncing, any time.
        </Section>

        <View style={styles.section}>
          <Text style={styles.heading}>The AI features</Text>
          <Text style={styles.body}>
            Break it down, Lighten today, and Sort for me send the text you typed to our server, which passes it to
            Anthropic&apos;s Claude to do the work. Anthropic does not train their models on it, and does not keep your
            text or the response by default. Anything flagged for safety or legal reasons can be held by Anthropic for
            up to two years. Separately, we keep a copy on our side, without your name, account, or IP address, to
            improve how the app breaks tasks down for everyone. It is pseudonymous and aggregate, never tied to you and
            never sold.
          </Text>
          <Text style={styles.body}>
            And when you finish steps from a broken-down task, the app notes only that they got done, a random id and
            a number of days, never the task text or anything about you, so it can learn how long things really take.
            Prefer not to? Just don&apos;t use those features. The rest of the app works fully without them.
          </Text>
        </View>

        <Section styles={styles} heading="Payment events">
          Payments for Premium are processed by Stripe, not by us. We never see or store your card details. When a
          payment event happens on your subscription, a payment succeeding or failing, a refund, or a chargeback,
          Stripe sends us an automated note of the event type, the amount, and a Stripe event id, so we can keep your
          Premium status correct. We never sell or share it.
        </Section>

        <Section styles={styles} heading="Keeping the service running">
          To keep DoubleDone up and within budget, our systems alert the owner when something needs attention, for
          example AI spending nearing its cap, an unusual spike in errors, or signs of abuse. These alerts hold only
          numbers, error messages, and the names of the parts of the system involved. They never contain your tasks,
          your email, your account, or your IP address.
        </Section>

        <Section styles={styles} heading="What we never do">
          No ads. No third-party trackers or analytics identities. No selling or sharing your data. We never ask for
          your name, phone number, location, or contacts.
        </Section>

        <Section styles={styles} heading="Your control">
          Work entirely offline and anonymous if you like. Sign out whenever you want, which stops syncing. You can
          export all your data as a file at any time. And if you sync, you can permanently delete your account and
          everything synced to it from Settings.
        </Section>

        <Section styles={styles} heading="Your privacy under Australian law">
          We handle any personal information in line with the Privacy Act 1988 and the Australian Consumer Law. You can
          ask to access the personal information we hold about you, or to correct or delete it, by emailing
          support@doubledone.app, and we respond within 30 days. If you are ever unhappy with how we have handled your
          information, you can contact the Office of the Australian Information Commissioner at oaic.gov.au.
        </Section>

        <Section styles={styles} heading="Who runs DoubleDone, and questions">
          DoubleDone is operated by Melroy D&apos;Souza, an independent developer in Melbourne, Australia. Questions,
          privacy requests, and refund requests can be sent to support@doubledone.app.
        </Section>

        <Text style={styles.footnote}>Privacy by architecture, not by promises.</Text>
      </ScrollView>
    </View>
  );
}

function Section({ styles, heading, children }: { styles: ReturnType<typeof makeStyles>; heading: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.seven, maxWidth: 640, width: '100%', alignSelf: 'center' },
    title: { ...t.type.title, color: t.colors.ink, marginTop: spacing.three },
    updated: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    lead: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, marginTop: spacing.five },
    section: { marginTop: spacing.five, gap: spacing.two },
    heading: { color: t.colors.ink, fontSize: 18 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    body: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 23 * t.scale, fontFamily: fonts.body },
    footnote: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.seven },
  });
