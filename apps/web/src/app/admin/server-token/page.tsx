import { redirect } from "next/navigation";

// Each Server's kill feed token now lives with the rest of its settings.
export default function ServerTokenPage(): never {
  redirect("/admin/servers");
}
