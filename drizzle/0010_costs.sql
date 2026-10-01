CREATE TABLE `costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`provider` text,
	`collector` text NOT NULL,
	`product_id` text,
	`units` integer NOT NULL,
	`amount_micro_aud` integer NOT NULL,
	`job_id` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "costs_status" CHECK("costs"."status" IN ('reserved', 'recorded')),
	CONSTRAINT "costs_provider" CHECK("costs"."status" = 'reserved' OR "costs"."provider" IS NOT NULL),
	CONSTRAINT "costs_units" CHECK("costs"."units" >= 0),
	CONSTRAINT "costs_amount" CHECK("costs"."amount_micro_aud" BETWEEN 0 AND 100000000)
);
--> statement-breakpoint
CREATE INDEX `costs_created` ON `costs` (`created_at`);