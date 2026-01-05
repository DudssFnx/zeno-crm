export function normalizeJid(phoneOrJid: string): string {
  const phone = phoneOrJid.replace(/[^\d@.a-z]/gi, "");
  
  if (phone.includes("@")) {
    return phone;
  }
  
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function extractPhoneFromJid(jid: string): string {
  if (!jid) return "";
  const match = jid.match(/^(\d+)@/);
  return match ? match[1] : jid.replace(/\D/g, "");
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isValidChatJid(jid: string): boolean {
  if (!jid) return false;
  
  if (jid === "status@broadcast") return false;
  if (jid.endsWith("@broadcast")) return false;
  if (jid.endsWith("@g.us")) return false;
  if (jid.endsWith("@newsletter")) return false;
  
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
