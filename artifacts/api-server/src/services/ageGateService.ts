export type AgeTier = "UNDER_13" | "TEEN" | "ADULT";

export function canUseAdultKycFeature(
  dateOfBirth: string | null | undefined,
  kycVerified: boolean,
  now = new Date(),
): boolean {
  return deriveAgeTier(dateOfBirth ?? "", now) === "ADULT" && kycVerified;
}

export function canPublishUnmoderatedContent(dateOfBirth: string | null | undefined, now = new Date()): boolean {
  return deriveAgeTier(dateOfBirth ?? "", now) === "ADULT";
}

export function deriveAgeTier(dateOfBirth: string, today = new Date()): AgeTier | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const dob = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month! - 1 ||
    dob.getUTCDate() !== day ||
    dob.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  ) return null;

  let age = today.getUTCFullYear() - year!;
  const birthdayHasPassed =
    today.getUTCMonth() > month! - 1 ||
    (today.getUTCMonth() === month! - 1 && today.getUTCDate() >= day!);
  if (!birthdayHasPassed) age--;

  if (age < 13) return "UNDER_13";
  if (age < 18) return "TEEN";
  return "ADULT";
}
