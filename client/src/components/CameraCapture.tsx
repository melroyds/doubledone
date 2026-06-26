// OCR photo capture (PREMIUM): a full-screen modal that turns a photo of a list into tasks. Native
// shows an in-app viewfinder with a gallery fallback; web falls back to the gallery picker (no
// viewfinder). The captured image is downscaled, sent to the backend's /ocr (Claude vision) via the
// ocr() seam, and the titles it reads are handed back to the brain-dump box to review and edit.
// Nothing is auto-added to Today, and the photo is never stored: it is sent to the AI to read, then
// discarded. The caller premium-gates the entry point, so this only opens for an entitled, signed-in
// user. Camera capture cannot be exercised in the web preview (no device camera); it is device-tested.

import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { ocr } from '@/lib/ai';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Called with the task titles the AI read, for the parent to seed into the brain-dump box. Never
  // called with an empty list (an empty read shows a calm in-modal line and keeps the camera open).
  onTasks: (tasks: string[]) => void;
  language?: string;
};

const EGRESS_NOTE = 'Your photo is sent to the AI to read your list, then discarded. It is never stored.';

export function CameraCapture({ visible, onClose, onTasks, language }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const isWeb = Platform.OS === 'web';
  const cameraRef = useRef<CameraView>(null);
  // Permission is only needed for the native viewfinder; web uses the gallery picker, which prompts itself.
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Downscale to <=1080px wide and re-encode to JPEG q0.6 (base64), so the upload and the vision-token
  // cost stay small. The manipulator reads the file URI, so takePictureAsync need not return base64.
  async function readFromUri(uri: string) {
    setBusy(true);
    setError(null);
    try {
      const ref = await ImageManipulator.manipulate(uri).resize({ width: 1080 }).renderAsync();
      const out = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
      if (!out.base64) {
        setError('Could not prepare that image. Try again.');
        return;
      }
      const tasks = await ocr(out.base64, 'image/jpeg', language);
      if (tasks.length === 0) {
        setError("I couldn't read any tasks from that. Try again, with the list filling the frame.");
        return;
      }
      track('ocr.captured', { count: tasks.length });
      onTasks(tasks);
    } catch {
      setError("Couldn't read that photo just now. Try again?");
    } finally {
      setBusy(false);
    }
  }

  async function shoot() {
    const cam = cameraRef.current;
    if (!cam || busy) return;
    setError(null);
    try {
      const photo = await cam.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) await readFromUri(photo.uri);
    } catch {
      setError('Could not take that photo. Try again.');
    }
  }

  async function pickFromGallery() {
    if (busy) return;
    setError(null);
    try {
      const res = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!res.canceled && res.assets[0]?.uri) await readFromUri(res.assets[0].uri);
    } catch {
      setError('Could not open your photos. Try again.');
    }
  }

  function body() {
    // Web: no in-app viewfinder, just the gallery / file picker.
    if (isWeb) {
      return (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>Photograph your list</Text>
          <Text style={styles.promptHint}>Choose a photo of a list, a note, or a whiteboard.</Text>
          <PrimaryButton
            label="Choose a photo"
            onPress={pickFromGallery}
            disabled={busy}
            accessibilityLabel="Choose a photo of your list"
          />
        </View>
      );
    }
    // Native, permission still resolving.
    if (!permission) {
      return (
        <View style={styles.prompt}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      );
    }
    // Native, camera not yet allowed: ask, with a gallery alternative so a denial is never a dead end.
    if (!permission.granted) {
      return (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>Read a list from a photo</Text>
          <Text style={styles.promptHint}>{EGRESS_NOTE}</Text>
          <PrimaryButton
            label="Allow camera"
            onPress={requestPermission}
            accessibilityLabel="Allow the camera"
          />
          <Pressable onPress={pickFromGallery} accessibilityRole="button" accessibilityLabel="Choose from your photos instead">
            <Text style={styles.linkBtnText}>Choose from photos instead</Text>
          </Pressable>
        </View>
      );
    }
    // Native, camera ready: the viewfinder with a shutter and a gallery shortcut.
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.controls}>
          <Pressable
            onPress={pickFromGallery}
            disabled={busy}
            style={({ pressed }) => [styles.galleryBtn, pressed && styles.pressed, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Choose from your photos instead"
          >
            <Text style={styles.galleryBtnText}>Photos</Text>
          </Pressable>
          <Pressable
            onPress={shoot}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, pressed && styles.pressed, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Take a photo of your list"
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.controlsSpacer} />
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Text style={[styles.headerLink, busy && styles.disabled]}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Snap your list</Text>
          <View style={styles.headerSpacer} />
        </View>

        {body()}

        {(isWeb || permission?.granted) && <Text style={styles.footerNote}>{EGRESS_NOTE}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        {busy && (
          <View style={styles.busyOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.busyText}>Reading your list…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.four,
      paddingTop: spacing.five,
      paddingBottom: spacing.three,
    },
    headerLink: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    headerTitle: { color: t.colors.ink, fontSize: 18 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    headerSpacer: { width: 52 },
    prompt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.four, paddingHorizontal: spacing.five },
    promptTitle: { ...t.type.subheading, color: t.colors.ink, textAlign: 'center' },
    promptHint: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center', lineHeight: 22 * t.scale },
    linkBtnText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    cameraWrap: { flex: 1 },
    camera: { flex: 1 },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.five,
      paddingVertical: spacing.four,
      backgroundColor: t.colors.bg,
    },
    galleryBtn: {
      width: 64,
      paddingVertical: spacing.two,
      borderRadius: radius.pill,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      alignItems: 'center',
    },
    galleryBtnText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, fontWeight: '500' },
    shutter: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 3,
      borderColor: t.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.colors.accent },
    controlsSpacer: { width: 64 },
    footerNote: {
      color: t.colors.inkFaint,
      fontSize: 12 * t.scale,
      fontFamily: fonts.body,
      textAlign: 'center',
      paddingHorizontal: spacing.five,
      paddingBottom: spacing.three,
    },
    error: {
      color: t.colors.accent,
      fontSize: 14 * t.scale,
      fontFamily: fonts.body,
      textAlign: 'center',
      paddingHorizontal: spacing.five,
      paddingBottom: spacing.four,
    },
    pressed: { opacity: PRESSED_OPACITY },
    disabled: { opacity: 0.5 },
    busyOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(43,39,34,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.three,
    },
    busyText: { color: '#FFFFFF', fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  });
