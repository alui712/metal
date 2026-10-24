CREATE TABLE `clip_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`event_start_ms` integer NOT NULL,
	`event_end_ms` integer NOT NULL,
	`suggested_start_ms` integer NOT NULL,
	`suggested_end_ms` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`score` real NOT NULL,
	`confidence` text NOT NULL,
	`title` text NOT NULL,
	`evidence_json` text NOT NULL,
	`breakdown_json` text NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`save_status` text,
	`save_error` text,
	`save_job_id` text,
	`saved_recording_id` text,
	`analysis_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `clip_suggestions_recording_idx` ON `clip_suggestions` (`recording_id`,`start_ms`);--> statement-breakpoint
CREATE INDEX `clip_suggestions_status_idx` ON `clip_suggestions` (`status`);--> statement-breakpoint
CREATE TABLE `recording_analysis` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`error` text,
	`job_id` text,
	`has_audio` integer,
	`signals_json` text DEFAULT '{}' NOT NULL,
	`requested_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `audio_events` ADD `evidence_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `frames` ADD `scene_score` real;--> statement-breakpoint
ALTER TABLE `recordings` ADD `parent_recording_id` text REFERENCES recordings(id);--> statement-breakpoint
ALTER TABLE `recordings` ADD `parent_start_ms` integer;