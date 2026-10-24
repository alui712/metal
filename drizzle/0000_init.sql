CREATE TABLE `ai_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_refs_json` text DEFAULT '[]' NOT NULL,
	`output_json` text NOT NULL,
	`job_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_outputs_kind_idx` ON `ai_outputs` (`kind`);--> statement-breakpoint
CREATE TABLE `audio_events` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`kind` text NOT NULL,
	`score` real NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audio_events_recording_idx` ON `audio_events` (`recording_id`,`start_ms`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`moment_id` text,
	`source` text NOT NULL,
	`source_ref_id` text,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` blob,
	`embed_model` text,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chunks_recording_idx` ON `chunks` (`recording_id`);--> statement-breakpoint
CREATE TABLE `frames` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`t_ms` integer NOT NULL,
	`path` text NOT NULL,
	`is_scene_change` integer DEFAULT false NOT NULL,
	`phash` text,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frames_recording_t_idx` ON `frames` (`recording_id`,`t_ms`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`recording_id` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text,
	`progress` real DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 2 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`heartbeat_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_recording_idx` ON `jobs` (`recording_id`);--> statement-breakpoint
CREATE TABLE `moments` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`title` text,
	`kind` text NOT NULL,
	`score` real NOT NULL,
	`thumb_frame_id` text,
	`sources_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thumb_frame_id`) REFERENCES `frames`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moments_recording_idx` ON `moments` (`recording_id`,`start_ms`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`game` text,
	`owner_label` text,
	`original_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`proxy_path` text,
	`poster_path` text,
	`duration_ms` integer,
	`width` integer,
	`height` integer,
	`fps` real,
	`size_bytes` integer,
	`recorded_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`status` text DEFAULT 'imported' NOT NULL,
	`error` text,
	`session_id` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recordings_session_idx` ON `recordings` (`session_id`);--> statement-breakpoint
CREATE INDEX `recordings_recorded_at_idx` ON `recordings` (`recorded_at`);--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`output_path` text,
	`duration_ms` integer,
	`size_bytes` integer,
	`job_id` text,
	`ffmpeg_cmd` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `story_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`summary` text,
	`game` text,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`cover_frame_id` text,
	`ai_output_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ai_output_id`) REFERENCES `ai_outputs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `story_clips` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`recording_id` text NOT NULL,
	`moment_id` text,
	`in_ms` integer NOT NULL,
	`out_ms` integer NOT NULL,
	`caption` text,
	FOREIGN KEY (`project_id`) REFERENCES `story_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `story_clips_project_idx` ON `story_clips` (`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `story_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prompt` text,
	`ops_json` text NOT NULL,
	`before_json` text NOT NULL,
	`ai_output_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `story_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_output_id`) REFERENCES `ai_outputs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `story_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`aspect` text DEFAULT '16:9' NOT NULL,
	`source_session_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`text` text NOT NULL,
	`speaker` text,
	`confidence` real,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transcript_recording_idx` ON `transcript_segments` (`recording_id`,`start_ms`);--> statement-breakpoint
CREATE TABLE `visual_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`t_ms` integer NOT NULL,
	`caption` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`events_json` text DEFAULT '[]' NOT NULL,
	`ai_output_id` text NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`frame_id`) REFERENCES `frames`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_output_id`) REFERENCES `ai_outputs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `observations_recording_idx` ON `visual_observations` (`recording_id`,`t_ms`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`pid` integer NOT NULL,
	`started_at` integer NOT NULL,
	`heartbeat_at` integer NOT NULL,
	`current_job_id` text
);
