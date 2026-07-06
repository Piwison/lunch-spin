-- Seed the predefined (system) tag catalog: wheelId NULL + createdBy NULL rows
-- that getTagsForWheel serves to every wheel. The schema and UI always assumed
-- these existed ("cuisine" / "food_type" groups, createdBy NULL = predefined),
-- but nothing ever seeded them — so Smart Add's cuisine mapping, the
-- rotate-cuisines wheel setting, and cuisine filtering were dormant.
-- Names match shared/placeMapping.ts (provider types → labels) and
-- shared/parseAddList.ts (keyword guesses) exactly; colors come from the
-- designed segment palette (client/src/lib/palette.ts) so a tag's chip and its
-- wheel segment share one language. Each insert is guarded by NOT EXISTS so
-- re-running (or a hand-seeded DB) never duplicates.
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Japanese', 'cuisine', '#e2674f', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Japanese' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Chinese', 'cuisine', '#e3893e', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Chinese' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Korean', 'cuisine', '#dcab4a', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Korean' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Thai', 'cuisine', '#8fb46b', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Thai' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Vietnamese', 'cuisine', '#5aa6a0', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Vietnamese' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Indian', 'cuisine', '#5f8fd4', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Indian' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Italian', 'cuisine', '#8b7fd6', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Italian' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Mexican', 'cuisine', '#b072c9', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Mexican' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'American', 'cuisine', '#d56fa3', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'American' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'French', 'cuisine', '#dd6f73', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'French' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Mediterranean', 'cuisine', '#e2674f', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Mediterranean' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Greek', 'cuisine', '#e3893e', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Greek' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Spanish', 'cuisine', '#dcab4a', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Spanish' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Turkish', 'cuisine', '#8fb46b', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Turkish' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Middle Eastern', 'cuisine', '#5aa6a0', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Middle Eastern' AND `category` = 'cuisine' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Pizza', 'food_type', '#e2674f', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Pizza' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Burgers', 'food_type', '#e3893e', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Burgers' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'BBQ', 'food_type', '#dd6f73', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'BBQ' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Seafood', 'food_type', '#5f8fd4', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Seafood' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Steakhouse', 'food_type', '#b072c9', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Steakhouse' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Sandwiches', 'food_type', '#dcab4a', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Sandwiches' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Fast Food', 'food_type', '#d56fa3', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Fast Food' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Breakfast', 'food_type', '#8fb46b', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Breakfast' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Brunch', 'food_type', '#5aa6a0', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Brunch' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Vegetarian', 'food_type', '#8fb46b', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Vegetarian' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Vegan', 'food_type', '#5aa6a0', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Vegan' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Noodles', 'food_type', '#5f8fd4', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Noodles' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Salad', 'food_type', '#8b7fd6', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Salad' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Dessert', 'food_type', '#d56fa3', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Dessert' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Cafe', 'food_type', '#dcab4a', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Cafe' AND `category` = 'food_type' AND `wheelId` IS NULL);--> statement-breakpoint
INSERT INTO `tags` (`name`, `category`, `color`, `createdBy`, `wheelId`)
SELECT 'Bakery', 'food_type', '#e3893e', NULL, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `tags` WHERE `name` = 'Bakery' AND `category` = 'food_type' AND `wheelId` IS NULL);
