import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTION_BY_SLUG } from "@/lib/marketing/solutions";

const solution = SOLUTION_BY_SLUG["agencies"];

export const metadata: Metadata = {
  title: `${solution.name} — ${solution.headline}`,
  description: solution.subhead,
};

export default function AgenciesPage() {
  return <SolutionPage solution={solution} />;
}
