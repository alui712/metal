ALTER TABLE `story_clips` ADD `layout` text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_clips` ADD `secondary_recording_id` text REFERENCES recordings(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `story_clips` ADD `secondary_in_ms` integer;