CREATE TABLE `action_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action_id` integer NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `action_events_action` ON `action_events` (`action_id`,`id`);--> statement-breakpoint
CREATE TABLE `actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`area` text NOT NULL,
	`title` text NOT NULL,
	`why` text NOT NULL,
	`fix` text NOT NULL,
	`check` text NOT NULL,
	`impact` text NOT NULL,
	`effort` text NOT NULL,
	`evidence` text NOT NULL,
	`docs` text NOT NULL,
	`source` text NOT NULL,
	`rule_key` text,
	`source_job_id` integer,
	`title_key` text NOT NULL,
	`status` text NOT NULL,
	`snoozed_until` text,
	`issue_present` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status_changed_at` integer NOT NULL,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "actions_rule_source" CHECK(("actions"."source" = 'rule') = ("actions"."rule_key" IS NOT NULL)),
	CONSTRAINT "actions_snooze" CHECK(("actions"."status" = 'snoozed') = ("actions"."snoozed_until" IS NOT NULL)),
	CONSTRAINT "actions_agent_job" CHECK(("actions"."source" = 'agent') = ("actions"."source_job_id" IS NOT NULL)),
	CONSTRAINT "actions_issue_present" CHECK("actions"."source" = 'rule' OR "actions"."issue_present" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_product_rule` ON `actions` (`product_id`,`rule_key`) WHERE "actions"."rule_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `actions_status` ON `actions` (`status`,`product_id`);--> statement-breakpoint
CREATE INDEX `actions_product_title` ON `actions` (`product_id`,`title_key`);