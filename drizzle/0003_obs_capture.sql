CREATE TABLE `capture_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`result_json` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `capture_commands_status_idx` ON `capture_commands` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `capture_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`connection` text DEFAULT 'disabled' NOT NULL,
	`error` text,
	`obs_version` text,
	`recording` integer DEFAULT false NOT NULL,
	`record_duration_ms` integer DEFAULT 0 NOT NULL,
	`replay_active` integer DEFAULT false NOT NULL,
	`replay_seconds` integer,
	`replay_available` integer DEFAULT false NOT NULL,
	`last_clip_status` text,
	`last_clip_kind` text,
	`last_clip_at` integer,
	`last_clip_recording_id` text,
	`last_clip_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `recordings` ADD `origin` text DEFAULT 'upload' NOT NULL;