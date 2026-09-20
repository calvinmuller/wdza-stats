import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/require-staff";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

// Staff Members sign in here. The URL is not linked from anywhere: the goal is
// "not advertised", not secrecy, since knowing it grants nothing without a
// password (ADR 0005).
export default async function SignInPage() {
  if (await getCurrentStaff()) redirect("/admin");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-zinc-50">Staff sign in</h1>
      <SignInForm />
    </main>
  );
}
