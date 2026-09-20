// A Staff Member's Role (see CONTEXT.md). moderator can ban and unban players;
// admin can do that plus everything else in the admin area.
export const STAFF_ROLES = ["moderator", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
