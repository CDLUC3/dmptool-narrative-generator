import request from "supertest";

jest.mock("../dynamo", () => ({
  getDMP: jest.fn()
}));
jest.mock("../csv", () => ({
  renderCSV: jest.fn(() => "csv-data")
}));
jest.mock("../docx", () => ({
  renderDOCX: jest.fn(() => Buffer.from("docx"))
}));
jest.mock("../pdf", () => ({
  renderPDF: jest.fn(() => Buffer.from("pdf"))
}));
jest.mock("../txt", () => ({
  renderTXT: jest.fn(() => "txt-data")
}));
jest.mock("../html", () => ({
  renderHTML: jest.fn(() => "<html>content</html>")
}));
jest.mock("../logger", () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  initLogger: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  prepareObjectForLogs: jest.fn(o => o)
}));

import { getDMP } from"../dynamo";
import { renderCSV } from "../csv";
import { renderDOCX } from "../docx";
import { renderHTML } from "../html";
import { renderPDF } from "../pdf";
import { renderTXT } from "../txt";

import app, { JWTAccessToken } from "../server";
import { mockToken } from "./setup"; // ensure the file does `export default app;`

const baseTokenParams: JWTAccessToken = {
  id: 123,
  givenName: "Tester",
  surName: "Person",
  email: "tester@example.com",
  affiliationId: "https://ror.org/test",
  role: "RESEARCHER",
  languageId: "en-US",
  jti: "83yt89u3y5t93ut",
  expiresIn: 123456789,
  dmpIds: []
}

let fakeToken: any = {};

jest.mock("express-jwt", () => {
  return {
    expressjwt: jest.fn(() => {
      return (req, _res, next) => {
        req.auth = fakeToken;
        next();
      };
    })
  };
});

describe("server endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      title: "Test DMP",
      dmproadmap_privacy: "public"
    });

    fakeToken = undefined;
  });

  it("health endpoint returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });

  it("defaults to PDF when no Accept header is provided", async () => {
    const res = await request(app).get("/dmps/foo/narrative");
    expect(renderHTML).toHaveBeenCalled();
    expect(renderPDF).toHaveBeenCalled();
    expect(res.header["content-type"]).toContain("application/pdf");
  });

  it("applies query params via prepareOptions indirectly", async () => {
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .query({ includeCoverPage: false, marginTop: 12, fontSize: 14 })
      .set("Accept", "text/html");
    expect(renderHTML).toHaveBeenCalledWith(
      expect.objectContaining({ includeCoverPage: false }),
      expect.objectContaining({ marginTop: 12 }),
      expect.objectContaining({ fontSize: "19px" }),
      expect.any(Object)
    );
    expect(res.status).toBe(200);
  });

  it("returns CSV", async () => {
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/csv");
    expect(renderCSV).toHaveBeenCalled();
    expect(res.type).toMatch(/csv/);
    expect(res.text).toBe("csv-data");
  });

  it("returns DOCX", async () => {
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(renderDOCX).toHaveBeenCalled();
    expect(res.header["content-type"]).toContain("application/vnd.openxmlformats");
  });

  it("returns HTML", async () => {
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(renderHTML).toHaveBeenCalled();
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("<html>");
  });

  it("returns TXT", async () => {
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/plain");
    expect(renderTXT).toHaveBeenCalled();
    expect(res.type).toMatch(/plain/);
    expect(res.text).toBe("txt-data");
  });

  it("returns 406 for unsupported format", async () => {
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "application/unknown");
    expect(res.status).toBe(406);
  });

  it("returns HTML if token is for a SUPERADMIN (private DMP", async () => {
    fakeToken = mockToken({
      ...baseTokenParams,
      role: "SUPERADMIN"
    });
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      dmproadmap_privacy: "private"
    });
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(renderHTML).toHaveBeenCalled();
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("<html>");
  });

  it("returns HTML if token is for a ADMIN of same affiliation (private DMP", async () => {
    fakeToken = mockToken({
      ...baseTokenParams,
      role: "ADMIN"
    });
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      dmproadmap_privacy: "private",
      contact: {
        dmproadmap_affiliation: {
          affiliation_id: {
            identifier: fakeToken.affiliationId
          }
        }
      }
    });
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(renderHTML).toHaveBeenCalled();
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("<html>");
  });

  it("returns HTML if token is for a RESEARCHER who has access (private DMP", async () => {
    fakeToken = mockToken({
      ...baseTokenParams,
      role: "RESEARCHER",
      dmpIds: [{ dmpId: "d1", accessLevel: "EDIT" }]
    });
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      dmproadmap_privacy: "private"
    });
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(renderHTML).toHaveBeenCalled();
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("<html>");
  });

  it("returns 404 if no token (private DMP)", async () => {
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      dmproadmap_privacy: "private"
    });
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(res.status).toBe(404);
  });

  it("returns 404 if token is for an ADMIN but the wrong affiliation (private DMP)", async () => {
    fakeToken = mockToken(baseTokenParams);
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      dmproadmap_privacy: "private",
      contact: {
        dmproadmap_affiliation: {
          affiliation_id: {
            identifier: "https://ror.org/otherTest"
          }
        }
      }
    });
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(res.status).toBe(404);
  });

  it("returns 404 if token does not contain DMP id (private DMP)", async () => {
    fakeToken = mockToken({
      ...baseTokenParams,
      dmpIds: [{ dmpId: "a1", accessLevel: "OWN" }]
    });
    (getDMP as jest.Mock).mockResolvedValue({
      dmp_id: { identifier: "d1" },
      dmproadmap_privacy: "private"
    });
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(res.status).toBe(404);
  });

  it("returns 500 on error from getDMP", async () => {
    (getDMP as jest.Mock).mockRejectedValue(new Error("boom"));
    const res = await request(app)
      .get("/dmps/foo/narrative")
      .set("Accept", "text/html");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Document generation failed");
  });
});
