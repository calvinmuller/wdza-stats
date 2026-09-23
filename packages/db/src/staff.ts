// A Staff Member's Role (see CONTEXT.md). moderator can ban and unban players;
// admin can do that plus everything else in the admin area.
export const STAFF_ROLES = ["moderator", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// What a Staff Member (or the secret-gated bootstrap page) did, as recorded in
// staffAuditLog. One entry per successful action.
export const STAFF_ACTIONS = [
  "ban_player",
  "unban_player",
  "update_xp_reward",
  "update_level_threshold",
  "update_challenge_definition",
  "update_achievement_definition",
  "update_notification_rule",
  "update_notification_settings",
  "update_kick_vote_settings",
  "cancel_kick_vote",
  "generate_feed_token",
  "add_staff_member",
  "change_staff_role",
  "reset_staff_password",
  "remove_staff_member",
  "change_own_password",
  "bootstrap_create_admin",
  "bootstrap_reset_admin_password",
] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];
