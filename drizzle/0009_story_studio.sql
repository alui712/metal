PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_story_clips` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`recording_id` text,
	`moment_id` text,
	`suggestion_id` text,
	`in_ms` integer NOT NULL,
	`out_ms` integer NOT NULL,
	`caption` text,
	FOREIGN KEY (`project_id`) REFERENCES `story_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suggestion_id`) REFERENCES `clip_suggestions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_story_clips`("id", "project_id", "position", "recording_id", "moment_id", "suggestion_id", "in_ms", "out_ms", "caption") SELECT "id", "project_id", "position", "recording_id", "moment_id", "suggestion_id", "in_ms", "out_ms", "caption" FROM `story_clips`;--> statement-breakpoint
DROP TABLE `story_clips`;--> statement-breakpoint
ALTER TABLE `__new_story_clips` RENAME TO `story_clips`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `story_clips_project_idx` ON `story_clips` (`project_id`,`position`);--> statement-breakpoint
ALTER TABLE `exports` ADD `edl_json` text;--> statement-breakpoint
ALTER TABLE `exports` ADD `error` text;--> statement-breakpoint
ALTER TABLE `exports` ADD `finished_at` integer;--> statement-breakpoint
ALTER TABLE `story_projects` ADD `captions` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `story_projects` ADD `framing` text DEFAULT 'fill' NOT NULL;