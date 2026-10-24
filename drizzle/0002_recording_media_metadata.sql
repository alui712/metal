ALTER TABLE `recordings` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `container` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `video_codec` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `audio_codec` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_content_hash_idx` ON `recordings` (`content_hash`);