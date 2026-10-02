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
export type Disposition = "keep" | "organize" | "unsure";
export type DispositionTag = "heirloom" | "inherited" | "memory" | "other";
export type DigitalItemType =
  | "subscription"
  | "account"
  | "data_storage"
  | "finance"
  | "insurance"
  | "contract"
  | "access_info"
  | "other";
export type DigitalItemStatus = "not_started" | "in_progress" | "done";
export type ItemStatus =
  | "photo_registered"
  | "appraisal_pending"
  | "appraisal_done"
  | "family_confirmed"
  | "policy_recorded"
  | "transport_scheduled"
  | "completed";
export type ServiceType =
  | "all_in_one"
  | "buyback"
  | "junk_removal"
  | "estate_cleanup"
  | "pre_death_cleanup"
  | "appraisal";
export type ServiceRequestStatus = "pending" | "in_progress" | "done";
export type FamilyRelation =
  | "father"
  | "mother"
  | "grandfather"
  | "grandmother"
  | "uncle"
  | "aunt"
  | "older_brother"
  | "older_sister"
  | "younger_brother"
  | "younger_sister"
  | "spouse"
  | "son"
  | "daughter"
  | "grandson"
  | "granddaughter"
  | "other"
  | "eldest_son"
  | "eldest_daughter";
export type Profile = {
  id: string;
  name: string | null;
  purpose: string | null;
  birth_date: string | null;
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
export type ItemStatusHistory = {
  id: string;
  item_id: string;
  user_id: string;
  from_status: ItemStatus | null;
  to_status: ItemStatus;
  changed_by: string | null;
  changed_at: string;
};
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
export type ServiceRequest = {
  id: string;
  user_id: string;
  service_type: ServiceType;
  item_id: string | null;
  note: string | null;
  status: ServiceRequestStatus;
  created_at: string;
};
export type FamilyMember = {
  id: string;
  user_id: string;
  name: string;
  relation: FamilyRelation;
  invite_token: string | null;
  linked_user_id: string | null;
  linked_at: string | null;
  created_at: string;
};
export type Will = {
  id: string;
  user_id: string;
  message: string | null;
  video_url: string | null;
  legal_will_note: string | null;
  legal_disclaimer_acknowledged_at: string | null;
  updated_at: string;
};
export type HandoverDisclosureStatus =
  | "pending"
  | "awaiting_certificate"
  | "certificate_submitted"
  | "approved"
  | "rejected";
export type HandoverSettings = {
  user_id: string;
  inactive_days: number;
  approver_family_member_id: string | null;
  share_token: string;
  approved_at: string | null;
  disclosure_status: HandoverDisclosureStatus;
  updated_at: string;
};
export type DeathCertificateSubmission = {
  id: string;
  user_id: string;
  recipient_name: string | null;
  image_path: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};
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
  share_items: boolean;
  share_digital_items: boolean;
  share_checklist: boolean;
  share_bucket_list: boolean;
  share_medical: boolean;
  share_album: boolean;
  share_mood: boolean;
  created_at: string;
  updated_at: string;
};
export type ChecklistProgress = {
  user_id: string;
  procedure_key: string;
  done: boolean;
  updated_at: string;
};
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
export type JournalEntry = {
  id: string;
  user_id: string;
  question: string;
  answer_text: string | null;
  answer_audio_path: string | null;
  answered_at: string | null;
  created_at: string;
};
export type TimeCapsuleUnlockConditionType =
  | "date"
  | "adulthood"
  | "marriage"
  | "same_age_as_sender";
export type TimeCapsule = {
  id: string;
  user_id: string;
  title: string;
  recipient_name: string | null;
  recipient_family_member_id: string | null;
  message_text: string | null;
  message_audio_path: string | null;
  open_at: string;
  unlock_condition_type: TimeCapsuleUnlockConditionType;
  sender_age_at_creation: number | null;
  marriage_certificate_path: string | null;
  marriage_verified_at: string | null;
  marriage_review_note: string | null;
  created_at: string;
};
export type ReceivedTimeCapsule =
  | {
      id: string;
      title: string;
      senderName: string;
      unlocked: true;
      unlockConditionType: TimeCapsuleUnlockConditionType;
      messageText: string | null;
      messageAudioPath: string | null;
      openAt: string;
      createdAt: string;
    }
  | {
      id: string;
      title: string;
      senderName: string;
      unlocked: false;
      unlockConditionType: TimeCapsuleUnlockConditionType;
      openAt: string;
      createdAt: string;
      marriageSubmitted: boolean;
    };
export type ConversationLogEntry = {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
};
export type BucketListItem = {
  id: string;
  user_id: string;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
};
export type MedicalInfo = {
  user_id: string;
  doctor_name: string | null;
  hospital_name: string | null;
  doctor_phone: string | null;
  conditions: string | null;
  medications: string | null;
  updated_at: string;
};
export type AlbumPhoto = {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  long_lived_url: string | null;
  created_at: string;
};
export type MoodValue = "good" | "normal" | "bad";
export type DailyMoodLog = {
  user_id: string;
  log_date: string;
  mood: MoodValue;
  created_at: string;
  updated_at: string;
};
export type VoiceCheckinSlot = "lunch" | "evening" | "night";
export type VoiceCheckin = {
  id: string;
  user_id: string;
  family_member_id: string | null;
  speaker_name: string;
  time_slot: VoiceCheckinSlot;
  message_text: string | null;
  storage_path: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
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
      time_capsules: {
        Row: TimeCapsule;
        Insert: Partial<Omit<TimeCapsule, "id" | "created_at">> & {
          user_id: string;
          title: string;
          open_at: string;
        };
        Update: Partial<Omit<TimeCapsule, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      conversation_logs: {
        Row: ConversationLogEntry;
        Insert: Partial<Omit<ConversationLogEntry, "id" | "created_at">> & {
          user_id: string;
          question: string;
          answer: string;
        };
        Update: Partial<
          Omit<ConversationLogEntry, "id" | "user_id" | "created_at">
        >;
        Relationships: [];
      };
      bucket_list_items: {
        Row: BucketListItem;
        Insert: Partial<
          Omit<BucketListItem, "id" | "created_at" | "updated_at">
        > & { user_id: string; title: string };
        Update: Partial<Omit<BucketListItem, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      medical_info: {
        Row: MedicalInfo;
        Insert: Partial<MedicalInfo> & {
          user_id: string;
        };
        Update: Partial<Omit<MedicalInfo, "user_id">>;
        Relationships: [];
      };
      album_photos: {
        Row: AlbumPhoto;
        Insert: Partial<Omit<AlbumPhoto, "id" | "created_at">> & {
          user_id: string;
          storage_path: string;
        };
        Update: Partial<Omit<AlbumPhoto, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      daily_mood_logs: {
        Row: DailyMoodLog;
        Insert: Partial<
          Omit<DailyMoodLog, "created_at">
        > & { user_id: string; log_date: string; mood: MoodValue };
        Update: Partial<
          Omit<DailyMoodLog, "user_id" | "log_date" | "created_at">
        >;
        Relationships: [];
      };
      voice_checkins: {
        Row: VoiceCheckin;
        Insert: Partial<
          Omit<VoiceCheckin, "id" | "created_at">
        > & { user_id: string; speaker_name: string; time_slot: VoiceCheckinSlot };
        Update: Partial<Omit<VoiceCheckin, "id" | "user_id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "voice_checkins_family_member_id_fkey";
            columns: ["family_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      death_certificate_submissions: {
        Row: DeathCertificateSubmission;
        Insert: Partial<
          Omit<DeathCertificateSubmission, "id" | "submitted_at">
        > & { user_id: string; image_path: string };
        Update: Partial<Omit<DeathCertificateSubmission, "id" | "user_id">>;
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
      get_family_invite_info: {
        Args: { p_token: string };
        Returns: Json;
      };
      accept_family_invite: {
        Args: { p_token: string; p_inviter_relation_to_me: string };
        Returns: Json;
      };
      link_family_by_email: {
        Args: { p_email: string; p_relation: string };
        Returns: Json;
      };
      get_received_time_capsules: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_voice_checkin_targets: {
        Args: Record<string, never>;
        Returns: Json;
      };
      verify_marriage_certificate: {
        Args: {
          p_capsule_id: string;
          p_image_path: string;
          p_verified: boolean;
          p_note: string;
        };
        Returns: boolean;
      };
    };
  };
};
