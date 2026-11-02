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
        <Text style={styles.updated}>Last updated 3 November 2026.</Text>

        <Text style={styles.lead}>
          DoubleDone is built to need almost nothing from you. It runs on your device, and the main things that ever
          leave it are your tasks if you choose to sync, the text or photo you choose to send to an AI feature, and a
          bare feature-usage count when you use certain features. The rest, such as what a purchase needs, has its
          own section below. This is the plain version of what each of those means.
        </Text>

        <Section styles={styles} heading="On your device by default">
          Your tasks live on your device. You can use the whole app, capture, the Calendar, all of it, with no account,
          and what you write never leaves the device unless you choose an AI feature or sync.
        </Section>

        <Section styles={styles} heading="If you choose to sync">
          Syncing across devices is optional. If you turn it on, the only personal information held is your email
          address, used to send a one-time sign-in code. If you connect an AI assistant, your device&apos;s time zone is
          kept too (see Connecting an AI assistant). There is no password. Your tasks are stored in rows only you
          can read (row-level security scopes every row to your account). Your scrapbook keepsakes sync the same way;
          the keepsake picture itself is stored at an unguessable address so each of your devices can show it. You can
          sign out, or stop syncing, any time.
        </Section>

        <Section styles={styles} heading="Shared lists">
          A shared list is between exactly two people, and nothing crosses into it or out of it unless one of you
          chooses it. What you put on a shared list, the other person can read, change, tick and remove; what is on
          your own Today stays yours and they never see it. Bringing a shared task to your own day makes a copy, and
          the copy is yours.
        </Section>

        <Section styles={styles} heading="Shared lists: who did what">
          Nothing on a shared list says which of you did what, and DoubleDone keeps no record of who ticked or removed something. Our server does note which account added each item, only so a report of misuse can be acted on, and the app never shows it. If you delete your account, that note is erased and what you added stays on the list for the other person.
        </Section>

        <Section styles={styles} heading="Leaving, removing, deleting">
          Leaving a shared list closes it rather than deleting it: you can both still read everything, and neither of
          you can take the other&apos;s words away. Something removed from a shared list keeps its wording for up to
          thirty days so the other person can put it back, and is then blanked. Deleting a shared list for good removes
          it and everything on it for both of you, and cannot be undone.
        </Section>

        <View style={styles.section}>
          <Text style={styles.heading}>The AI features</Text>
          <Text style={styles.body}>
            The AI features are on when you start. One tap on Turn AI off in Settings switches them all off, and the rest of the app keeps working.
          </Text>
          <Text style={styles.body}>
            The AI features (such as Break it down, Sort, Combine, and the photo scan) send the text or photo you
            choose to our server, which passes it to Anthropic&apos;s Claude to do the work. Anthropic does not train their
            models on it, and deletes it within 30 days. Anything flagged for safety or legal reasons can be held by
            Anthropic for up to two years. Separately, we keep a copy on our side, without your name, account, or IP address, to
            improve how the app breaks tasks down for everyone. It is pseudonymous, never tied to you and
            never sold.
            After 90 days we delete the text and the reply from that copy and keep only the rest of the row, such as which
            feature ran, how long it took, whether it worked, and the random id that links a break-down to its
            finished steps. Our hosting provider&apos;s short-lived backups (up to 30 days) can hold it for that
            long.
          </Text>
          <Text style={styles.body}>
            And when you finish steps from a broken-down task, the app notes only that they got done, a random id and
            a number of days, never the task text or anything about you, so it can learn how long things really take.
            Prefer not to? Just don&apos;t use those features. The rest of the app works fully without them.
          </Text>
          <Text style={styles.body}>
            A scrapbook&apos;s picture is drawn by Cloudflare&apos;s image model, from a short scene Claude writes using the titles of what you finished. If Claude is unavailable, Cloudflare&apos;s text model writes the scene instead.
          </Text>
        </View>

        <Section styles={styles} heading="A note to us">
          When you write to us from the app, your note is emailed to us with the kind of device it came from (web,
          iPhone or Android), and nothing else about you. If a month of Premium is given for your note, we keep a record
          of it (an internal number and two dates, nothing you wrote), so a month is given at most once in 180 days.
          With AI on, and only while a month is on offer, Claude reads the note once to check it is a real note.
          Anthropic does not train on it and deletes it within 30 days, and we keep only the note&apos;s length and that a
          check ran, never its words. With AI off, a note never goes to an AI. After a note you can book a call on a
          Google Calendar booking page, which is Google&apos;s and works under Google&apos;s privacy policy.
        </Section>

        <Section styles={styles} heading="Speaking instead of typing">
          On the web, the Speak button turns what you say into text using your browser&apos;s own speech recognition.
          DoubleDone never receives the audio. The words simply land in the box, and stay on your device unless you
          then choose Sort for me. Your browser decides where the recognition happens: Chrome sends the audio to
          Google&apos;s speech service, and other browsers use their own maker&apos;s service or the device itself. In the phone
          apps there is no Speak button; dictating with your keyboard&apos;s own microphone gives DoubleDone only the text.
        </Section>

        <Section styles={styles} heading="The daily reminder on the website">
          In the phone apps, reminders are scheduled on your phone and nothing about them leaves it. On the website,
          the daily reminder travels through your browser&apos;s own push service, run by the company that makes your
          browser (Google, for Chrome). If you turn it on, our server keeps the push address your browser gives it,
          the two keys that let us reach that address, the hour you picked, and your time zone&apos;s offset from UTC, which
          the app sends again only when it changes (after daylight saving, say), the next time you open it. Nothing else: no account, no email, and no
          task. The reminder itself carries no words (the message already sits in your browser), so the push service
          only learns that a reminder was sent. Turn it off and your browser drops the address and asks us to delete
          our copy. If you block notifications or clear the site&apos;s data instead, the push service tells us the
          address is gone the next time the reminder is due, and we delete it then. Our hosting provider&apos;s
          short-lived backups (up to 30 days) can hold a deleted address for that long.
        </Section>

        <Section styles={styles} heading="Feature-usage counts">
          When you use certain features, the app tells our server the feature’s name so we can count how often it
          helps. Right now those features are the Settle breathing room (and whether you switched its breathing guide on
          or off), the Hold-me-to-it reminder contract (started, finished, or let go, and how far along it was, which we
          keep only as one of three rough stages), holding a task to open its card, which task tools get used (on the
          card, in the capture box, or when several tasks are selected, by the button’s name only, never the task),
          that a task was moved by dragging its grip, which of the Menu’s two ways into Settings you used, whether you saved or cleared a “where you left off”
          line (on the card or in Focus, never the words), that a day was closed in the morning
          (only that it was, never what was on it), that the welcome-back note appeared after a few days away, and,
          in the phone apps, that the app
          asked your app store to show its own rating card, and which store (the store decides whether the card
          appears, and the app is never told whether you rated). A review you choose to write is posted on the store,
          where we can read it and reply like any public review, but nothing links it to that count. We counted “I
          also did that” only until we decided it earns its place on Today, and it does, so we have stopped. That
          is the whole message: no
          account, no name, nothing you typed, and never how long you stayed. (Older versions of the app also attach a
          small detail to a few of these, such as which reminder time you picked; the server throws it away unstored.)
          Like any internet request it arrives from your network address, but the address is never stored with the
          count; what we keep is how many times each feature was used on each day, nothing finer. Our hosting provider
          keeps short-lived backups of that table (up to 30 days) and a log of each request, which can include when it
          arrived and the network address it came from (up to a week), for recovery and fault-finding. We do not use
          either to study how anyone uses the app. The server accepts a short fixed
          list of names and drops everything else.
          It also counts a few of its own steps the same way, as plain daily numbers: whether the check on a note
          to us stopped or failed, each month given for a note, and the purchase checks described under Premium
          without an account.
        </Section>

        <Section styles={styles} heading="Visits to the website">
          Cloudflare, which hosts doubledone.app, counts visits to the website and the web app for us: the page
          opened, the site that linked you here, your country, your kind of browser and device, and how quickly the
          page loaded. It uses no cookies, doesn&apos;t follow you to other sites, and we only ever see totals. The
          phone apps don&apos;t include it.
        </Section>

        <Section styles={styles} heading="Payment events">
          Payments for Premium are processed by Stripe (on our website), by Apple (on iPhone and iPad) or by Google
          Play (in the Android app), never by us. We never see or store your card details. In the iPhone, iPad and
          Android apps we use RevenueCat, a subscription service based in the United States, to confirm with Apple or
          Google Play that a purchase is genuine. RevenueCat starts when the app opens, so it receives an identifier
          for your device even if you never buy anything. When you sign in it also receives your DoubleDone account
          id, and when you buy, the store&apos;s record of the purchase, so your subscription can follow your account
          across your devices. When something happens on your subscription, a payment succeeding or failing, a
          refund, a cancellation, or a renewal, we keep a record against your account: whether Premium is on, its
          status, when the current period ends, whether it is set to stop, when you first subscribed, and which store
          it came from, along with the store&apos;s own notice of what happened.
          If you bought on an iPhone or iPad without signing in, there is no account to keep it against, so we
          keep only the store&apos;s notices, which carry the anonymous purchase id RevenueCat gave your device,
          for as long as we keep billing records (see Premium without an account).
          That is what keeps your Premium status
          correct. We never sell or share it. If you delete your account, these billing records, and RevenueCat&apos;s
          record of the purchase, are kept for as long as tax law and refunds need them. They hold nothing you wrote.
        </Section>

        <Section styles={styles} heading="Premium without an account">
          On an iPhone or iPad you can buy Premium without signing in. Four Premium features, Scan, Chart a
          course, Plan my day and Reflect on this week, ask our server to check your Premium before they run. When
          you use one of them without an account, the app sends our server the anonymous purchase id that
          RevenueCat gave this device. It is a random code, not your name, email or Apple ID. Our server looks the
          id up in the store&apos;s notices of purchases made without an account, which we keep (see Payment
          events) and which carry that id as the store sends it, and asks RevenueCat whether the purchase is
          active. The check itself keeps only the latest answer, filed under a scrambled form of the id that
          can&apos;t be turned back into it and is never tied to an account, and deletes it within two hours of
          the last check. To stop one purchase being overused, it also counts how often that purchase was used in
          the current hour, under the same scrambled form, and deletes that count within two hours (a test
          purchase made through Apple&apos;s TestFlight or App Review is also counted for its day, and that count
          is deleted the next day). RevenueCat gives the app such an id on every iPhone, iPad and Android phone.
          Whenever the store&apos;s notices show that one of these ids belongs to an account, we keep its
          scrambled form, with no account attached, for as long as we keep billing records, so that it works only
          through that account. We can also block one purchase&apos;s scrambled id by hand if it is being misused,
          until we lift the block. We also count how many of these checks ran each day and how they came out, as
          plain numbers. Our hosting provider&apos;s short-lived backups (up to 30 days) can hold any of these for
          that long, and its request log (up to a week) can include the network address the request came from.
          Once you sign in, the app stops sending the id and we check your account instead. The Android app and
          the website never send an id for this check.
        </Section>

        <Section styles={styles} heading="Connecting an AI assistant">
          DoubleDone can connect to an AI assistant you already use, such as Claude or ChatGPT, so it can read and add
          your tasks for you. This is off until you turn it on. Once you connect one, that assistant can read the tasks
          it asks for, and those tasks travel to whichever company runs it. To hold the connection open we store your
          email address and sign-in keys for your account: the long-lived key is encrypted, and a short-lived one
          (about an hour) is kept as-is so you are not asked to reconnect constantly. If you connect an AI assistant,
          we also keep the name of your device&apos;s time zone, such as Australia/Melbourne, so the assistant works on
          the same day as your Today. It is read from your device&apos;s clock settings, not from your location, and it
          goes when you disconnect your assistants in Settings or delete your account. You can cut the connection at any time in Settings: it stops working straight away, and the email and
          keys we held for it are deleted. Deleting your account does the same.
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
          export your tasks and what you&apos;ve finished as a file at any time. And if you sync, you can permanently delete your account and
          everything synced to it from Settings. Three small records are kept: a billing record, if you ever subscribed (see Payment events); if you
          ever started the free trial, a note that you did (an internal number and two dates, nothing you
          wrote), so a trial is used once; and, if a month of Premium was ever given for a note, its record (see A note to us), so a month is given at most once in 180 days. What you added to a shared list stays on that list for the other person (see Shared lists).
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
    updated: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    lead: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, marginTop: spacing.five },
    section: { marginTop: spacing.five, gap: spacing.two },
    heading: { color: t.colors.ink, fontSize: 18 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    body: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 23 * t.scale, fontFamily: fonts.body },
    footnote: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.seven },
  });
