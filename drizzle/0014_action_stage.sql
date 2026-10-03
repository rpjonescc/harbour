ALTER TABLE `action_events` ADD `from_stage` text;--> statement-breakpoint
ALTER TABLE `action_events` ADD `to_stage` text;--> statement-breakpoint
ALTER TABLE `actions` ADD `stage` text;