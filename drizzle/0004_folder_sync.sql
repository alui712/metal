CREATE TABLE `folder_files` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`rel_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mtime_ms` real NOT NULL,
	`changed_at` integer NOT NULL,
	`present` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`recording_id` text,
	`job_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `watched_folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_files_path_idx` ON `folder_files` (`folder_id`,`rel_path`);--> statement-breakpoint
CREATE INDEX `folder_files_status_idx` ON `folder_files` (`folder_id`,`status`);--> statement-breakpoint
CREATE TABLE `watched_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`path` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`last_scan_at` integer,
	`rescan_requested_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watched_folders_path_idx` ON `watched_folders` (`path`);--> statement-breakpoint
ALTER TABLE `capture_state` ADD `record_directory` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `source_path` text;--> statement-breakpoint
CREATE INDEX `recordings_source_path_idx` ON `recordings` (`source_path`);