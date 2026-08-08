/**
 * Password vault — shapes, categories and validation.
 *
 * Plain module (no "use server"), so the browser can validate and generate
 * before submitting and the server can validate again without importing
 * anything that touches node:crypto.
 */

export const VAULT_CATEGORIES = [
  { value: "login", label: "Website login" },
  { value: "social", label: "Social / ads account" },
  { value: "hosting", label: "Hosting / server" },
  { value: "domain", label: "Domain registrar" },
  { value: "software", label: "Software / SaaS" },
  { value: "email", label: "Email account" },
  { value: "wifi", label: "Wi-Fi / network" },
  { value: "banking", label: "Banking / finance" },
  { value: "other", label: "Other" },
] as const;

export type VaultCategory = (typeof VAULT_CATEGORIES)[number]["value"];

export function categoryLabel(value: string): string {
  return VAULT_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

/**
 * A vault entry as the browser sees it.
 *
 * There is no `password` field and no ciphertext. The list never carries the
 * secret — not even encrypted — so a stray console.log, a React DevTools
 * inspection or a cached RSC payload can't spill one. The plaintext exists in
 * the browser only for the moment after an explicit reveal.
 */
export interface VaultItemView {
  id: string;
  title: string;
  category: string;
  username: string | null;
  url: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  has_password: boolean;
  has_notes: boolean;
  updated_at: string;
  created_at: string;
}

export interface VaultItemInput {
  title?: string | null;
  category?: string | null;
  username?: string | null;
  url?: string | null;
  password?: string | null;
  notes?: string | null;
  customerId?: string | null;
}

/** What's wrong with this entry, or null when it's fine. */
export function validateVaultItem(input: VaultItemInput, opts: { isNew: boolean }): string | null {
  const title = (input.title ?? "").trim();
  if (!title) return "Give it a name, so you can find it later.";
  if (title.length > 120) return "That name is too long — keep it under 120 characters.";

  const url = (input.url ?? "").trim();
  if (url && !/^https?:\/\/\S+$/i.test(url) && !/^[\w-]+(\.[\w-]+)+/.test(url)) {
    return "That doesn't look like a web address.";
  }

  // An entry with nothing secret in it is a contact note, not a vault entry —
  // but only reject it on create. On edit, a blank password field means
  // "leave the stored one alone", not "delete it".
  if (opts.isNew && !(input.password ?? "").trim() && !(input.notes ?? "").trim()) {
    return "Add a password or some secure notes — otherwise there's nothing to protect.";
  }
  return null;
}

/** Normalise a typed address so the "open" link actually opens. */
export function normaliseUrl(url: string | null | undefined): string | null {
  const v = (url ?? "").trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export interface PasswordStrength {
  /** 0–4. */
  score: number;
  label: string;
  /** The single most useful thing to change, or null when it's already strong. */
  hint: string | null;
}

/**
 * A rough strength read for the generator and the entry form.
 *
 * Deliberately not a security control — it never blocks saving. Client
 * passwords are often set by the client, and refusing to store a weak one
 * would just push it back into a spreadsheet, which is worse.
 */
export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "—", hint: null };

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (classes >= 3) score++;
  if (pw.length >= 16 && classes >= 3) score++;

  // Obvious patterns cap it however long the password is.
  if (/^(.)\1+$/.test(pw) || /^(1234|qwer|abcd|pass|admin)/i.test(pw)) score = Math.min(score, 1);

  const label = ["Very weak", "Weak", "Fair", "Strong", "Very strong"][score];
  const hint =
    score >= 3 ? null
    : pw.length < 12 ? "Longer helps more than anything else — aim for 16+."
    : classes < 3 ? "Mix in capitals, numbers or symbols."
    : "Try a longer passphrase.";
  return { score, label, hint };
}

const ALPHABET = {
  lower: "abcdefghijkmnopqrstuvwxyz",   // no l
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",    // no I, O
  digit: "23456789",                     // no 0, 1
  symbol: "!@#$%^&*-_=+?",
};

/**
 * Generate a password using the browser's CSPRNG.
 *
 * Ambiguous characters (l/I/1, O/0) are left out: these get read aloud down
 * the phone and typed into someone else's login screen, and a password nobody
 * can transcribe gets replaced with a weak one.
 */
export function generatePassword(length = 20, useSymbols = true): string {
  const pool = ALPHABET.lower + ALPHABET.upper + ALPHABET.digit + (useSymbols ? ALPHABET.symbol : "");
  const required = [ALPHABET.lower, ALPHABET.upper, ALPHABET.digit, ...(useSymbols ? [ALPHABET.symbol] : [])];
  const len = Math.max(8, Math.min(64, length));

  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => pool[b % pool.length]);

  // Guarantee one of each class. Placed at fixed positions and then shuffled,
  // NOT written to random positions: random positions collide, and a collision
  // silently drops a class — which is how this shipped a password with no
  // digit in it.
  const picks = new Uint32Array(required.length);
  crypto.getRandomValues(picks);
  required.forEach((set, i) => { chars[i] = set[picks[i] % set.length]; });

  // Fisher-Yates, CSPRNG-driven, so the guaranteed characters don't sit in a
  // predictable prefix.
  const swaps = new Uint32Array(len);
  crypto.getRandomValues(swaps);
  for (let i = len - 1; i > 0; i--) {
    const j = swaps[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
