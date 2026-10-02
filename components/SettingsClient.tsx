"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FAMILY_RELATION_OPTIONS, familyRelationLabel } from "@/lib/constants";
import { linkFamilyByEmail } from "@/app/actions/familyInvite";
import { VoiceSettings } from "@/components/VoiceSettings";
import { RecipientWillEditor } from "@/components/RecipientWillEditor";
import type {
  FamilyMember,
  FamilyRelation,
  HandoverRecipient,
  HandoverSettings,
  Will,
} from "@/lib/types";

export function SettingsClient({
  userId,
  displayName,
  purpose,
  initialFamily,
  initialWill,
  initialHandover,
  initialRecipients,
}: {
  userId: string;
  displayName: string;
  purpose: string | null;
  initialFamily: FamilyMember[];
  initialWill: Will | null;
  initialHandover: HandoverSettings | null;
  initialRecipients: HandoverRecipient[];
}) {
  const [family, setFamily] = useState(initialFamily);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<FamilyRelation>("son");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [linkEmail, setLinkEmail] = useState("");
  const [linkRelation, setLinkRelation] = useState<FamilyRelation>("father");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  async function handleLinkByEmail() {
    const trimmed = linkEmail.trim();
    if (!trimmed) {
      setLinkError("メールアドレスを入力してください。");
      return;
    }
    setLinking(true);
    setLinkError(null);
    setLinkSuccess(null);
    const result = await linkFamilyByEmail(trimmed, linkRelation);
    setLinking(false);
    if (!result.ok) {
      setLinkError(result.error);
      return;
    }
    setLinkSuccess(`${result.targetName}さんとつながりました。`);
    setLinkEmail("");
    window.location.reload();
  }

  const [inactiveDays, setInactiveDays] = useState(
    String(initialHandover?.inactive_days ?? 36500)
  );
  const [approverId, setApproverId] = useState(
    initialHandover?.approver_family_member_id ?? ""
  );
  const [handover, setHandover] = useState(initialHandover);
  const [savingHandover, setSavingHandover] = useState(false);
  const [handoverSaved, setHandoverSaved] = useState(false);

  const [willMessage, setWillMessage] = useState(initialWill?.message ?? "");
  const [willVideoUrl, setWillVideoUrl] = useState(
    initialWill?.video_url ?? ""
  );
  const [savingWill, setSavingWill] = useState(false);
  const [willSaved, setWillSaved] = useState(false);
  const [willError, setWillError] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(
    null
  );

  const VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24 * 365 * 10; // 10年
  const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

  async function handleVideoFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setVideoUploadError(
        "動画ファイルが大きすぎます(200MBまで)。別のファイルをお選びください。"
      );
      return;
    }

    setVideoUploadError(null);
    setVideoUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `${userId}/will-video-${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("item-media")
        .upload(path, file);

      if (uploadError) {
        setVideoUploadError(
          "動画のアップロードに失敗しました。もう一度お試しください。"
        );
        return;
      }

      const { data: signedData, error: signError } = await supabase.storage
        .from("item-media")
        .createSignedUrl(path, VIDEO_SIGNED_URL_EXPIRES_IN);

      if (signError || !signedData) {
        setVideoUploadError(
          "動画のアップロードに失敗しました。もう一度お試しください。"
        );
        return;
      }

      setWillVideoUrl(signedData.signedUrl);
    } catch {
      setVideoUploadError(
        "動画のアップロードに失敗しました。もう一度お試しください。"
      );
    } finally {
      setVideoUploading(false);
    }
  }

  const [legalWillNote, setLegalWillNote] = useState(
    initialWill?.legal_will_note ?? ""
  );
  const [legalDisclaimerAcknowledged, setLegalDisclaimerAcknowledged] =
    useState(!!initialWill?.legal_disclaimer_acknowledged_at);

  async function handleInvite() {
    const trimmed = name.trim();
    if (!trimmed) {
      setInviteError("お名前を入力してください。");
      return;
    }
    setInviting(true);
    setInviteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("family_members")
      .insert({
