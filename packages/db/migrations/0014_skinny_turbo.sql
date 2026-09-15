CREATE INDEX "player_career_stats_server_xp_idx" ON "player_career_stats" USING btree ("server_id","xp");--> statement-breakpoint
CREATE INDEX "player_career_stats_server_kills_idx" ON "player_career_stats" USING btree ("server_id","kills");--> statement-breakpoint
CREATE INDEX "player_career_stats_server_wins_idx" ON "player_career_stats" USING btree ("server_id","matches_won");--> statement-breakpoint
CREATE INDEX "player_career_stats_server_streak_idx" ON "player_career_stats" USING btree ("server_id","highest_kill_streak");