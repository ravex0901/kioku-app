"use client";

import { adminApproveHandover, adminRevokeHandover } from "@/app/actions/adminAccounts";
import { AdminApproveButton } from "@/components/AdminApproveButton";

export function AdminHandoverActions({
  ownerId,
  approved,
}: {
  ownerId: string;
  approved: boolean;
}) {
  if (approved) {
    return (
      <AdminApproveButton
        label="開示を取り消す"
        tone="revoke"
        doneLabel="取り消しました"
        confirmMessage="開示を取り消し、提出待ちの状態に戻します。よろしいですか?"
        action={() => adminRevokeHandover(ownerId)}
      />
    );
  }
  return (
    <AdminApproveButton
      label="開示を承認する"
      confirmMessage="この方の「もしもの時」の内容を、ご家族に開示します。提出書類を確認のうえ承認してください。よろしいですか?"
      action={() => adminApproveHandover(ownerId)}
    />
  );
}
