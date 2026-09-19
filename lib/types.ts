export type LocationType = "building" | "floor" | "room" | "storage";
export type MediaType = "image" | "video";
export type CategoryMajor =
  | "furniture"
  | "appliance"
  | "clothing"
  | "tableware"
  | "books"
  | "jewelry"
  | "asset"
  | "subscription"
  | "insurance"
  | "other";
export type Disposition =
  | "keep"
  | "keepsake"
  | "sell"
  | "discard"
  | "undecided";
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

// ご依頼(買取・回収・整理サービス)の種別(特許図面【図2】【図18】の「ご依頼」に対応)
export type ServiceType =
  | "all_in_one"
  | "buyback"
  | "junk_removal"
  | "estate_cleanup"
  | "pre_death_cleanup";

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
};

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
  memo: string | null;
  created_at: string;
  updated_at: string;
};

// デジタル・契約情報(特許図面【図10】〜【図13】、【図23】【図24】に対応)
export type DigitalItem = {
  id: string;
  user_id: string;
  item_type: DigitalItemType;
  title: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

// ご依頼(特許図面【図2】【図18】に対応)
export type ServiceRequest = {
  id: string;
  user_id: string;
  service_type: ServiceType;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
