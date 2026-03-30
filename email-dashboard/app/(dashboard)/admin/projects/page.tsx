import { redirect } from "next/navigation";

/** Legacy URL — threads live on `/threads` for all users. */
export default function AdminProjectsRedirectPage() {
  redirect("/threads");
}
