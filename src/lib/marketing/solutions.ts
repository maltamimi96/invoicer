/**
 * The two things Kirei sells, and what they cost.
 *
 * Everything the marketing pages say lives here, so the copy and the prices
 * are edited in one file rather than hunted across five pages.
 *
 * 🔴 THE PRICES BELOW ARE PLACEHOLDERS. They are structurally sensible and
 * deliberately obvious, but they are not researched against your costs or your
 * market. Set them before this is shown to anyone, or set `showPrices: false`
 * and the pages will present the tiers without numbers and route to sales.
 */

export interface Plan {
  id: string;
  name: string;
  /** Monthly price in the currency below. null = "talk to us". */
  price: number | null;
  /** One line under the name. */
  tagline: string;
  /** What you get, in the order a buyer cares about. */
  features: string[];
  /** Draws the emphasised card. Exactly one per solution. */
  featured?: boolean;
  /** Overrides the default "Start free" call to action. */
  cta?: string;
}

export interface Solution {
  id: "trades" | "agency";
  /** The preset applied at signup — must match an id in lib/plugins/presets. */
  preset: string;
  /** URL segment: /trades, /agencies. */
  slug: string;
  name: string;
  /** The five-second answer to "what is this". */
  headline: string;
  subhead: string;
  /** Who this is not for, said plainly — it saves everyone time. */
  notFor: string;
  highlights: Array<{ title: string; body: string }>;
  plans: Plan[];
}

/** Flip to false to publish tiers without numbers while pricing is decided. */
export const SHOW_PRICES = true;

export const CURRENCY = "AUD";
export const CURRENCY_SYMBOL = "$";

export const SOLUTIONS: Solution[] = [
  {
    id: "trades",
    preset: "trades",
    slug: "trades",
    name: "Kirei for Trades",
    headline: "Quote it, do it, get paid for it.",
    subhead:
      "One place for the jobs, the quotes and the invoices — without the twenty things you'd never use.",
    notFor:
      "If you run an agency looking after other trade businesses, you want Kirei for Agencies instead.",
    highlights: [
      {
        title: "A quote out the same day",
        body: "Build a quote from your price list on the phone, send it as a PDF, and take a deposit on the card when they accept.",
      },
      {
        title: "The week on one screen",
        body: "Jobs, who's on them and what's still unbooked. Your crew see only the jobs they're assigned to.",
      },
      {
        title: "Invoices that chase themselves",
        body: "Invoice off the finished job, take payment by card or bank, and let the overdue ones send their own reminders.",
      },
      {
        title: "Ask instead of clicking",
        body: "“What's owing on the Harlow job?” Type it or say it — the assistant can read and change anything you can.",
      },
    ],
    plans: [
      {
        id: "solo",
        name: "Solo",
        price: 29,
        tagline: "One person, on the tools.",
        features: [
          "Unlimited quotes and invoices",
          "Jobs, scheduling and site reports",
          "Card and bank payments",
          "Your price list and materials",
          "The AI assistant",
        ],
      },
      {
        id: "crew",
        name: "Crew",
        price: 79,
        tagline: "You and a few on the vans.",
        featured: true,
        features: [
          "Everything in Solo",
          "Up to 10 team members",
          "Worker app — crews see only their jobs",
          "Timesheets and job costing",
          "Recurring jobs and billing",
          "Online booking",
        ],
      },
      {
        id: "business",
        name: "Business",
        price: 179,
        tagline: "A real operation to run.",
        features: [
          "Everything in Crew",
          "Unlimited team members",
          "Expenses, assets and inventory",
          "Payroll and pay runs",
          "Automations",
          "API and MCP access",
        ],
      },
    ],
  },
  {
    id: "agency",
    preset: "agency",
    slug: "agencies",
    name: "Kirei for Agencies",
    headline: "Run your trade clients' businesses, and your own.",
    subhead:
      "Every client account under one login, plus the SEO, content and outreach you sell them.",
    notFor:
      "If you're a trade business running your own jobs, Kirei for Trades is smaller, cheaper and the right fit.",
    highlights: [
      {
        title: "Every client, one login",
        body: "Switch between the businesses you look after, or see all of them at once — what's overdue, what's booked, what needs you today.",
      },
      {
        title: "The work you sell them",
        body: "SEO production, a content pipeline, outreach and white-label reporting — pointed at your clients' sites, from the same place you invoice them.",
      },
      {
        title: "Onboarding that isn't email tennis",
        body: "Send a form, collect their details, logos and logins, and keep credentials encrypted in the vault instead of a spreadsheet.",
      },
      {
        title: "Retainers that bill themselves",
        body: "Contracts, recurring invoices and saved cards, so the monthly fee lands without anyone chasing it.",
      },
    ],
    plans: [
      {
        id: "studio",
        name: "Studio",
        price: 149,
        tagline: "You and your first few clients.",
        features: [
          "Up to 5 client accounts",
          "Everything in Kirei for Trades",
          "Client onboarding and forms",
          "Contracts and e-signature",
          "Retainer billing with saved cards",
        ],
      },
      {
        id: "agency",
        name: "Agency",
        price: 349,
        tagline: "A book of clients to keep happy.",
        featured: true,
        features: [
          "Up to 25 client accounts",
          "Everything in Studio",
          "SEO production and Search Console",
          "Content studio and campaigns",
          "Outreach and prospecting",
          "White-label client reporting",
        ],
      },
      {
        id: "network",
        name: "Network",
        price: null,
        tagline: "More clients than that.",
        cta: "Talk to sales",
        features: [
          "Unlimited client accounts",
          "Everything in Agency",
          "Priority support",
          "Onboarding help for your team",
          "Volume pricing",
        ],
      },
    ],
  },
];

export const SOLUTION_BY_SLUG = Object.fromEntries(
  SOLUTIONS.map((s) => [s.slug, s]),
) as Record<string, Solution>;

/** Signup URL that pre-selects the solution's preset. */
export function signupHref(solution: Solution): string {
  return `/auth/register?solution=${solution.preset}`;
}

export function formatPrice(p: Plan): string {
  if (p.price === null) return "Let's talk";
  return `${CURRENCY_SYMBOL}${p.price}`;
}
