import { redirect } from "next/navigation";

// Middleware handles auth redirect; this catches any direct hits
export default function RootPage() {
  redirect("/dashboard");
}
