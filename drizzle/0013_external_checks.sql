CREATE TABLE `external_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`checked_at` integer NOT NULL,
	`value` text NOT NULL,
	`scan_id` integer,
	`job_id` integer,
	CONSTRAINT "external_checks_kind" CHECK("external_checks"."kind" IN ('backlinks', 'serp_rank', 'ai_answer')),
	CONSTRAINT "external_checks_subject" CHECK(length("external_checks"."subject") BETWEEN 1 AND 200),
	CONSTRAINT "external_checks_value" CHECK(length("external_checks"."value") <= 4096)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_checks_unique` ON `external_checks` (`product_id`,`kind`,`subject`,`checked_at`);--> statement-breakpoint
CREATE INDEX `external_checks_lookup` ON `external_checks` (`product_id`,`kind`,`subject`,"checked_at" desc);