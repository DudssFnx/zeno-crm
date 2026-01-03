import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return "";
  
  // For LID numbers, show the full ID (WhatsApp Business linked device)
  // The contact name should be displayed separately, not replaced here
  if (phoneNumber.startsWith("LID_")) {
    const lidId = phoneNumber.replace("LID_", "");
    return lidId;
  }
  
  const digits = phoneNumber.replace(/\D/g, "");
  
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    if (number.length === 9) {
      return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
    } else if (number.length === 8) {
      return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
    }
  }
  
  return phoneNumber;
}

export function isLidNumber(phoneNumber: string | null | undefined): boolean {
  return phoneNumber?.startsWith("LID_") || false;
}

/**
 * Formata tempo desde a última mensagem recebida do cliente (PT-BR)
 * Usado para follow-up / positivar venda
 */
export function formatTimeAgo(dateInput: Date | string | null | undefined): string {
  if (!dateInput) {
    return "Nunca enviou mensagem";
  }
  
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) {
    return "Nunca enviou mensagem";
  }
  
  const now = Date.now();
  const diffMs = now - date.getTime();
  
  if (diffMs < 0) return "agora";
  
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffSec < 60) {
    return "agora";
  } else if (diffMin < 60) {
    return `há ${diffMin} min`;
  } else if (diffHours < 24) {
    return `há ${diffHours} h`;
  } else if (diffDays === 1) {
    return "há 1 dia";
  } else {
    return `há ${diffDays} dias`;
  }
}

/**
 * Retorna a classe de cor baseada na inatividade (para destaque visual)
 */
export function getInactivityColor(dateInput: Date | string | null | undefined): "ok" | "attention" | "critical" | "never" {
  if (!dateInput) {
    return "never";
  }
  
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) {
    return "never";
  }
  
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 2) {
    return "ok";
  } else if (diffDays <= 7) {
    return "attention";
  } else {
    return "critical";
  }
}
