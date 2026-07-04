ALTER TABLE `restaurants` ADD `placeId` varchar(256);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `lat` decimal(9,6);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `lng` decimal(9,6);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `address` varchar(512);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `priceLevel` int;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `cuisine` varchar(64);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `openHours` json;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `source` enum('provider','user') DEFAULT 'user' NOT NULL;
