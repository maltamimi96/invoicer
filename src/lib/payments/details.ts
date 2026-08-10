/**
 * Payment details held on file, for paying a client by hand.
 *
 * Plain module — no "use server" — so the form, the server actions and the
 * tests all share one definition of what a kind is and how a number is masked.
 *
 * 🔴 There is no card kind, and there must never be one. A stored card number
 * puts this database, its backups and its logs inside PCI-DSS audit scope, and
 * a stored CVV is prohibited outright at every compliance level. The database
 * CHECK is the real enforcement; this list is what the UI offers.
 */

export type PaymentDetailKind = "bank_au" | "bank_intl" | "payid" | "bpay" | "other";

export interface PaymentKindDef {
  value: PaymentDetailKind;
  label: string;
  /** What the encrypted `account` field holds for this kind. */
  accountLabel: string;
  /** What `routing` holds, or null when the kind has no routing value. */
  routingLabel: string | null;
  /** Shown under the fields — what someone is expected to type. */
  hintText: string;
}

export const PAYMENT_KINDS: PaymentKindDef[] = [
  {
    value: "bank_au", label: "Australian bank account",
    accountLabel: "Account number", routingLabel: "BSB",
    hintText: "Six-digit BSB and the account number.",
  },
  {
    value: "bank_intl", label: "International bank account",
    accountLabel: "IBAN / account number", routingLabel: "SWIFT / BIC",
    hintText: "IBAN where the country uses one, otherwise the account number and SWIFT.",
  },
  {
    value: "payid", label: "PayID",
    accountLabel: "PayID (email, phone or ABN)", routingLabel: null,
    hintText: "The identifier the client's PayID is registered against.",
  },
  {
    value: "bpay", label: "BPAY",
    accountLabel: "Reference number", routingLabel: "Biller code",
    hintText: "Biller code and the customer reference from their bill.",
  },
  {
    value: "other", label: "Other",
    accountLabel: "Reference", routingLabel: "Institution / code",
    hintText: "Anything that doesn't fit the above. Never a card number.",
  },
];

export const PAYMENT_KIND_LABELS: Record<PaymentDetailKind, string> =
  Object.fromEntries(PAYMENT_KINDS.map((k) => [k.value, k.label])) as Record<PaymentDetailKind, string>;

export function kindDef(kind: string): PaymentKindDef {
  return PAYMENT_KINDS.find((k) => k.value === kind) ?? PAYMENT_KINDS[PAYMENT_KINDS.length - 1];
}

/**
 * The masked value stored in plaintext so a list can be rendered without
 * decrypting anything.
 *
 * Last four for anything long enough to have four to spare; for a short value
 * we show nothing rather than most of it — masking that reveals five of six
 * digits is not masking.
 */
export function maskAccount(value: string): string {
  const clean = value.replace(/\s+/g, "");
  if (clean.length === 0) return "";
  if (clean.length <= 4) return "•".repeat(clean.length);
  return `•••• ${clean.slice(-4)}`;
}

/**
 * Does this look like a payment card rather than a bank account?
 *
 * A guard against the obvious mistake — someone typing a card number into the
 * account field because it's the only box on screen. 13-19 digits that pass
 * the Luhn check is the standard test for a PAN.
 *
 * Deliberately conservative: bank account numbers are typically 6-10 digits
 * and won't reach 13, so a false positive here is rare and the cost of one
 * (retyping into the right place) is far below the cost of a miss.
 */
export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface PaymentDetailInput {
  kind?: string;
  label?: string | null;
  holder_name?: string | null;
  bank_name?: string | null;
  account?: string | null;
  routing?: string | null;
  notes?: string | null;
  is_default?: boolean;
}

/** What's wrong with this entry, or null when it's fine. */
export function validatePaymentDetail(input: PaymentDetailInput): string | null {
  const account = (input.account ?? "").trim();
  if (!account) return "Enter the account number or reference.";

  if (looksLikeCardNumber(account)) {
    return "That looks like a card number. Card numbers can't be stored here — "
      + "use the client's bank account details instead.";
  }
  if (input.routing && looksLikeCardNumber(input.routing)) {
    return "That looks like a card number. Card numbers can't be stored here.";
  }
  // A CVV has nowhere to go in this shape, but people improvise with notes.
  if (/\b(cvv|cvc|security code|card number)\b/i.test(input.notes ?? "")) {
    return "Card details — including the CVV — can't be stored, even in notes.";
  }

  const kind = input.kind ?? "bank_au";
  if (!PAYMENT_KINDS.some((k) => k.value === kind)) return "Pick a valid type.";

  if (kindDef(kind).routingLabel && !(input.routing ?? "").trim()) {
    return `Enter the ${kindDef(kind).routingLabel!.toLowerCase()}.`;
  }
  return null;
}
