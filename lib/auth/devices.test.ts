import { passkeys } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { listDevices, removeDevice, uniqueDeviceLabel } from "./devices";
import { createSession, validateSession } from "./sessions";

const t0 = new Date("2026-10-01T00:00:00Z");

function seed() {
  const db = openTestDb();
  const row = {
    publicKey: Buffer.from([1]),
    counter: 0,
    transports: null,
    createdAt: t0,
    lastUsedAt: null,
  };
  db.insert(passkeys)
    .values([
      { ...row, id: "a", login: "owner@example.com", deviceLabel: "Laptop" },
      { ...row, id: "b", login: "owner@example.com", deviceLabel: "Phone" },
      { ...row, id: "c", login: "other@example.com", deviceLabel: "Theirs" },
    ])
    .run();
  return db;
}

describe("devices", () => {
  it("marks the passkey behind the current session", () => {
    const devices = listDevices(seed(), "owner@example.com", "a");
    expect(devices.find((d) => d.id === "a")?.current).toBe(true);
    expect(devices.find((d) => d.id === "b")?.current).toBe(false);
  });

  it("lists only the signed-in login's passkeys", () => {
    expect(
      listDevices(seed(), "owner@example.com")
        .map((d) => d.deviceLabel)
        .sort(),
    ).toEqual(["Laptop", "Phone"]);
  });

  it("removes a passkey owned by the login", () => {
    const db = seed();
    expect(removeDevice(db, "owner@example.com", "a")).toBe(true);
    expect(listDevices(db, "owner@example.com").map((d) => d.id)).toEqual(["b"]);
  });

  it("cannot remove another login's passkey", () => {
    const db = seed();
    expect(removeDevice(db, "owner@example.com", "c")).toBe(false);
    expect(listDevices(db, "other@example.com")).toHaveLength(1);
  });

  it("revokes the sessions signed in with the removed passkey only", () => {
    const db = seed();
    const viaA = createSession(db, "owner@example.com", "a", t0);
    const viaB = createSession(db, "owner@example.com", "b", t0);
    expect(removeDevice(db, "owner@example.com", "a")).toBe(true);
    expect(validateSession(db, viaA.token, "owner@example.com", t0)).toBeNull();
    expect(validateSession(db, viaB.token, "owner@example.com", t0)).not.toBeNull();
  });
});

describe("uniqueDeviceLabel", () => {
  it("keeps a new name and suffixes a taken one", () => {
    expect(uniqueDeviceLabel(["Laptop"], "Phone")).toBe("Phone");
    expect(uniqueDeviceLabel(["Laptop"], "laptop ")).toBe("laptop 2");
    expect(uniqueDeviceLabel(["Laptop", "Laptop 2"], "Laptop")).toBe("Laptop 3");
  });
});
