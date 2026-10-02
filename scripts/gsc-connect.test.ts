import { parseConnectArgs } from "./gsc-connect";

const HOME = "/srv/owner";
const present = (paths: string[]) => (path: string) => paths.includes(path);

describe("parseConnectArgs", () => {
  it("defaults to the client and credentials files in ~/harbour-data", () => {
    expect(
      parseConnectArgs([], HOME, present(["/srv/owner/harbour-data/gsc-client.json"])),
    ).toEqual({
      clientPath: "/srv/owner/harbour-data/gsc-client.json",
      outPath: "/srv/owner/harbour-data/gsc.json",
      force: false,
    });
  });

  it("asks for --client when the default client file is absent", () => {
    expect(() => parseConnectArgs([], HOME, present([]))).toThrow(/--client/);
  });

  it("takes --client, --out and --force, expanding ~ and making paths absolute", () => {
    const args = ["--client", "~/Downloads/client.json", "--out=creds/gsc.json", "--force"];
    expect(parseConnectArgs(args, HOME, present([]))).toEqual({
      clientPath: "/srv/owner/Downloads/client.json",
      outPath: `${process.cwd()}/creds/gsc.json`,
      force: true,
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseConnectArgs(["--scope", "x"], HOME, present([]))).toThrow();
  });
});
