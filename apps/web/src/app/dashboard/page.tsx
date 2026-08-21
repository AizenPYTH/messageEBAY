import { redirect } from "next/navigation";

/** Dashboard retiré de la nav — redirige vers Messages. */
export default function DashboardRedirect() {
  redirect("/conversations");
}
