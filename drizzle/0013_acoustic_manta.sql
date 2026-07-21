CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wheelId` int NOT NULL,
	`spinId` int NOT NULL,
	`restaurantId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `spin_history` ADD `accepted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastReadNotificationAt` timestamp;--> statement-breakpoint
-- Preserve existing exclusions: before ACCEPT existed, every recorded spin
-- excluded its restaurant for the full window. Treat all history as accepted so
-- the two-tier rule doesn't silently un-exclude recently-eaten places on deploy.
UPDATE `spin_history` SET `accepted` = true;