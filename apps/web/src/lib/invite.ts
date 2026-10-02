// Contact invites: a link (also shown as a QR) that opens NodeXchange with
// someone's address, e.g. https://nodexchange.pages.dev/#/add/G...

import { isAddress } from "@nodexchange/core";

const HASH_RE = /^#\/add\/(G[A-Z2-7]{55})$/;

export const inviteLink = (address: string) => `${location.origin}${location.pathname}#/add/${address}`;

/** Finds a Stellar address in scanned or pasted text (invite link, SEP-7 URI, plain G...). */
export function addressFromText(text: string): string | null {
  for (const match of text.toUpperCase().matchAll(/G[A-Z2-7]{55}/g)) {
    if (isAddress(match[0])) return match[0];
  }
  return null;
}

/**
 * Takes the address of an invite link opened in this tab, if any. The hash
 * stays in the URL through onboarding/unlocking and is removed here, so a
 * reload doesn't ask again.
 */
export function takeInvite(): string | null {
  const match = HASH_RE.exec(location.hash);
  if (!match || !isAddress(match[1])) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return match[1];
}
