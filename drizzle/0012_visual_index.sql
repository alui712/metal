-- Visual Recall (ADR 0022). Was 0011_visual_index on feat/visual-recall; renumbered after 0011_split_clips with a newer
-- journal "when" so Drizzle never skips it. IF NOT EXISTS: databases that already ran the old 0011 keep their data.
CREATE TABLE IF NOT EXISTS `recording_visual_index` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`error` text,
	`job_id` text,
	`version` text NOT NULL,
	`model` text NOT NULL,
	`interval_ms` integer,
	`frame_count` integer,
	`extract_ms` integer,
	`embed_ms` integer,
	`requested_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visual_frames` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`t_ms` integer NOT NULL,
	`path` text NOT NULL,
	`is_scene_change` integer DEFAULT false NOT NULL,
	`model` text NOT NULL,
	`embedding` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `visual_frames_recording_t_idx` ON `visual_frames` (`recording_id`,`t_ms`);