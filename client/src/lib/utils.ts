import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return "";
  
  // For LID numbers, show just the ID portion (WhatsApp Business linked device)
  // The contact name should be displayed separately, not replaced here
  if (phoneNumber.startsWith("LID_")) {
    const lidId = phoneNumber.replace("LID_", "");
    // Return a shorter format - just show as ID
    return `ID: ${lidId.slice(-6)}`;
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
