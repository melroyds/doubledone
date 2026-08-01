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
        <Text style={styles.updated}>Last updated 1 August 2026.</Text>

        <Text style={styles.lead}>
          DoubleDone is built to need almost nothing from you. It runs on your device, and only three things ever leave
          it: your tasks if you choose to sync, the text or photo you choose to send to an AI feature, and a bare
          feature-usage count when you open certain features. This is the plain version of what each of those means.
        </Text>

        <Section styles={styles} heading="On your device by default">
          Your tasks live on your device. You can use the whole app, capture, the Calendar, all of it, with no account,
          and what you write never leaves the device unless you choose an AI feature or sync.
        </Section>

        <Section styles={styles} heading="If you choose to sync">
          Syncing across devices is optional. If you turn it on, the only personal information held is your email
          address, used to send a one-time sign-in code. There is no password. Your tasks are stored in rows only you
          can read (row-level security scopes every row to your account). Your scrapbook keepsakes sync the same way;
          the keepsake picture itself is stored at an unguessable address so each of your devices can show it. You can
          sign out, or stop syncing, any time.
        </Section>

        <View style={styles.section}>
          <Text style={styles.heading}>The AI features</Text>
          <Text style={styles.body}>
            The AI features (such as Break it down, Sort, Combine, and the photo scan) send the text or photo you
            choose to our server, which passes it to Anthropic&apos;s Claude to do the work. Anthropic does not train their
            models on it, and deletes it within 30 days. Anything flagged for safety or legal reasons can be held by
            Anthropic for up to two years. Separately, we keep a copy on our side, without your name, account, or IP address, to
            improve how the app breaks tasks down for everyone. It is pseudonymous and aggregate, never tied to you and
            never sold.
          </Text>
          <Text style={styles.body}>
            And when you finish steps from a broken-down task, the app notes only that they got done, a random id and
            a number of days, never the task text or anything about you, so it can learn how long things really take.
            Prefer not to? Just don&apos;t use those features. The rest of the app works fully without them.
          </Text>
        </View>

        <Section styles={styles} heading="Feature-usage counts">
          When you open certain features, currently the Settle breathing room, the app tells our server the
          feature&apos;s name (and, for the breathing guide, whether you switched it on or off) so we can count how often
          it helps. That is the whole message: no account, no name, nothing you typed, and never how long you stayed.
          Like any internet request it arrives from your network address, but the address is never stored with the
          count; what we keep is the feature&apos;s name and the day, nothing finer. The server accepts a short fixed
          list of names and drops everything else.
        </Section>

        <Section styles={styles} heading="Payment events">
          Payments for Premium are processed by Stripe (on our website and on Android) or by Apple (on iPhone and iPad),
          never by us. We never see or store your card details. On iPhone and iPad we use RevenueCat, a subscription
          service based in the United States, to confirm with Apple that a purchase is genuine. It receives the purchase
          receipt, your DoubleDone account id, and an identifier for your device, so your subscription can follow your
          account across your devices. When something happens on your subscription, a payment succeeding or failing, a
          refund, a cancellation, or a renewal, we keep a record against your account: whether Premium is on, its
          status, when the current period ends, whether it is set to stop, when you first subscribed, and which store it
          came from. That is what keeps your Premium status correct. We never sell or share it.
        </Section>

        <Section styles={styles} heading="Connecting an AI assistant">
          DoubleDone can connect to an AI assistant you already use, such as Claude or ChatGPT, so it can read and add
          your tasks for you. This is off until you turn it on. Once you connect one, that assistant can read the tasks
          it asks for, and those tasks travel to whichever company runs it. To hold the connection open we store your
          email address and sign-in keys for your account: the long-lived key is encrypted, and a short-lived one
          (about an hour) is kept as-is so you are not asked to reconnect constantly. You can cut the connection at any
          time in Settings, and it stops working straight away.
        </Section>

        <Section styles={styles} heading="Keeping the service running">
          To keep DoubleDone up and within budget, our systems alert the owner when something needs attention, for
          example AI spending nearing its cap, an unusual spike in errors, or signs of abuse. These alerts hold only
          numbers, error messages, and the names of the parts of the system involved. They never contain your tasks,
          your email, your account, or your IP address. Separately, to stop abuse of the AI keepsake image, our systems
          briefly note the network address a request comes from, for no more than 24 hours, and never tied to your
          account.
        </Section>

        <Section styles={styles} heading="What we never do">
          No ads. No advertising identifiers and no cross-app tracking. No selling or sharing your data. We never ask for
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
