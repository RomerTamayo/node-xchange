// Sharing and saving contacts: my QR / invite link, a camera scanner, and the
// dialog that saves someone under a name of our choosing.

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Check, Copy, Share2 } from "lucide-react";
import { t, useLang } from "../lib/i18n.ts";
import { addressFromText, inviteLink } from "../lib/invite.ts";
import { MAX_CONTACT_NAME_CHARS } from "../lib/useChats.ts";
import { Button, ErrorText, Field, Input, Modal, PeerName, Qr, errorMessage } from "./ui.tsx";

/** My invite as a QR, plus copy and the system share sheet. */
export function MyQrDialog({ me, alias, onClose }: { me: string; alias: string | null; onClose: () => void }) {
  useLang();
  const link = inviteLink(me);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";
  return (
    <Modal title={t("myQr")} onClose={onClose}>
      <p className="text-sm text-ink-300">{t("myQrBody")}</p>
      <div className="flex justify-center">
        <Qr text={link} size={220} />
      </div>
      <div className="text-center">
        <PeerName address={me} alias={alias} />
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t("copied") : t("copyLink")}
        </Button>
        {canShare && (
          <Button
            className="flex-1"
            onClick={() => navigator.share({ title: "NodeXchange", text: t("shareText"), url: link }).catch(() => {})}
          >
            <Share2 size={16} />
            {t("share")}
          </Button>
        )}
      </div>
    </Modal>
  );
}

/** Reads a QR with the camera; works without BarcodeDetector (Firefox, iOS). */
export function ScanDialog({ onAddress, onClose }: { onAddress: (address: string) => void; onClose: () => void }) {
  useLang();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [badCode, setBadCode] = useState(false);
  // Kept in a ref so a re-render of the parent doesn't restart the camera.
  const found = useRef(onAddress);
  found.current = onAddress;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const v = video.current;
      if (v && ctx && v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth) {
        // Scan a downscaled frame: plenty for a QR and much faster on phones.
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (code?.data) {
          const address = addressFromText(code.data);
          if (address) {
            stopped = true;
            found.current(address);
            return;
          }
          setBadCode(true);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("cameraUnsupported"));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        frame = requestAnimationFrame(tick);
      })
      .catch((e) => setError(/denied|NotAllowed/i.test(String(e)) ? t("cameraDenied") : errorMessage(e)));

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <Modal title={t("scanQr")} onClose={onClose}>
      {!error && (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-square w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-emerald-300/80" />
        </div>
      )}
      <p className="text-sm text-ink-300">{badCode ? t("scanNotNodeX") : t("scanHint")}</p>
      <ErrorText error={error} />
    </Modal>
  );
}

/** Saves (or renames) a contact under our own name for them. */
export function ContactDialog({
  address,
  alias,
  current,
  onSave,
  onOpenChat,
  onClose,
}: {
  address: string;
  alias: string | null;
  /** Present when editing an existing contact. */
  current: { name: string | null } | null;
  onSave: (name: string | null) => void;
  /** When set, saving also opens the conversation. */
  onOpenChat?: () => void;
  onClose: () => void;
}) {
  useLang();
  const [name, setName] = useState(current?.name ?? alias ?? "");
  return (
    <Modal title={current ? t("editContact") : t("saveContact")} onClose={onClose}>
      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
        <PeerName address={address} alias={alias} />
        <p className="mt-1 break-all font-mono text-[11px] text-ink-500">{address}</p>
      </div>
      <Field label={t("contactName")} hint={t("contactNameHint")}>
        <Input
          autoFocus
          value={name}
          maxLength={MAX_CONTACT_NAME_CHARS}
          onChange={(e) => setName(e.target.value)}
          placeholder={alias ?? t("contactNamePlaceholder")}
        />
      </Field>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            onSave(name.trim() || null);
            onOpenChat?.();
            onClose();
          }}
        >
          {onOpenChat ? t("saveAndChat") : t("save")}
        </Button>
      </div>
    </Modal>
  );
}
