import { redirect } from "next/navigation";

// The contacts block now lives at the bottom of the landing page — keep old
// links working by redirecting to the anchor.
export default function ContactsPage() {
  redirect("/#contacts");
}
