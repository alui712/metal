CREATE TABLE `recording_transcripts` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`error` text,
	`job_id` text,
	`model` text,
	`language` text,
	`has_audio` integer,
	`segment_count` integer,
	`voiced_ms` integer,
	`ai_output_id` text,
	`requested_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_output_id`) REFERENCES `ai_outputs`(`id`) ON UPDATE no action ON DELETE set null
);
