-- Keyword index over retrieval chunks (external-content FTS5, kept in sync by triggers).
CREATE VIRTUAL TABLE `chunks_fts` USING fts5(
  `text`,
  content='chunks',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `chunks_ai` AFTER INSERT ON `chunks` BEGIN
  INSERT INTO `chunks_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `chunks_ad` AFTER DELETE ON `chunks` BEGIN
  INSERT INTO `chunks_fts`(`chunks_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `chunks_au` AFTER UPDATE OF `text` ON `chunks` BEGIN
  INSERT INTO `chunks_fts`(`chunks_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
  INSERT INTO `chunks_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
