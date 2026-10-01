CREATE TABLE `collector_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer NOT NULL,
	`collector` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`items` integer,
	FOREIGN KEY (`scan_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collector_runs_scan` ON `collector_runs` (`scan_id`);--> statement-breakpoint
CREATE INDEX `collector_runs_collector` ON `collector_runs` (`collector`,`status`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer NOT NULL,
	`collector` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `observations_scan_collector_kind` ON `observations` (`scan_id`,`collector`,`kind`);--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`job_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scan_runs_product` ON `scan_runs` (`product_id`,`id`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer NOT NULL,
	`product_id` text NOT NULL,
	`computed_at` integer NOT NULL,
	`formula_version` text NOT NULL,
	`seo` integer,
	`geo` integer,
	`aeo` integer,
	`complete` text NOT NULL,
	`breakdown` text NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "scores_seo_range" CHECK("scores"."seo" IS NULL OR "scores"."seo" BETWEEN 0 AND 100),
	CONSTRAINT "scores_geo_range" CHECK("scores"."geo" IS NULL OR "scores"."geo" BETWEEN 0 AND 100),
	CONSTRAINT "scores_aeo_range" CHECK("scores"."aeo" IS NULL OR "scores"."aeo" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_scan_id_unique` ON `scores` (`scan_id`);--> statement-breakpoint
CREATE INDEX `scores_product` ON `scores` (`product_id`,`computed_at`);