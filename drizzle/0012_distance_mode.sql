ALTER TABLE `restaurants` ADD `walkSeconds` int;--> statement-breakpoint
ALTER TABLE `wheels` ADD `distanceEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `wheels` ADD `originLat` decimal(9,6);--> statement-breakpoint
ALTER TABLE `wheels` ADD `originLng` decimal(9,6);--> statement-breakpoint
ALTER TABLE `wheels` ADD `originLabel` varchar(64) DEFAULT 'Office';