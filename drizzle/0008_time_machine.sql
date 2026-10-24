CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clip_suggestions` ADD `favorite_at` integer;--> statement-breakpoint
ALTER TABLE `recordings` ADD `recorded_at_source` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `session_locked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `locked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `story_clips` ADD `suggestion_id` text REFERENCES clip_suggestions(id);--> statement-breakpoint
-- Upload time was used as a fallback recording time; it isn't one. Clear it.
UPDATE `recordings` SET `recorded_at` = NULL WHERE `origin` = 'upload' AND `recorded_at` IS NOT NULL AND abs(`recorded_at` - `created_at`) < 2000;
--> statement-breakpoint
UPDATE `recordings` SET `recorded_at_source` = CASE
  WHEN `recorded_at` IS NULL THEN NULL
  WHEN `origin` IN ('obs-replay', 'obs-recording') THEN 'capture'
  WHEN `origin` = 'clip' THEN 'parent'
  ELSE 'file-date' END;
