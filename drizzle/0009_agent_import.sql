ALTER TABLE `agent_runs` ADD `imported_at` integer;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `import_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Runs committed before import tracking were imported in the same run: never retry them.
UPDATE `agent_runs` SET `imported_at` = (SELECT coalesce(`finished_at`, `started_at`, `created_at`) FROM `jobs` WHERE `jobs`.`id` = `agent_runs`.`job_id`) WHERE `commit_sha` IS NOT NULL;
