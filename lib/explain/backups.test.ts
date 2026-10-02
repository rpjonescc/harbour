import { BACKUP_HEALTH_LABEL, CANT_OPEN_BACKUP_FOLDER } from "./backups";

describe("backup words", () => {
  it("has a plain label for every health state", () => {
    expect(Object.keys(BACKUP_HEALTH_LABEL).sort()).toEqual(
      ["failed", "none-yet", "off", "ok", "stale", "unreadable"].sort(),
    );
  });

  it("says one thing about an unreadable folder", () => {
    expect(CANT_OPEN_BACKUP_FOLDER).toBe("Harbour can't open the backup folder");
    expect(BACKUP_HEALTH_LABEL.unreadable).toBe("Can't open the backup folder");
  });
});
