import { describe, expect, it } from "vitest";
import { describeShape, parseDbUrl } from "./dbUrl.mjs";

const HOST = "gateway01.ap-northeast-1.prod.aws.tidbcloud.com";

describe("parseDbUrl — what a person actually pastes", () => {
  it("reads a plain TiDB URL, ignoring its ?ssl= options", () => {
    const p = parseDbUrl(`mysql://abc.root:s3cret@${HOST}:4000/lunch?ssl={"minVersion":"TLSv1.2"}`);
    expect(p).toEqual({ user: "abc.root", password: "s3cret", host: HOST, port: 4000, database: "lunch" });
  });

  it("strips the quotes left over from a shell command", () => {
    for (const q of [`"`, `'`]) {
      expect(parseDbUrl(`${q}mysql://u:p@${HOST}:4000/lunch${q}`)?.password).toBe("p");
    }
  });

  it("strips a pasted DATABASE_URL= prefix, export included", () => {
    expect(parseDbUrl(`DATABASE_URL=mysql://u:p@${HOST}:4000/lunch`)?.host).toBe(HOST);
    expect(parseDbUrl(`export DATABASE_URL="mysql://u:p@${HOST}:4000/lunch"`)?.host).toBe(HOST);
  });

  it("keeps a password with / @ # ? in it whole — the standard URL parser cannot", () => {
    const p = parseDbUrl(`mysql://u:a/b@c#d?e@${HOST}:4000/lunch`);
    expect(p).toMatchObject({ user: "u", password: "a/b@c#d?e", host: HOST, database: "lunch" });
  });

  it("decodes a percent-encoded password, and leaves a literal % alone", () => {
    expect(parseDbUrl(`mysql://u:a%2Fb@${HOST}:4000/lunch`)?.password).toBe("a/b");
    expect(parseDbUrl(`mysql://u:100%@${HOST}:4000/lunch`)?.password).toBe("100%");
  });

  it("defaults the port", () => {
    expect(parseDbUrl(`mysql://u:p@${HOST}/lunch`)?.port).toBe(4000);
    expect(parseDbUrl(`mysql://u:p@localhost/lunch`)?.port).toBe(3306);
  });

  it("returns null for things that are not a database URL", () => {
    for (const bad of ["", "not a url", "https://vercel.com/x", `mysql://${HOST}:4000/lunch`, `mysql://u:p@${HOST}:4000`]) {
      expect(parseDbUrl(bad)).toBeNull();
    }
  });
});

describe("describeShape — enough to debug a paste, never the secret", () => {
  it("names the quote, the prefix and the host but not the user or password", () => {
    const s = describeShape(`"DATABASE_URL=mysql://someuser:hunter2@${HOST}:4000/lunch"`);
    expect(s).toContain("quoted");
    expect(s).toContain(HOST);
    expect(s).not.toContain("hunter2");
    expect(s).not.toContain("someuser");
  });
});
