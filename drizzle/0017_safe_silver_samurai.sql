ALTER TABLE `wheels` ADD `sourceWheelId` int;--> statement-breakpoint
ALTER TABLE `wheels` ADD `areaLabel` varchar(64);--> statement-breakpoint
ALTER TABLE `wheels` ADD `listedInDirectory` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `wheels_source_idx` ON `wheels` (`sourceWheelId`);