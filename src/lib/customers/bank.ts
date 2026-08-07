/**
 * Client bank details for direct debit — validation and display.
 *
 * Plain module (no "use server"), so the add-client form can validate before
 * submitting and the server can validate again. Australian format: BSB is 6
 * digits, account numbers run 5–10.
 */

export interface BankDetailsInput {
  accountName?: string | null;
  bsb?: string | null;
  accountNumber?: string | null;
}

/** Digits only — people type BSBs as "062-000" and accounts with spaces. */
export function digitsOnly(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** "062000" → "062-000", the way it's written on every Australian form. */
export function formatBsb(v: string | null | undefined): string {
  const d = digitsOnly(v);
  return d.length === 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}

/**
 * What's wrong with these details, or null when they're fine.
 *
 * Empty is valid — bank details are optional. But a HALF-filled set is not:
 * a BSB with no account number can't be debited, and silently keeping it
 * would look like the client is set up for direct debit when they aren't.
 */
export function validateBankDetails(input: BankDetailsInput): string | null {
  const bsb = digitsOnly(input.bsb);
  const acct = digitsOnly(input.accountNumber);
  const name = (input.accountName ?? "").trim();

  if (!bsb && !acct && !name) return null; // nothing entered

  if (!bsb || !acct) {
    return "Enter both the BSB and the account number, or leave both blank — one without the other can't be debited.";
  }
  if (bsb.length !== 6) return "A BSB is 6 digits (e.g. 062-000).";
  if (acct.length < 5 || acct.length > 10) return "An account number is between 5 and 10 digits.";
  if (!name) return "Add the account name, so you can check it matches before debiting.";
  return null;
}

/** Last 3 digits, for display. Short on purpose: an account number can be six
 *  digits, and showing four of six gives away most of it. */
export function accountLast3(accountNumber: string | null | undefined): string | null {
  const d = digitsOnly(accountNumber);
  return d.length >= 3 ? d.slice(-3) : null;
}

export function maskedAccount(last3: string | null | undefined): string {
  return last3 ? `•••• ${last3}` : "—";
}
