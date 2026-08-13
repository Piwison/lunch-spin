CREATE TABLE `restaurant_ratings` (
	`restaurantId` int NOT NULL,
	`userId` int NOT NULL,
	`stars` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_ratings_restaurantId_userId_pk` PRIMARY KEY(`restaurantId`,`userId`)
);
--> statement-breakpoint
-- Backfill from the legacy per-spin ratings: for each (restaurant, member) take
-- their most recent rated spin and seed a star rating (loved->5, ok->3, never->1),
-- so the star system isn't empty on day one. INSERT IGNORE is safe on re-run and
-- reads spin_history only; it writes the new table only (never mutates history).
INSERT IGNORE INTO `restaurant_ratings` (`restaurantId`, `userId`, `stars`, `updatedAt`)
SELECT sh.`restaurantId`, sh.`spunBy`,
       CASE sh.`rating` WHEN 'loved' THEN 5 WHEN 'ok' THEN 3 WHEN 'never' THEN 1 ELSE 3 END,
       sh.`spunAt`
FROM `spin_history` sh
JOIN (
  SELECT `restaurantId`, `spunBy`, MAX(`id`) AS maxId
  FROM `spin_history`
  WHERE `rating` IS NOT NULL
  GROUP BY `restaurantId`, `spunBy`
) latest ON latest.maxId = sh.`id`;
