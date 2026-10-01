CREATE TABLE `agent_run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`prompt_version` text NOT NULL,
	`exit_code` integer,
	`files_changed` text,
	`commit_sha` text,
	`pushed` integer,
	`stdout_tail` text,
	`stderr_tail` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`params` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`heartbeat_at` integer,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`key` text NOT NULL,
	`why` text NOT NULL,
	`status` text NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	`source_job_id` integer,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_product_type_key` ON `proposals` (`product_id`,`type`,`key`);