/**
 * Utility functions for normalizing WhatsApp JIDs (Jabber IDs)
 * 
 * REGRA DE OURO: A chave única de uma conversa deve ser SEMPRE o remoteJid normalizado
 * Formato: 5511963232981@s.whatsapp.net
 */

/**
 * Normaliza um número de telefone para o formato JID do WhatsApp
 * @param phone Número de telefone em qualquer formato
 * @returns JID normalizado no formato: 5511XXXXXXXXX@s.whatsapp.net
 */
export function normalizeJid(phone: string): string {
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, "");
  
  // Se não começar com 55 (Brasil), prefixar
  if (!digits.startsWith("55") && digits.length <= 11) {
    digits = "55" + digits;
  }
  
  return `${digits}@s.whatsapp.net`;
}

/**
 * Extrai o número de telefone de um JID
 * @param jid JID do WhatsApp (ex: 5511963232981@s.whatsapp.net)
 * @returns Número de telefone normalizado (ex: 5511963232981)
 */
export function extractPhoneFromJid(jid: string): string {
  // Remove sufixos do WhatsApp e mantém só dígitos
  return jid.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/\D/g, "");
}

/**
 * Normaliza um número de telefone para formato consistente (somente dígitos com prefixo 55)
 * LIDs (Linked Device IDs) são preservados como identificadores especiais
 * @param phone Número de telefone em qualquer formato
 * @returns Número normalizado (ex: 5511963232981) ou LID preservado (ex: LID_263298842914873)
 */
export function normalizePhone(phone: string): string {
  // Preservar LIDs (Linked Device IDs) - são identificadores especiais do WhatsApp
  if (phone.startsWith("LID_")) {
    return phone;
  }
  
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, "");
  
  // Se não começar com 55 (Brasil), prefixar
  if (!digits.startsWith("55") && digits.length <= 11) {
    digits = "55" + digits;
  }
  
  return digits;
}

/**
 * Verifica se um JID é válido para chat (não é grupo, broadcast ou status)
 * @param jid JID do WhatsApp
 * @returns true se for um chat válido
 */
export function isValidChatJid(jid: string): boolean {
  if (!jid) return false;
  if (jid.includes("@newsletter")) return false;
  if (jid.includes("@broadcast")) return false;
  if (jid === "status@broadcast") return false;
  if (jid.endsWith("@g.us")) return false; // grupos ignorados
  // Verificar se é um número que começa com 120363 (grupos internos do WhatsApp)
  if (jid.startsWith("120363")) return false;
  return true;
}

/**
 * Verifica se um número de telefone é válido (10-15 dígitos) ou é um LID válido
 * @param phone Número de telefone ou LID
 * @returns true se for válido
 */
export function isValidPhoneNumber(phone: string): boolean {
  // LIDs são sempre válidos
  if (phone.startsWith("LID_")) {
    return true;
  }
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Compara dois números de telefone normalizando-os primeiro
 * @param phone1 Primeiro número
 * @param phone2 Segundo número
 * @returns true se forem o mesmo número
 */
export function phoneNumbersMatch(phone1: string, phone2: string): boolean {
  return normalizePhone(phone1) === normalizePhone(phone2);
}
