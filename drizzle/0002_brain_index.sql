CREATE TABLE `brain_docs` (
	`path` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`mtime` integer NOT NULL,
	`content_hash` text NOT NULL,
	`last_viewed_at` integer
);
--> statement-breakpoint
CREATE TABLE `brain_links` (
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	PRIMARY KEY(`from_path`, `to_path`)
);
