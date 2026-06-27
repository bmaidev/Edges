import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import { createRoom, getArchive } from "@/lib/rooms";
import {
  addParticipant,
  addSubmission,
  listParticipants,
  setPhase,
  setPhases,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// F3 — optional alsoArchive before the wipe. Ending a session publishes the
// participant take-away and wipes the live data; without a durable archive the
// admin keeps nothing. The end path now offers (default-on) to snapshot the
// durable report first, so "End" never silently loses the record.

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-end-archive";
});

const PHASE: PhaseInstance = {
  id: "p1",
  moduleId: "capture",
  config: { label: "Ideas", prompt: "Go" },
};

async function seeded() {
  const { room, passcodes } = await createRoom("Offsite", "What next?");
  await setPhases([PHASE], "Blue Sky", room.slug);
  await setPhase(PHASE.id, room.slug);
  await addParticipant("a", "Ada", room.slug);
  await addSubmission("Ada", "ship it", "p1", null, "a", room.slug);
  return { slug: room.slug, code: passcodes.facilitator };
}

function endReq(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://x/api/r/${slug}/host`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("end with alsoArchive", () => {
  it("snapshots a durable archive before wiping when alsoArchive is true", async () => {
    const { slug, code } = await seeded();
    expect(await getArchive(slug)).toBeNull(); // nothing archived yet
    const res = await hostPOST(
      endReq(slug, { command: "end", code, alsoArchive: true }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(200);
    // the durable record survives the wipe
    const archive = await getArchive(slug);
    expect(archive).not.toBeNull();
    expect(archive!.participantCount).toBe(1);
    expect(archive!.submissions.length).toBe(1);
    // the live session was still wiped
    expect((await listParticipants(slug)).length).toBe(0);
  });

  it("keeps no durable archive when alsoArchive is false (or omitted)", async () => {
    const { slug, code } = await seeded();
    const res = await hostPOST(
      endReq(slug, { command: "end", code, alsoArchive: false }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(200);
    expect(await getArchive(slug)).toBeNull();
    // still wiped
    expect((await listParticipants(slug)).length).toBe(0);
  });
});
