import * as crypto from "crypto";

export function uuidV4(): string {
  const maybeRandomUUID = (crypto as unknown as { randomUUID?: () => string }).randomUUID;
  if (typeof maybeRandomUUID === "function") {
    return maybeRandomUUID();
  }

  const bytes = crypto.randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
