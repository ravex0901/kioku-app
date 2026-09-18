type NamedLocation = { name: string } | { name: string }[] | null;

export function resolveLocationName(location: NamedLocation): string {
  if (!location) return "場所未設定";
  if (Array.isArray(location)) return location[0]?.name ?? "場所未設定";
  return location.name;
}
