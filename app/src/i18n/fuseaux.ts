// Fuseaux proposés dans le réglage (liste cherchable). Le fuseau forcé ou détecté y est toujours ajouté.
export const FUSEAUX = [
  "Pacific/Pago_Pago", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Vancouver", "America/Phoenix", "America/Denver",
  "America/Chicago", "America/Mexico_City", "America/Bogota", "America/Lima", "America/New_York", "America/Toronto", "America/Montreal",
  "America/Caracas", "America/Halifax", "America/Santiago", "America/Argentina/Buenos_Aires", "America/Sao_Paulo", "America/Paramaribo",
  "America/Martinique", "America/Guadeloupe", "America/Cayenne", "America/St_Johns", "Atlantic/Azores", "Atlantic/Reykjavik",
  "Atlantic/Canary", "UTC", "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Africa/Casablanca", "Africa/Abidjan", "Africa/Dakar",
  "Africa/Lagos", "Africa/Algiers", "Africa/Tunis", "Europe/Paris", "Europe/Brussels", "Europe/Amsterdam", "Europe/Luxembourg", "Europe/Zurich",
  "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Vienna", "Europe/Prague", "Europe/Warsaw", "Europe/Stockholm", "Europe/Oslo",
  "Europe/Copenhagen", "Europe/Budapest", "Europe/Belgrade", "Africa/Kinshasa", "Africa/Douala", "Africa/Johannesburg", "Africa/Cairo",
  "Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Bucharest", "Asia/Beirut", "Asia/Jerusalem", "Africa/Nairobi", "Africa/Addis_Ababa",
  "Indian/Reunion", "Indian/Mayotte", "Indian/Antananarivo", "Indian/Mauritius", "Europe/Istanbul", "Europe/Moscow", "Asia/Riyadh", "Asia/Baghdad",
  "Asia/Tehran", "Asia/Dubai", "Asia/Baku", "Asia/Kabul", "Asia/Karachi", "Asia/Tashkent", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka",
  "Asia/Yangon", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Jakarta", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore", "Asia/Kuala_Lumpur",
  "Asia/Manila", "Asia/Taipei", "Australia/Perth", "Asia/Tokyo", "Asia/Seoul", "Australia/Adelaide", "Australia/Darwin", "Australia/Brisbane",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Guam", "Pacific/Noumea", "Pacific/Tahiti", "Pacific/Auckland", "Pacific/Fiji",
] as const;

/** « Europe/Paris » → « Paris » ; « America/Argentina/Buenos_Aires » → « Buenos Aires ». */
export function villeDuFuseau(z: string): string {
  const v = z.split("/").pop() ?? z;
  return v.replace(/_/g, " ");
}

/** « Europe/Paris » → « Europe » (pour les fuseaux hors continent : « UTC »). */
export function regionDuFuseau(z: string): string {
  return z.includes("/") ? z.split("/")[0]! : "";
}
