export type LocationType = "building" | "floor" | "room" | "storage";
export type MediaType = "image" | "video";
export type CategoryMajor =
  | "furniture"
  | "appliance"
  | "clothing"
  | "tableware"
  | "books"
  | "jewelry"
  | "watch"
  | "asset"
  | "subscription"
  | "insurance"
  | "other";
// 処分の方針(整理の方針)。残す/整理する/わからない の3択。
// 旧5択(keep/keepsake/sell/discard/undecided)で登録済みの既存データは
// DB上の値はそのまま残り、表示側(lib/constants.tsのdispositionLabel等)で
// 新しい3択に読み替えて表示する。
export type Disposition = "keep" | "organize" | "unsure";
export type DispositionTag = "heirloom" | "inherited" | "memory" | "other";

// デジタル情報・契約情報の種別(特許図面【図10】〜【図13】に対応)
export type DigitalItemType =
  | "subscription"
  | "account"
  | "data_storage"
  | "finance"
  | "insurance"
  | "contract"
  | "access_info"
  | "other";

// デジタル情報・契約情報の手続き状態(請求項9対応)
export type DigitalItemStatus = "not_started" | "in_progress" | "done";

// 遺品の整理進捗ステータス(請求項7の標準ワークフローに対応)
// 写真登録→AI解析/登録→査定待ち→査定完了→家族確認→処分方針の記録→搬送予定/搬出→完了
export type ItemStatus =
  | "photo_registered"
  | "appraisal_pending"
  | "appraisal_done"
  | "family_confirmed"
  | "policy_recorded"
  | "transport_scheduled"
  | "completed";

// ご依頼(買取・回収・整理サービス)の種別(特許図面【図2】【図18】の「ご依頼」に対応)
// appraisal: 品物ごとの「査定を依頼する」ボタンから送信される、自社スタッフによる本査定の依頼
export type ServiceType =
  | "all_in_one"
  | "buyback"
  | "junk_removal"
  | "estate_cleanup"
  | "pre_death_cleanup"
  | "appraisal";

export type ServiceRequestStatus = "pending" | "in_progress" | "done";

export type FamilyRelation =
  | "spouse"
  | "eldest_son"
  | "eldest_daughter"
  | "son"
  | "daughter"
  | "other";

export type Profile = {
  id: string;
  name: string | null;
  purpose: string | null;
  created_at: string;
  last_active_at: string | null;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Location = {
  id: string;
  user_id: string;
  parent_location_id: string | null;
  name: string;
  location_type: LocationType;
  sort_order: number | null;
  created_at: string;
};

export type Item = {
  id: string;
  user_id: string;
  recorded_by_user_id: string | null;
  photo_url: string | null;
  media_type: MediaType | null;
  name: string;
  category_major: CategoryMajor | null;
  category_minor: string | null;
  location_id: string | null;
  disposition: Disposition | null;
  disposition_tags: DispositionTag[] | null;
  estimated_price_range: string | null;
  professional_appraisal: string | null;
  status: ItemStatus;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

// 遺品ステータス変更履歴(請求項7「ステータス履歴(変更前、変更後、変更者、日時)」に対応)
export type ItemStatusHistory = {
  id: string;
  item_id: string;
  user_id: string;
  from_status: ItemStatus | null;
  to_status: ItemStatus;
  changed_by: string | null;
  changed_at: string;
};

// デジタル・契約情報(特許図面【図10】〜【図13】、【図23】【図24】に対応)
export type DigitalItem = {
  id: string;
  user_id: string;
  item_type: DigitalItemType;
  title: string;
  memo: string | null;
  contact_person: string | null;
  related_documents: string | null;
  status: DigitalItemStatus;
  created_at: string;
  updated_at: string;
};

// ご依頼(特許図面【図2】【図18】に対応)
// item_id: 品物ごとの「査定を依頼する」から送信された場合に対象の品物を紐づける(自社査定への一次窓口)
export type ServiceRequest = {
  id: string;
  user_id: string;
  service_type: ServiceType;
  item_id: string | null;
  note: string | null;
  status: ServiceRequestStatus;
  created_at: string;
};

// 家族と共有(特許図面【図2】【図18】の「家族と共有」に対応)
export type FamilyMember = {
  id: string;
  user_id: string;
  name: string;
  relation: FamilyRelation;
  created_at: string;
};

// 遺言書・遺言動画による本人の意思伝達情報(特許図面「もしもの時」に対応)
// 請求項8対応: 「本人の意思(想い)」と「法的な遺言事項」を明確に区別して保持する。
// message/video_url = 本人の想い・感謝のメッセージ(法的効力を主張しない私的な記録)
// legal_will_note = 財産分与など法的な遺言事項に関する記録(正式な遺言書の代替ではない旨の
//   免責への同意を得たうえで保存する。legal_disclaimer_acknowledged_at が同意日時)
export type Will = {
  id: string;
  user_id: string;
  message: string | null;
  video_url: string | null;
  legal_will_note: string | null;
  legal_disclaimer_acknowledged_at: string | null;
  updated_at: string;
};

// もしもの時(引き継ぎ)設定。開示条件(非アクティブ日数・承認者)と共有トークンを保持する
export type HandoverSettings = {
  user_id: string;
  inactive_days: number;
  approver_family_member_id: string | null;
  share_token: string;
  approved_at: string | null;
  updated_at: string;
};

// 共有相手ごとの遺言動画・遺言書と専用共有リンク(複数人共有対応)。
// 未設定の項目(message/video_url/legal_will_note が全てnull)の場合は、
// 共有時に Will(デフォルトの内容)へフォールバックする。
export type HandoverRecipient = {
  id: string;
  user_id: string;
  family_member_id: string | null;
  name: string;
  message: string | null;
  video_url: string | null;
  legal_will_note: string | null;
  legal_disclaimer_acknowledged_at: string | null;
  share_token: string;
  created_at: string;
  updated_at: string;
};

// 相続手続きチェックリストの完了状況(請求項1の相続レポート機能に対応)
export type ChecklistProgress = {
  user_id: string;
  procedure_key: string;
  done: boolean;
  updated_at: string;
};

// AIの声(カスタム音声)機能: 録音音声から作成した音声クローンの状態
export type VoiceProfileStatusValue = "pending" | "ready" | "failed";
export type VoiceProfile = {
  user_id: string;
  provider: string;
  external_voice_id: string | null;
  sample_storage_path: string | null;
  status: VoiceProfileStatusValue;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

// 「AIと日記」機能: 1日1問AIが質問を出し、テキストか音声で回答すると
// 臦分史として蓄積されていく(家族の思い出を代々残すための土台になる記録)。
export type JournalEntry = {
  id: string;
  user_id: string;
  question: string;
  answer_text: string | null;
  answer_audio_path: string | null;
  answered_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Omit<Profile, "id">> & { id: string };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      locations: {
        Row: Location;
        Insert: Partial<Omit<Location, "id" | "created_at">> & {
          user_id: string;
          name: string;
          location_type: LocationType;
        };
        Update: Partial<Omit<Location, "id" | "user_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "locations_parent_location_id_fkey";
            columns: ["parent_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: Item;
        Insert: Partial<Omit<Item, "id" | "created_at" | "updated_at">> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Omit<Item, "id" | "user_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "items_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      digital_items: {
        Row: DigitalItem;
        Insert: Partial<
          Omit<DigitalItem, "id" | "created_at" | "updated_at">
        > & {
          user_id: string;
          item_type: DigitalItemType;
          title: string;
        };
        Update: Partial<
          Omit<DigitalItem, "id" | "user_id" | "created_at">
        >;
        Relationships: [];
      };
      item_status_history: {
        Row: ItemStatusHistory;
        Insert: Partial<Omit<ItemStatusHistory, "id" | "changed_at">> & {
          item_id: string;
          user_id: string;
          to_status: ItemStatus;
        };
        Update: Partial<Omit<ItemStatusHistory, "id" | "item_id" | "user_id">>;
        Relationships: [
          {
            foreignKeyName: "item_status_history_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      service_requests: {
        Row: ServiceRequest;
        Insert: Partial<
          Omit<ServiceRequest, "id" | "created_at" | "status">
        > & {
          user_id: string;
          service_type: ServiceType;
        };
        Update: Partial<Omit<ServiceRequest, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      family_members: {
        Row: FamilyMember;
        Insert: Partial<Omit<FamilyMember, "id" | "created_at">> & {
          user_id: string;
          name: string;
          relation: FamilyRelation;
        };
        Update: Partial<Omit<FamilyMember, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      wills: {
        Row: Will;
        Insert: Partial<Omit<Will, "id" | "updated_at">> & {
          user_id: string;
        };
        Update: Partial<Omit<Will, "id" | "user_id">>;
        Relationships: [];
      };
      handover_settings: {
        Row: HandoverSettings;
        Insert: Partial<
          Omit<HandoverSettings, "share_token" | "updated_at">
        > & { user_id: string };
        Update: Partial<Omit<HandoverSettings, "user_id">>;
        Relationships: [
          {
            foreignKeyName: "handover_settings_approver_family_member_id_fkey";
            columns: ["approver_family_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      handover_recipients: {
        Row: HandoverRecipient;
        Insert: Partial<
          Omit<HandoverRecipient, "id" | "share_token" | "created_at" | "updated_at">
        > & { user_id: string; name: string };
        Update: Partial<Omit<HandoverRecipient, "id" | "user_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "handover_recipients_family_member_id_fkey";
            columns: ["family_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      inheritance_checklist_progress: {
        Row: ChecklistProgress;
        Insert: Partial<Omit<ChecklistProgress, "updated_at">> & {
          user_id: string;
          procedure_key: string;
        };
        Update: Partial<
          Omit<ChecklistProgress, "user_id" | "procedure_key">
        >;
        Relationships: [];
      };
      voice_profiles: {
        Row: VoiceProfile;
        Insert: Partial<
          Omit<VoiceProfile, "created_at" | "updated_at">
        > & { user_id: string };
        Update: Partial<Omit<VoiceProfile, "user_id" | "created_at">>;
        Relationships: [];
      };
      journal_entries: {
        Row: JournalEntry;
        Insert: Partial<Omit<JournalEntry, "id" | "created_at">> & {
          user_id: string;
          question: string;
        };
        Update: Partial<Omit<JournalEntry, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_handover_status: {
        Args: { p_token: string };
        Returns: Json;
      };
      approve_handover: {
        Args: { p_token: string };
        Returns: boolean;
      };
    };
  };
};
