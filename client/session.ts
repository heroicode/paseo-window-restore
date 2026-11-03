import { z } from "zod";

const BoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type Bounds = z.infer<typeof BoundsSchema>;

/** What one desktop window last showed. `sidebarView` is the raw `sidebar-view` value it wrote. */
export const WindowRecordSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  route: z.string().nullable(),
  sidebarView: z.string().nullable(),
  bounds: BoundsSchema,
  seenAt: z.number(),
  closedAt: z.number().optional(),
});

export type WindowRecord = z.infer<typeof WindowRecordSchema>;

const SlotSchema = z.object({
  name: z.string().default(""),
  route: z.string().nullable(),
  sidebarView: z.string().nullable(),
  bounds: BoundsSchema,
});

export type Slot = z.infer<typeof SlotSchema>;

/** The windows a restoring window is opening, for those windows to find their slot. */
export const PlanSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  slots: z.array(SlotSchema),
});

export type Plan = z.infer<typeof PlanSchema>;

export const LastSessionSchema = z.array(WindowRecordSchema);

export const PendingSlotSchema = z.object({
  planId: z.string(),
  index: z.number(),
  bounds: BoundsSchema,
});

export type PendingSlot = z.infer<typeof PendingSlotSchema>;

/** Messages between windows. Claims, assignments, and acknowledgements go through the restoring window. */
export const MessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), id: z.string() }),
  z.object({ type: z.literal("pong"), id: z.string() }),
  z.object({
    type: z.literal("claim"),
    id: z.string(),
    planId: z.string(),
    route: z.string().nullable(),
  }),
  z.object({
    type: z.literal("assign"),
    to: z.string(),
    planId: z.string(),
    index: z.number(),
    reload: z.boolean(),
  }),
  z.object({ type: z.literal("applied"), planId: z.string(), index: z.number() }),
]);

export type Message = z.infer<typeof MessageSchema>;
export type AssignMessage = Extract<Message, { type: "assign" }>;

// Quitting skips page unload, so windows open at quit keep no `closedAt` and stop heartbeating
// together. A hidden window's timers can run a minute late, so the gap only drops records left
// behind by much older sessions.
const SESSION_GAP_MS = 10 * 60_000;
// Windows unloaded this close together went away as a group rather than one at a time.
const CLOSED_TOGETHER_MS = 5_000;

/** The windows that were open when Paseo last stopped, or the last ones closed if none were. */
export function previousSession(records: readonly WindowRecord[]): WindowRecord[] {
  const open = records.filter((record) => record.closedAt === undefined);
  if (open.length > 0) {
    const newest = Math.max(...open.map((record) => record.seenAt));
    return open.filter((record) => record.seenAt >= newest - SESSION_GAP_MS);
  }
  if (records.length === 0) return [];
  const lastClosed = Math.max(...records.map((record) => record.closedAt ?? 0));
  return records.filter((record) => (record.closedAt ?? 0) >= lastClosed - CLOSED_TOGETHER_MS);
}

/** False for the empty geometry a window reports once its native window is gone, as during quit. */
export function hasArea(bounds: Bounds): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

/** Index of the record whose window geometry is nearest `bounds`. */
export function closestIndex(records: readonly { bounds: Bounds }[], bounds: Bounds): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  records.forEach((record, index) => {
    const distance =
      Math.abs(record.bounds.x - bounds.x) +
      Math.abs(record.bounds.y - bounds.y) +
      Math.abs(record.bounds.width - bounds.width) +
      Math.abs(record.bounds.height - bounds.height);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function toSlot(record: WindowRecord): Slot {
  return {
    name: record.name,
    route: record.route,
    sidebarView: record.sidebarView,
    bounds: record.bounds,
  };
}

/**
 * The `{ serverId, workspaceId }` a window starts on when its workspace route is
 * /h/<serverId>/workspace/<workspaceId> (Internal: packages/app/src/utils/host-routes.ts).
 * Base64-encoded and legacy path IDs return null; those windows reload into their route instead.
 */
export function workspaceSelectionFromRoute(
  route: string | null,
): { serverId: string; workspaceId: string } | null {
  const match = route?.match(/^\/h\/([^/?#]+)\/workspace\/([^/?#]+)\/?(?:[?#].*)?$/);
  if (!match) return null;
  try {
    const serverId = decodeURIComponent(match[1]).trim();
    const workspaceId = decodeURIComponent(match[2]).trim();
    if (!serverId || !/^[A-Za-z0-9._~-]+$/.test(workspaceId) || workspaceId.startsWith("b64_")) {
      return null;
    }
    return { serverId, workspaceId };
  } catch {
    return null;
  }
}
