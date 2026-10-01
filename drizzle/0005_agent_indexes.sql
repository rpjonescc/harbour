CREATE INDEX `agent_run_events_job_id` ON `agent_run_events` (`job_id`,`id`);--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_dedupe_key` ON `jobs` (`dedupe_key`);