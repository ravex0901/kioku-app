"use client";

import { adminApproveMarriageCapsule } from "@/app/actions/adminAccounts";
import { AdminApproveButton } from "@/components/AdminApproveButton";

export function AdminMarriageApprove({ capsuleId }: { capsuleId: string }) {
  return (
    <AdminApproveButton
      label="結婚を承認する"
      confirmMessage="提出書類を確認のうえ、結婚の条件を満たしたものとして承認します。よろしいですか?"
      action={() => adminApproveMarriageCapsule(capsuleId, "")}
    />
  );
}
