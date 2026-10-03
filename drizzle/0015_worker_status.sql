CREATE TABLE `worker_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`beat_at` integer NOT NULL,
	`started_at` integer,
	CONSTRAINT "worker_status_single_row" CHECK("worker_status"."id" = 1)
);
