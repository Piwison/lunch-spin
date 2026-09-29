CREATE TABLE `user_dietary` (
	`userId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_dietary_userId_tagId_pk` PRIMARY KEY(`userId`,`tagId`)
);
--> statement-breakpoint
ALTER TABLE `restaurants` ADD `googleRating` decimal(2,1);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `googleRatingCount` int;--> statement-breakpoint
ALTER TABLE `round_marks` ADD `createdAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `spin_history` ADD `skipped` boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT IGNORE INTO `user_dietary` (`userId`, `tagId`) SELECT DISTINCT `userId`, `refId` FROM `round_marks` WHERE `kind` = 'dietary';