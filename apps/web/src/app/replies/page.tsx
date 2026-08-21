import { redirect } from "next/navigation";

export default function RepliesRedirect() {
  redirect("/conversations");
}
