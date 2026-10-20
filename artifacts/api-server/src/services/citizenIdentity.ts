import { tryDecrypt } from "./encryptionService";

type CitizenIdentityFields = {
  name: string | null | undefined;
  surname: string | null | undefined;
  givenNames: string | null | undefined;
};

/** Prefer the verified passport identity; keep the account alias as fallback. */
export function getCitizenDisplayName(citizen: CitizenIdentityFields): string {
  const legalName = [tryDecrypt(citizen.surname), tryDecrypt(citizen.givenNames)]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" ");
  return legalName || citizen.name?.trim() || "Гражданин TimeNation";
}
