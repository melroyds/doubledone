import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { fonts, spacing, type Theme } from '@/constants/theme';
import { PLAY_COPY, SELLS_HERE } from '@/lib/storefront';
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
        <Text style={styles.updated}>Last updated 1 October 2026.</Text>

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

        {/* Three versions, one per storefront (lib/storefront). Android sells only through Google Play, so
            its terms carry no figure of ours: the price is Play's own, in the buyer's currency, shown before
            they buy. Its Stripe and Apple lines say only how to CANCEL, never how to buy (Play's Payments
            policy). The third is the Path C rollback, for a build that sells nothing. */}
        {SELLS_HERE && PLAY_COPY ? (
          <Section styles={styles} heading="Premium and billing">
            Premium is optional. In this app it is sold through Google Play. The price is shown in Google Play before
            you buy, in your own currency, and it is charged to your Google Play account every month or every year,
            depending on the plan you choose. It renews automatically until you cancel, and you can cancel any time in
            the Play Store: tap your profile picture, then Payments and subscriptions, then Subscriptions. You keep
            Premium until the end of the period you have already paid for. Each account can also have Premium free for
            30 days, once, with no card and no charge. That month is not a subscription and never becomes one. If you
            subscribed somewhere else, that store handles the billing. If Stripe bills you, email
            support@doubledone.app and we will cancel it for you, or cancel it by signing in on the DoubleDone website
            with the same email. If you subscribed on an iPhone or iPad, Apple handles it, and you cancel it in your
            Apple ID subscription settings. We will give reasonable notice of any price change.
          </Section>
        ) : SELLS_HERE ? (
          <Section styles={styles} heading="Premium and billing">
            Premium is optional. On our website it costs A$5 per month or A$50 per year, and it renews automatically
            until you cancel. Each account can have one free 30-day trial, with no card required. Where you bought it
            decides who handles the billing. If you subscribed on our website, or in an earlier version of the Android
            app, payment is handled by Stripe, and you can cancel any time in the Stripe billing portal, reachable from
            the app. If you subscribed on an iPhone or iPad, payment is handled by Apple through your Apple ID, and you
            cancel it in your Apple ID subscription settings, not in the app. In the Android app, Premium is sold
            through Google Play, at the price Google Play shows before you buy, and you cancel it in the Play Store
            under Payments and subscriptions. Whichever it is, you keep Premium until the end of the period you have
            already paid for, and we will give reasonable notice of any price change.
          </Section>
        ) : (
          <Section styles={styles} heading="Premium and billing">
            Premium is optional, and it is not sold in this app. If you already have it, it works here once you sign
            in. Each account can have Premium free for 30 days, once, with no card and no charge. It is not a
            subscription and never becomes one, so when the 30 days end you are simply back on the free app, with
            nothing to cancel. If you have a Premium subscription, where you subscribed decides who handles the
            billing. If Stripe bills you, it renews automatically until you cancel, and you can cancel any time by
            signing in on the DoubleDone website with the same email, or by emailing support@doubledone.app and we
            will cancel it for you. If you subscribed on an iPhone or iPad, Apple handles the payment through your
            Apple ID, and you cancel it in your Apple ID subscription settings. Either way you keep Premium until the
            end of the period you have already paid for, and we will give reasonable notice of any price change.
          </Section>
        )}

        {/* One paragraph as one string (Section takes text). Its opening differs by storefront: Android leads
            with Google Play, the only store it sells through, and never mentions earlier Android versions. */}
        <Section styles={styles} heading="Refunds">
          {`${SELLS_HERE && PLAY_COPY ? 'If you subscribed in this app through Google Play and Premium does not work as described, email support@doubledone.app within 7 days of the charge and we will refund it in full, through Google Play. You can also ask Google Play for a refund yourself, under its own refund policy. If Stripe bills you for Premium and it does not work as described' : SELLS_HERE ? 'If Stripe bills you (you subscribed on our website, or in an earlier version of the Android app) and Premium does not work as described' : 'If Stripe bills you for Premium and it does not work as described'}, email support@doubledone.app within 7 days of the charge and we will refund it in full, back through Stripe, usually within 5 to 10 business days. Outside that window we do not refund the current period once it has started, but you can cancel any time to stop future charges. If you subscribed on an iPhone or iPad, Apple handles the payment, so refunds are requested from Apple and are at the discretion of Apple, not ours, and we cannot issue them directly.${SELLS_HERE && !PLAY_COPY ? ' If you subscribed in the Android app through Google Play, email us within 7 days of the charge and we will refund it through Google Play, or ask Google Play yourself.' : ''} In every case, none of this limits your rights under the Australian Consumer Law, which always apply.`}
        </Section>

        <Section styles={styles} heading="Your tasks are yours">
          You own what you create in DoubleDone. We claim no ownership of your tasks or content. How we handle data is
          set out in our Privacy policy.
        </Section>

        <Section styles={styles} heading="Shared lists, and what is not allowed on them">
          A shared list is between two people who each choose to be there. You are responsible for what you put on
          one. Do not use a shared list to harass, threaten, abuse or frighten the other person, to send content that
          is unlawful, or to send sexual content involving anyone under 18.
        </Section>

        <Section styles={styles} heading="Reporting, and what we will do">
          Every shared list carries a Report this list link, and reporting never tells the other person. We aim to
          look at reports within 24 hours. Where a report is founded we may close the list, remove its contents, or
          suspend the accounts involved, without notice and without refund. You can also leave a shared list at any
          moment, which closes it for both of you immediately and needs no reason and no permission.
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
