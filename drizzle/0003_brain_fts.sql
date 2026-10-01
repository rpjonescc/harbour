CREATE VIRTUAL TABLE `brain_fts` USING fts5(path UNINDEXED, title, body, tokenize = 'porter unicode61');
