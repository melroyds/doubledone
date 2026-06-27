import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { fonts, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

// The plain-English terms of service, also the public terms URL (doubledone.app/terms)
// for a store listing. Kept calm and readable, the way the rest of the app talks.
//
// SYNC NOTE: the public, crawlable copy is client/public/terms.html (served at /terms for
// store listings and crawlers, since this screen renders client-side). Keep both in step.
//
// NOTE: a plain-English draft written to be reasonable and Australian-Consumer-Law aware,
// not legal advice. Have it reviewed before relying on it for the business.
export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six }]}>
        <BackLink fallback="/settings" />

        <Text style={styles.title}>Terms</Text>
        <Text style={styles.updated}>Last updated 27 June 2026.</Text>

        <Text style={styles.lead}>
          These are the plain terms for using DoubleDone. No wall of legalese, just what you can expect from us and what
          we expect from you.
        </Text>

        <Section styles={styles} heading="Who we are">
          DoubleDone is a calm daily to-do app operated by Melroy D&apos;Souza, an independent developer based in
          Melbourne, Victoria, Australia. You can reach us any time at support@doubledone.app.
        </Section>

        <Section styles={styles} heading="Using DoubleDone">
          You can use the free app on your own device, with or without an account, for your own personal task
          management. Please do not misuse the service, for example by scripting or overloading it, or trying to break
          or abuse the AI features. We may suspend access we reasonably believe is abusive or harmful, to keep the
          service fair for everyone. The app is provided as it is and as available. We work to keep it running, but we
          cannot promise it will never be down.
        </Section>

        <Section styles={styles} heading="Premium and billing">
          Premium is optional. It costs A$5 per month or A$50 per year, charged through Stripe, and it renews
          automatically until you cancel. New accounts get a 30-day trial with no card required. You can cancel any time
          in the Stripe billing portal, reachable from the app, and you keep Premium until the end of the period you have
          already paid for. We will give reasonable notice of any price change.
        </Section>

        <Section styles={styles} heading="Refunds">
          If Premium does not work as described, email support@doubledone.app within 7 days of the charge and we will
          refund it in full, back through Stripe, usually within 5 to 10 business days. Outside that window we do not
          refund the current period once it has started, but you can cancel any time to stop future charges. None of
          this limits your rights under the Australian Consumer Law, which always apply.
        </Section>

        <Section styles={styles} heading="Your tasks are yours">
          You own what you create in DoubleDone. We claim no ownership of your tasks or content. How we handle data is
          set out in our Privacy policy.
        </Section>

        <Section styles={styles} heading="Our liability">
          DoubleDone is provided as it is and as available, without warranties beyond those that cannot be excluded by
          law. To the extent the law allows, we are not liable for indirect or consequential loss, and our total
          liability to you is limited to the amount you have paid us in the 12 months before a claim. Nothing here
          excludes the consumer guarantees under the Australian Consumer Law.
        </Section>

        <Section styles={styles} heading="Changes to these terms">
          We may update these terms as the app evolves. If we make a material change, we will update the date above and,
          where it matters, let you know in the app. Continuing to use DoubleDone after a change means you accept the
          updated terms.
        </Section>

        <Section styles={styles} heading="Governing law">
          These terms are governed by the laws of Victoria, Australia, and we each submit to the courts of that state.
          Nothing in them limits any rights you have under the Australian Consumer Law.
        </Section>

        <Section styles={styles} heading="Contact">
          Questions about these terms? Email support@doubledone.app.
        </Section>

        <Text style={styles.footnote}>Plain terms for a calm app.</Text>
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
