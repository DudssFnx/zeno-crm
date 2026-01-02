import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return "";
  
  if (phoneNumber.startsWith("LID_")) {
    return "Dispositivo vinculado";
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
