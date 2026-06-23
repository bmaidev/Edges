import { redirect } from "next/navigation";

// The legacy default-room participant page lived here; with the legacy
// facilitator console removed, the default room can't be driven, so the root
// now points at the admin portal (the real entry point). Participants join a
// specific room via /r/<room>.
export default function Page() {
  redirect("/admin");
}
