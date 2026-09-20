import { notFound } from "next/navigation";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { db } from "@/lib/db";
import { adminExists } from "@/lib/staff-bootstrap";
import { createFirstAdminAction, resetAdminPasswordAction } from "./actions";
import { BootstrapForm } from "./bootstrap-form";

export const dynamic = "force-dynamic";

// The one thing ADMIN_PATH_SECRET is still for (ADR 0005): creating the first
// admin when there is none, and resetting an admin's password when nobody can
// sign in. Everything else about Staff Members needs a signed-in admin.
export default async function BootstrapPage({ params }: { params: Promise<{ adminSecret: string }> }) {
  const { adminSecret } = await params;
  if (adminSecret !== ADMIN_PATH_SECRET) notFound();

  const hasAdmin = await adminExists(db);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-zinc-50">Staff bootstrap</h1>
      {hasAdmin ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-zinc-100">Reset an admin&apos;s password</h2>
          <p className="text-sm text-zinc-400">
            Use this only when no admin can sign in. It signs that admin out everywhere.
          </p>
          <BootstrapForm
            action={resetAdminPasswordAction.bind(null, adminSecret)}
            withName={false}
            submitLabel="Reset password"
            successMessage="Password reset. The admin can sign in with it now."
          />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-zinc-100">Create the first admin</h2>
          <p className="text-sm text-zinc-400">There is no admin yet. This form disappears once one exists.</p>
          <BootstrapForm
            action={createFirstAdminAction.bind(null, adminSecret)}
            withName
            submitLabel="Create admin"
            successMessage="Admin created. They can sign in now."
          />
        </section>
      )}
    </main>
  );
}
