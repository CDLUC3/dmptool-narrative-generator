import * as dotenv from 'dotenv';
import { Logger } from 'pino';
import express, { Response } from "express";
import { JwtPayload } from 'jsonwebtoken';
import cookieParser from "cookie-parser";
import { renderCSV } from "./csv";
import { renderHTML } from "./html";
import { renderPDF } from "./pdf";
import { renderDOCX } from "./docx";
import { renderTXT } from "./txt";
import { initLogger, logger, prepareObjectForLogs } from "./logger";
import {
  safeNumber,
  safeBoolean,
  pointsToFontSize,
  getFontFamily
} from "./helper";
import { expressjwt, Request } from "express-jwt";
import { getDMP } from "./dynamo";
import { MySQLConnection } from "./mysql";

dotenv.config();

const CSV_TYPE = "text/csv";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const HTML_TYPE = "text/html";
const JSON_TYPE = "application/json";
const TXT_TYPE = "text/plain";
const PDF_TYPE = "application/pdf";

// ---------------- Interfaces for formatting options ----------------
export interface MarginInterface {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

export interface FontInterface {
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
}

export interface DisplayOptionsInterface {
  includeCoverPage: boolean;
  includeSectionHeadings: boolean;
  includeQuestionText: boolean;
  includeUnansweredQuestions: boolean;
  includeResearchOutputs: boolean;
  includeRelatedWorks: boolean;
}

interface OptionsInterface {
  version: string | null;
  display: DisplayOptionsInterface;
  margin: MarginInterface;
  font: FontInterface;
}

// ---------------- A DMP id and the user's access level ----------------
export interface UserDMPInterface {
  dmpId: string,
  accessLevel: string,
}

// ---------------- JSON Web Token ----------------
export interface JWTAccessToken extends JwtPayload {
  id: number,
  email: string,
  givenName: string,
  surName: string,
  role: string,
  affiliationId: string,
  languageId: string,
  jti: string,
  expiresIn: number,
}

// ---------------- Convert query params into options ----------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareOptions(params: any): OptionsInterface {
  return {
    version: params?.version,
    display: {
      includeCoverPage: safeBoolean(params?.includeCoverPage as string, true),
      includeSectionHeadings: safeBoolean(params?.includeSectionHeadings as string, true),
      includeQuestionText: safeBoolean(params?.includeQuestionText as string, true),
      includeUnansweredQuestions: safeBoolean(params?.includeUnansweredQuestions as string, true),
      includeResearchOutputs: safeBoolean(params?.includeResearchOutputs as string, true),
      includeRelatedWorks: safeBoolean(params?.includeRelatedWorks as string, true),
    },
    margin : {
      marginTop: safeNumber(params?.marginTop as string, 76),
      marginRight: safeNumber(params?.marginRight as string, 96),
      marginBottom: safeNumber(params?.marginBottom as string, 76),
      marginLeft: safeNumber(params?.marginLeft as string, 96),
    },
    font: {
      fontFamily: getFontFamily(params?.fontFamily as string),
      fontSize: pointsToFontSize(safeNumber(params?.fontSize as string, 11)),
      lineHeight: safeNumber(params?.lineHeight as string, 120),
    }
  }
}

// ---------------- Middleware to fetch the JWT ----------------
const auth = expressjwt({
  algorithms: ['HS256'],
  credentialsRequired: false,
  secret: process.env.JWT_SECRET ?? "secret",

  // Fetch the access token from the cookie
  getToken: function fromCookie(req) {
    if (req.cookies?.dmspt) {
      return req.cookies?.dmspt?.toString();
    }

    const headerCookie = req.headers.cookie;
    if (headerCookie) {
      const parts = headerCookie.split('=');
      return parts[0] === 'dmspt' ? parts[1] : undefined;
    }
  },
});

// ---------------- Authorization check ----------------
function hasPermissionToDownloadNarrative(
  // TODO: Update this to use the type once @dmptool/types supports the common standard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  userDMPs: UserDMPInterface[],
  token: JWTAccessToken | null
): boolean {
  const affiliations = [data.contact?.dmproadmap_affiliation?.affiliation_id?.identifier];

  // Now collect all the contributors
  if (Array.isArray(data.contributor)) {
    affiliations.push(...data.contributor.map(c => c?.dmproadmap_affiliation?.affiliation_id?.identifier));
  }

  // Narrative downloads are always available for public DMPs
  return data.dmproadmap_privacy === "public"
    // SuperAdmins can always access DMP narratives
    || token?.role === "SUPERADMIN"
    // Admins can always access DMP narratives for DMPs that belong to their affiliation
    || (token?.role === "ADMIN" && affiliations.includes(token?.affiliationId))
    // Researchers can access the narrative if the DMP is one associated with their token
    || userDMPs?.some(d => d.dmpId === data?.dmp_id?.identifier);
}

// ----------------- Process the incoming Accept types  -----------------
function processAccept(accept: string): string[] {
  // The accept header may contain a lot of info and several types
  //   e.g. text/html,application/xhtml+xml,application/xml;q=0.9,*/*;v=b3;q=0.7
  const rawTypes = accept ? accept.split(";")[0] : "";
  return rawTypes.split(",");
}

// ----------------- Initialize the server  -----------------
const sqlDataSource = new MySQLConnection();
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// ----------------- Main entrypoint to fetch a DMP narrative  -----------------
// Matches patterns like:
//   /dmps/11.11111/A1B2C3/narrative
//   /dmps/doi.org/11.12345/JHHG5646jhvh/narrative
app.get("/dmps/{*splat}/narrative{.:ext}", auth, async (req: Request, res: Response) => {
  // Generate a unique requestId that we can use to tie log messages together
  const requestId: string = [...Array(12)].map(() => {
    return Math.floor(Math.random() * 16).toString(16)
  }).join('');

  // Get the format the user wants the narrative document in from either
  // the specified file extension OR the Accept header
  let accept: string;
  if (req.params.ext) {
    // Map extension to mime type
    switch (req.params.ext.toLowerCase()) {
      case "csv":
        accept = CSV_TYPE;
        break;
      case "docx":
        accept = DOCX_TYPE;
        break;
      case "json":
        accept = JSON_TYPE;
        break;
      case "pdf":
        accept = PDF_TYPE;
        break;
      case "txt":
        accept = TXT_TYPE;
        break;
      default:
        accept = HTML_TYPE; // fallback
    }
  } else {
    accept = req.headers["accept"] || HTML_TYPE;
  }

  // Get the query params or use defaults
  const { version, display, margin, font } = prepareOptions(req.query);
  // Get the JWT if there is one
  const token = req.auth as JWTAccessToken
  // Get the DMP id from the path
  const dmpId = req.params.splat.toString().replace(",", "/");

  const requestLogger: Logger = initLogger(
    logger,                         // Base logger
    {
      app: process.env.APP_NAME,    // Help identify entries for this application
      env: process.env.ENV,         // The current environment (not necessarily the Node env)
      requestId,                    // Unique id for the incoming GraphQL request
      jti: token?.jti,              // The id of the JWT
      userId: token?.id,            // The current user's id
    }
  );

  requestLogger.info(
    prepareObjectForLogs({
      dmpId,
      version,
      format: accept,
      display,
      margin,
      font,
      allowedDMPs: token?.dmpIds ?? []
    }),
    `Received request for DMP narrative`
  );

  try {
    // Fetch the DMP's JSON from the DynamoDB Table
    const data = await getDMP(requestLogger, dmpId, version);
    // Fetch the list of DMPs the user has access to
    const userDMPs = await sqlDataSource.getUserDMPs(requestLogger, token);

    // Determine if the caller has permission to view the DMP's narrative
    const hasPermission = hasPermissionToDownloadNarrative(data, userDMPs, token);

    requestLogger.debug(data, "Retrieved DMP metadata file");

    if (!hasPermission) {
      requestLogger.warn("caller did not have permission to download narrative");
    }

    if (data && hasPermission) {
      const acceptedTypes = processAccept(accept);
      if (acceptedTypes.includes(CSV_TYPE)) {
        const csv = renderCSV(display, data);
        requestLogger.debug("Generating CSV");
        res.type("csv").send(csv);
        return;

      } else if (acceptedTypes.includes(DOCX_TYPE)) {
        const html = renderHTML(display, margin, font, data);
        // Render the html first. This will be used to generate the DOCX
        const docx = await renderDOCX(
          requestLogger,
          data?.title || "Data management plan",
          html,
          margin,
          font
        );
        requestLogger.debug("Generating DOCX");
        res.setHeader("Content-Type", DOCX_TYPE);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${(data.title || "document").replace(/\W+/g, "-")}.docx"`
        );
        res.send(docx);
        return;

      } else if (acceptedTypes.includes(HTML_TYPE)) {
        const html = renderHTML(display, margin, font, data);
        requestLogger.debug("Generating HTML");
        res.type("html").send(html);
        return;

      } else if (acceptedTypes.includes(JSON_TYPE)) {
        requestLogger.debug("Generating JSON");
        res.type("json").send(data);
        return;

      } else if (acceptedTypes.includes(PDF_TYPE)) {
        // Render the HTML first which is then used to render the PDF
        const pdf = await renderPDF(renderHTML(display, margin, font, data));
        requestLogger.debug("Generating PDF");
        res.setHeader("Content-Type", PDF_TYPE);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${(data.title || "document").replace(/\W+/g, "-")}.pdf"`
        );
        res.send(pdf);
        return;

      } else if (acceptedTypes.includes(TXT_TYPE)) {
        // Render the HTML first which is then used to render the TXT
        const txt = await renderTXT(renderHTML(display, margin, font, data));
        requestLogger.debug("Generating TXT");
        res.type("txt").send(txt);
        return;

      } else {
        requestLogger.debug(`Unsupported format requested: ${accept}`);
        // The format requested is not supported!
        res.status(406)
          .send("Not Acceptable: Supported formats are HTML, PDF, CSV, DOCX, TXT");
      }
    } else {
      requestLogger.info("DMP not found or user did not have permission to download narrative");
      // The DMP id was not found or the user did not have permission
      res.status(404).send("DMP not found");
      return;
    }
  } catch (e) {
    requestLogger.error(e);
    res.status(500).json({ error: "Document generation failed" });
  }
});

// ----------------- ALB Healthcheck -----------------
app.get("/narrative-health", (_: Request, res: Response) => res.send("ok"));

// ----------------- Startup the server  -----------------
const startServer = async () => {
  await sqlDataSource.initPromise;
  const PORT = process.env.PORT || 3030;
  app.listen(PORT, () => console.log(`${process.env.APP_NAME} listening on port ${PORT}`));
}

// Graceful shutdown
const shutdown = async () => {
  try {
    await sqlDataSource.close();
    process.exit(0);
  } catch (error) {
    console.log('Error shutting down server:', error);
    process.exit(1);
  }
};

if (!process.listeners('SIGINT').includes(shutdown)) {
  process.on('SIGINT', shutdown);
}
if (!process.listeners('SIGTERM').includes(shutdown)) {
  process.on('SIGTERM', shutdown);
}

// only start listening if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    console.log('Error starting server:', error)
    process.exit(1);
  });
}

export default app;
