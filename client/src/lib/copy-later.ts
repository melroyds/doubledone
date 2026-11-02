// Copy text that is not ready yet, from inside the tap that asked for it (the web's Copy my token, #24). The token is
// handed over only once the account has kept the device's time zone, which takes a network round trip, and Safari
// refuses a clipboard write that comes after one: the tap's permission has lapsed by then. A ClipboardItem built with
// a promise is the way through, because the write starts NOW, inside the tap, and the browser waits for the text.
// Where that is missing, the text is written plainly once it is ready, which Chrome and Firefox allow. The token
// stays on screen and selectable whatever happens here, which was always the real fallback.

type ClipboardLike = {
  write?: (items: unknown[]) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
};
type ClipboardItemCtor = new (items: Record<string, Promise<Blob>>) => unknown;

function browserClipboard(): ClipboardLike | undefined {
  return typeof navigator !== 'undefined' ? (navigator as { clipboard?: ClipboardLike }).clipboard : undefined;
}

function browserClipboardItem(): ClipboardItemCtor | undefined {
  return (globalThis as { ClipboardItem?: ClipboardItemCtor }).ClipboardItem;
}

/** Start copying `text` at once. Settles true when it reached the clipboard, false when there was nothing to copy,
 *  no clipboard, or the browser said no. Never throws, never rejects. */
export function copyWhenReady(
  text: Promise<string | null>,
  clip: ClipboardLike | undefined = browserClipboard(),
  Item: ClipboardItemCtor | undefined = browserClipboardItem(),
): Promise<boolean> {
  const plain = async (): Promise<boolean> => {
    try {
      const t = await text;
      if (!t || !clip?.writeText) return false;
      await clip.writeText(t);
      return true;
    } catch {
      return false;
    }
  };
  if (!clip) return plain();
  if (Item && clip.write) {
    try {
      const blob = text.then((t) => {
        if (!t) throw new Error('nothing to copy');
        return new Blob([t], { type: 'text/plain' });
      });
      blob.catch(() => undefined); // the write below reports it; never an unhandled rejection
      return clip.write([new Item({ 'text/plain': blob })]).then(() => true, plain);
    } catch {
      return plain();
    }
  }
  return plain();
}
