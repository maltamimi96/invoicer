/**
 * Seed sequence library — the 11 verticals from the standalone Crown Roofers
 * agent, generalised so any business can start from them.
 *
 * What was ported and what deliberately wasn't:
 *   · the ARC — intro → nudge → availability → breakup, 0/3/7/14 days
 *   · the per-vertical ANGLE — a strata manager cares about documentation for
 *     committee meetings; a builder cares about not holding up the trade after
 *     them. That insight is the valuable part and it's kept verbatim in spirit.
 *   · NOT the Crown-specific identity — no company name, phone, licence or
 *     logo. The sender comes from outreach_settings (from_local_part +
 *     signature_html), so seeds must stay business-agnostic or every Kirei
 *     business would be emailing as a Sydney roofer.
 *
 * Bodies are PLAIN TEXT. The engine merges fields, HTML-escapes, then converts
 * newlines to <br> — so never put markup here, and use blank lines for spacing.
 * Merge fields: {{first_name}} {{name}} {{company}} {{title}} {{website}}
 *
 * A few lines carry [square brackets] — the one or two specifics only the
 * business can supply (licence, insurance, service area). The builder flags
 * them so they're not accidentally sent as-is.
 */

export interface SeedStep { subject: string; body: string; delay_days: number }
export interface SeedSequence {
  vertical: string;
  name: string;
  description: string;
  steps: SeedStep[];
}

/** Steps 2-4 follow the original 3 / 7 / 14-day cadence (delays are relative). */
const D = [0, 3, 4, 7];

export const SEED_SEQUENCES: SeedSequence[] = [
  {
    vertical: "strata",
    name: "Strata managers",
    description: "Get onto a strata portfolio's preferred-contractor list. Leads on documentation and after-hours response.",
    steps: [
      {
        subject: "Preferred contractor for your strata portfolio",
        delay_days: D[0],
        body: `Hi {{first_name}},

I wanted to introduce ourselves to {{company}} as a contractor for your strata portfolio.

Strata managers need someone they can call at any hour — and who leaves a paper trail the committee will accept. That's the part we take seriously:

· Same-day emergency callouts across [your service area]
· Inspection reports with photos, ready to table at a body corporate meeting
· Itemised quotes, so owners see exactly what they're voting on
· [Licence no.] · [public liability cover] · [workmanship guarantee]

Would a quick 10-minute call be worth it to see if we're a fit for your preferred list?`,
      },
      {
        subject: "Re: your strata portfolio",
        delay_days: D[1],
        body: `Hi {{first_name}},

Quick follow-up on my note last week — I know inboxes get busy.

The reason strata managers keep calling us back is the documentation. You always have what you need for owners' meetings and compliance records, without chasing us for it.

If there's a job coming up, or a building you'd like a second opinion on, I'm happy to come out and assess it at no cost.

Worth a chat?`,
      },
      {
        subject: "Current availability",
        delay_days: D[2],
        body: `Hi {{first_name}},

One more note. We've got good availability right now for both urgent repairs and planned works.

If anything is on the horizon — repairs, inspections, callouts or a full tender — I can turn a quote around within 24 hours.

Ten minutes on the phone now usually saves a lot of back-and-forth later.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll stop reaching out after this — I don't want to clutter your inbox.

If you ever need a reliable contractor for the portfolio, please keep us in mind. Happy to quote any time.

All the best to the team at {{company}}.`,
      },
    ],
  },
  {
    vertical: "real_estate",
    name: "Real estate & property management",
    description: "For agencies managing rentals. Leads on speed — a tenant complaint that stays open is the agency's problem.",
    steps: [
      {
        subject: "Fast, reliable trades for your rental properties",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm reaching out to {{company}} because managing repairs across a rent roll is usually a scheduling problem more than a trade problem.

What property managers tell us matters most:

· We answer the phone, and we turn up when we said we would
· Photos and a written report after every attendance, straight to your file
· We deal with the tenant directly so you're not relaying messages
· Quotes back same-day, so you can get landlord approval quickly

Would it be worth a short call about your maintenance list?`,
      },
      {
        subject: "Re: trades for {{company}}",
        delay_days: D[1],
        body: `Hi {{first_name}},

Following up briefly.

The complaint we hear most about trades is silence — the tenant chases the PM, the PM chases the trade, and nobody knows what's happening. We fix that by reporting back the same day we attend, every time.

If you've got a job sitting open right now, I'm happy to take a look at it.`,
      },
      {
        subject: "Availability for your portfolio",
        delay_days: D[2],
        body: `Hi {{first_name}},

We've got capacity at the moment and can take on additional properties.

If you've got a backlog of jobs, or one landlord who needs a quote before they'll approve anything, send it through and I'll come back to you within 24 hours.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

This is my last note — I won't keep following up.

If your current trade ever lets you down, we're here and we answer the phone. Best of luck with the rent roll.`,
      },
    ],
  },
  {
    vertical: "builder",
    name: "Builders & head contractors",
    description: "Subcontract work. Leads on not holding up the program — the builder's real fear.",
    steps: [
      {
        subject: "Subcontractor availability",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm getting in touch with {{company}} about subcontract work.

You already know the risk with a new sub: they hold up the trade after them. So the short version —

· We give you a realistic date, not an optimistic one
· Fully licensed and insured, all paperwork ready before we start [licence no.]
· We clean up and hand over so the next trade can start
· Priced off plans, no variations invented halfway through

Happy to price something small first so you can see how we work.`,
      },
      {
        subject: "Re: subcontract work",
        delay_days: D[1],
        body: `Hi {{first_name}},

Quick follow-up.

If it helps, send through one job — ideally something with a tight turnaround — and let us prove it on that before you consider us for anything bigger. That's usually the easiest way to find out if a sub is any good.

Any plans you'd like priced?`,
      },
      {
        subject: "Availability update",
        delay_days: D[2],
        body: `Hi {{first_name}},

We've got a gap in the schedule coming up and can take on additional work.

If you've got anything you need priced — or a sub who's let you down and left you needing someone at short notice — give me a call.`,
      },
      {
        subject: "Signing off",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll leave it there so I'm not cluttering your inbox.

If you're ever stuck for a sub at short notice, keep us in mind — that's often when we're most useful. All the best with the current program.`,
      },
    ],
  },
  {
    vertical: "ndis",
    name: "NDIS & SDA providers",
    description: "Disability housing. Leads on compliance, worker screening and minimal disruption to residents.",
    steps: [
      {
        subject: "Maintenance for NDIS & SDA properties",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm reaching out to {{company}} about maintenance across your NDIS and SDA properties.

These sites need more care than a standard job, so:

· Our team hold current NDIS Worker Screening and Working With Children checks
· We work around residents — quiet hours, clear notice, minimal disruption
· Written reports and photos suitable for your compliance records
· Urgent response when something affects a resident's safety

Would you like us to look at anything currently outstanding?`,
      },
      {
        subject: "Re: your NDIS properties",
        delay_days: D[1],
        body: `Hi {{first_name}},

Just following up.

The thing providers tell us is hardest is finding trades who understand that the resident comes first — not the schedule. We brief every person on site before they attend.

Happy to do a free assessment on any property you're unsure about.`,
      },
      {
        subject: "Free inspections this month",
        delay_days: D[2],
        body: `Hi {{first_name}},

We're offering free inspections on NDIS and SDA properties at the moment — a written condition report with photos, no obligation.

If you've got a property you've been meaning to get looked at, this is an easy way to find out where it stands.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll stop here.

If you ever need a screened, compliant trade team for your properties, we'd be glad to help. All the best to everyone at {{company}}.`,
      },
    ],
  },
  {
    vertical: "facilities",
    name: "Facilities management",
    description: "Multi-site FM contracts. Leads on one point of contact and predictable reporting.",
    steps: [
      {
        subject: "Contractor for your facilities portfolio",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'd like to introduce ourselves to {{company}} as a contractor across your managed sites.

Running multiple sites, what usually goes wrong is coordination rather than the work itself. So:

· One point of contact for every site, not a different number each time
· Consistent reporting format so your records stay tidy
· Scheduled preventative work as well as reactive callouts
· Fully licensed and insured [licence no. · insurance]

Is it worth a short call about the sites you manage?`,
      },
      {
        subject: "Re: your managed sites",
        delay_days: D[1],
        body: `Hi {{first_name}},

Following up on last week's note.

If it's easier, start us on a single site. It's a low-risk way to see whether our reporting and response times actually hold up before you'd consider us more broadly.

Any site you'd like us to look at?`,
      },
      {
        subject: "Capacity for new sites",
        delay_days: D[2],
        body: `Hi {{first_name}},

We have capacity for additional sites this quarter.

If you've got a contract coming up for renewal, or a site that isn't being serviced well, I'd welcome the chance to quote.`,
      },
      {
        subject: "Signing off",
        delay_days: D[3],
        body: `Hi {{first_name}},

Last note from me.

If a contractor ever falls through mid-contract, we're usually able to step in quickly. Keep us in mind, and all the best.`,
      },
    ],
  },
  {
    vertical: "insurance",
    name: "Insurance & claims",
    description: "Assessors, brokers and claims managers. Leads on report quality and scope accuracy.",
    steps: [
      {
        subject: "Licensed assessor & repairer for claims work",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm getting in touch with {{company}} about claims work.

What makes or breaks a claim is the report, so that's where we put the effort:

· Detailed assessment reports with photo evidence and a clear cause finding
· Scopes that hold up — we'd rather be accurate than optimistic
· Make-safe attendance at short notice, including after hours
· Fully licensed and insured [licence no. · insurance]

Would you like us on your panel for [your service area]?`,
      },
      {
        subject: "Re: claims partnership",
        delay_days: D[1],
        body: `Hi {{first_name}},

Quick follow-up.

If it's useful, send us one claim to assess and you can judge the report on its own merits. That tends to be more convincing than anything I can say in an email.

Happy to turn it around quickly.`,
      },
      {
        subject: "Storm season availability",
        delay_days: D[2],
        body: `Hi {{first_name}},

Ahead of the busy period — we're keeping capacity free for make-safe and assessment work.

If your usual panel gets stretched when the weather turns, it's worth having us set up beforehand rather than scrambling on the day.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll leave it there.

If you're ever short an assessor or repairer at short notice, we're happy to help. All the best.`,
      },
    ],
  },
  {
    vertical: "housing",
    name: "Social & community housing",
    description: "Community housing providers. Leads on tenant care, budget discipline and reporting.",
    steps: [
      {
        subject: "Maintenance for social & community housing",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm reaching out to {{company}} about maintenance across your housing portfolio.

We understand this work has constraints a private job doesn't:

· Budgets are fixed, so our quotes are itemised and we stick to them
· Tenants are treated respectfully, with proper notice before attendance
· Reports and photos suitable for funding and compliance reporting
· Responsive on urgent work that affects a tenant's safety or amenity

Would a short conversation be useful?`,
      },
      {
        subject: "Re: your housing portfolio",
        delay_days: D[1],
        body: `Hi {{first_name}},

Following up briefly.

The feedback we get is that we make the reporting side easy — which matters when you're accountable for how the money was spent.

Happy to assess any property at no cost so you know where it stands.`,
      },
      {
        subject: "Current availability",
        delay_days: D[2],
        body: `Hi {{first_name}},

We've got availability for planned maintenance at the moment.

If you're preparing a works program or need condition reports before you can budget, we can help with either.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll stop reaching out now.

If you ever need a contractor who understands housing work specifically, we'd be glad to help. All the best to the team.`,
      },
    ],
  },
  {
    vertical: "aged_care",
    name: "Aged care",
    description: "Residential aged care. Leads on resident safety, noise, screening and infection-control awareness.",
    steps: [
      {
        subject: "Contractor for aged care facilities",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm getting in touch with {{company}} about maintenance at your facilities.

Working in aged care isn't like a normal site, and we treat it accordingly:

· Police-checked, inducted staff who understand resident privacy
· Noise and disruption planned around residents' routines
· Clear site management so walkways and exits stay safe
· Documentation suitable for accreditation records

Could we have a brief conversation about your facilities?`,
      },
      {
        subject: "Re: your facilities",
        delay_days: D[1],
        body: `Hi {{first_name}},

Just a short follow-up.

The most common complaint about contractors in aged care is disruption — noise at the wrong time, equipment left where it shouldn't be. We plan around that before we start, not after someone complains.

Happy to walk a site with you at no cost.`,
      },
      {
        subject: "Availability",
        delay_days: D[2],
        body: `Hi {{first_name}},

We've got capacity for planned works right now, which is the easiest time to schedule around residents.

If you have anything upcoming, I can get you a quote quickly.`,
      },
      {
        subject: "Signing off",
        delay_days: D[3],
        body: `Hi {{first_name}},

This is my last note.

If you ever need a contractor who's comfortable working around residents, please keep us in mind. All the best to everyone at {{company}}.`,
      },
    ],
  },
  {
    vertical: "schools",
    name: "Schools & education",
    description: "Schools and campuses. Leads on holiday-period scheduling and child-safety compliance.",
    steps: [
      {
        subject: "Maintenance for schools & campuses",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm reaching out to {{company}} about maintenance work.

Schools have one constraint that dominates everything: the work has to fit around students.

· All staff hold current Working With Children clearances
· We schedule major works into term breaks and holidays
· Sites are fenced and made safe before we leave each day
· Written reports for your asset and compliance records

Would it be worth a short call before the next break?`,
      },
      {
        subject: "Re: maintenance at {{company}}",
        delay_days: D[1],
        body: `Hi {{first_name}},

Following up on my earlier note.

If you're planning holiday works, now is usually the time to lock in a contractor — the good windows fill up fast and everyone wants the same two weeks.

Happy to assess anything you're considering.`,
      },
      {
        subject: "Holiday period availability",
        delay_days: D[2],
        body: `Hi {{first_name}},

We're holding capacity for the upcoming break.

If there's work you've been deferring, this is the window. Send it through and I'll get you a quote so you can get approval in time.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll stop here so I'm not filling your inbox.

If a holiday works program ever needs a contractor at short notice, keep us in mind. All the best for the term.`,
      },
    ],
  },
  {
    vertical: "hospitality",
    name: "Hotels & hospitality",
    description: "Venues and hotels. Leads on working outside trading hours — downtime is lost revenue.",
    steps: [
      {
        subject: "Maintenance for your venue",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm getting in touch with {{company}} about maintenance.

In hospitality the cost isn't the repair, it's the closure. So we work to that:

· Attendance outside trading hours where the job allows
· Fast make-safe so you can keep operating while we plan the full fix
· Tidy, discreet crews — guests shouldn't notice we're there
· Quotes back quickly so approvals don't hold up the work

Would a quick call be worthwhile?`,
      },
      {
        subject: "Re: your venue",
        delay_days: D[1],
        body: `Hi {{first_name}},

Quick follow-up.

If you've got something that's been nagging — a leak, a recurring fault, something you've patched twice — I'm happy to look at it and tell you honestly whether it needs fixing properly or can wait.

No obligation either way.`,
      },
      {
        subject: "Current availability",
        delay_days: D[2],
        body: `Hi {{first_name}},

We've got availability at the moment, including out-of-hours work.

If there's something you've been putting off because you couldn't afford the downtime, that's exactly the kind of job we can schedule around you.`,
      },
      {
        subject: "Last note",
        delay_days: D[3],
        body: `Hi {{first_name}},

Last note from me.

If something goes wrong at the worst possible moment — which it usually does — we're contactable and quick. All the best with the venue.`,
      },
    ],
  },
  {
    vertical: "maintenance",
    name: "Maintenance companies & trade partners",
    description: "Other trades who need your speciality. Leads on being an extension of their team, not a competitor.",
    steps: [
      {
        subject: "Trade partner for your maintenance team",
        delay_days: D[0],
        body: `Hi {{first_name}},

I'm reaching out to {{company}} about working together as a trade partner.

You've got the client relationship — we're not interested in taking it. We just handle the work that falls outside what your team does:

· Trade rates, so there's margin left for you
· We attend as an extension of your team, in your name if you prefer
· Same-day or next-day response on urgent jobs
· Reports written so you can pass them straight to your client

Worth a quick chat about how it might work?`,
      },
      {
        subject: "Re: trade partnership",
        delay_days: D[1],
        body: `Hi {{first_name}},

Following up briefly.

The arrangement usually works best when you've got a client asking for something you don't do in-house, and subbing it out is easier than turning it down.

If that comes up, we're happy to be the call you make.`,
      },
      {
        subject: "Same-day availability for trade partners",
        delay_days: D[2],
        body: `Hi {{first_name}},

We keep capacity aside for trade partners specifically, so partner jobs don't sit behind our own.

If you've got something today or this week, give me a call and I'll tell you straight away whether we can get there.`,
      },
      {
        subject: "Signing off",
        delay_days: D[3],
        body: `Hi {{first_name}},

I'll leave it there.

If a client ever asks you for something outside your scope, keep us in mind rather than turning the job away. All the best.`,
      },
    ],
  },
];

export const SEEDS_BY_VERTICAL: Record<string, SeedSequence> =
  Object.fromEntries(SEED_SEQUENCES.map((s) => [s.vertical, s]));

/** Lines a seed left for the business to fill in — surfaced before sending. */
export function unfilledPlaceholders(body: string): string[] {
  return [...body.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
}
