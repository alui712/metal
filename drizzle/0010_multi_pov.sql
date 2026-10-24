CREATE TABLE `pov_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pov_matches` (
	`recording_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`audio` text NOT NULL,
	`offset_ms` integer,
	`score` real,
	`distinct` real,
	`overlap_ms` integer,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`recording_id`, `candidate_id`),
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pov_members` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`offset_ms` integer NOT NULL,
	`sync_source` text NOT NULL,
	`sync_confirmed` integer DEFAULT false NOT NULL,
	`audio_score` real,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `pov_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pov_members_group_idx` ON `pov_members` (`group_id`);