import * as dotenv from 'dotenv';
import { Logger } from 'pino';
import express, { Response } from "express";
import { JWTAccessToken } from "./helper";
import cookieParser from "cookie-parser";
import { renderCSV } from "./csv";
import { renderHTML } from "./html";
import { renderPDF } from "./pdf";
import { renderDOCX } from "./docx";
import { renderTXT } from "./txt";
import {
  safeNumber,
  safeBoolean,
  pointsToFontSize,
  getFontFamily
} from "./helper";
import { expressjwt, Request } from "express-jwt";
import { DMPToolDMPType } from "@dmptool/types";
import {
  convertMySQLDateTimeToRFC3339,
  EnvironmentEnum,
  initializeLogger,
  LogLevelEnum,
} from "@dmptool/utils";
import {
  handleMissingMaDMP,
  hasPermissionToDownloadNarrative,
  loadMaDMPFromDynamo,
  loadPlan,
  loadPlansForUser,
  PlanInterface,
  UserPlanInterface
} from "./dataAccess";

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
  secret: process.env.JWT_SECRET || "secret",

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

// ----------------- Process the incoming Accept types  -----------------
function processAccept(accept: string): string[] {
  // The accept header may contain a lot of info and several types
  //   e.g. text/html,application/xhtml+xml,application/xml;q=0.9,*/*;v=b3;q=0.7
  const rawTypes = accept ? accept.split(";")[0] : "";
  return rawTypes.split(",");
}

// ----------------- Initialize the server  -----------------
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// ----------------- Main entrypoint to fetch a DMP narrative  -----------------
// Matches patterns like:
//   /dmps/11.11111/A1B2C3/narrative
//   /dmps/doi.org/11.12345/JHHG5646jhvh/narrative
app.get("/dmps/{*splat}/narrative{.:ext}", auth, async (req: Request, res: Response) => {
  // Process the environment variables
  const logLevel: LogLevelEnum = LogLevelEnum[process.env.LOG_LEVEL?.toUpperCase()] || LogLevelEnum.INFO;
  const env: EnvironmentEnum = EnvironmentEnum[process.env.ENV?.toUpperCase()] || EnvironmentEnum.DEV;
  const domainName = process.env.DOMAIN_NAME ?? "localhost:3000";
  const applicationName = process.env.APPLICATION_NAME ?? "dmptool";

  // Get the format the user wants the narrative document in from either
  // the specified file extension OR the Accept header
  let accept: string;
  if (req.params.ext && req.params.ext.length > 0) {
    switch (req.params.ext.toLowerCase()) {
      case "csv": accept = CSV_TYPE; break;
      case "docx": accept = DOCX_TYPE; break;
      case "json": accept = JSON_TYPE; break;
      case "pdf": accept = PDF_TYPE; break;
      case "txt": accept = TXT_TYPE; break;
      default: accept = HTML_TYPE;
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
  const fullDMPId = `${process.env.EZID_BASE_URL}/${dmpId}`;

  // Initialze the logger
  const requestLogger: Logger = initializeLogger('narrative-generator', logLevel);

  requestLogger.debug(
    {
      jti: token?.jti,
      userId: token?.id,
      dmpId,
      fullDMPId,
      version,
      format: accept,
      display,
      margin,
      font,
      allowedDMPs: token?.dmpIds ?? []
    },
    'Received request for DMP narrative'
  );

  try {
    const plan: PlanInterface = await loadPlan(requestLogger, fullDMPId, env);
    if (!plan) {
      requestLogger.warn({ dmpId, jti: token?.jti }, "No Plan found");
      // We return 404 here so that we're not signaling which DMP ids are valid
      res.status(404).send("Plan not found");
      return;
    }

    // Fetch all Plans that the current user has access to
    const usersPlans: UserPlanInterface[] = await loadPlansForUser(
      requestLogger,
      token,
      env
    );
    requestLogger.debug(
      { dmpId, planId: plan.id, nbrPlansForUser: usersPlans.length, jti: token?.jti },
      'Retrieved Plan data from RDS'
    );

    // Fetch the latest maDMP record for the Plan from the DynamoDB table
    let maDMP: DMPToolDMPType = await loadMaDMPFromDynamo(requestLogger, domainName, fullDMPId);
    requestLogger.debug(
      { dmpId, maDMPModified: maDMP?.dmp?.modified, jti: token?.jti },
      'Retrieved maDMP metadata from DynamoDB'
    );

    // Determine if the maDMP was missing or is out of date. If so, generate the
    // current maDMP and update the DynamoDB record.
    const rdsDate: string = convertMySQLDateTimeToRFC3339(plan?.modified);
    if (!maDMP || rdsDate !== maDMP?.dmp?.modified) {
      maDMP = await handleMissingMaDMP(
        requestLogger,
        env,
        applicationName,
        domainName,
        plan,
        rdsDate !== maDMP?.dmp?.modified
      )
    }

    // If the maDMP record could not be generated or retrieved, we need to bail out
    if (!maDMP || !maDMP.dmp) {
      requestLogger.warn({ dmpId, jti: token?.jti }, "Unable to generate narrative for DMP");
      res.status(500).send("Unable to generate a narrative at this time");
      return;
    }

    // Determine if the caller has permission to view the DMP's narrative
    const hasPermission = hasPermissionToDownloadNarrative(maDMP, usersPlans, token);
    if (!hasPermission) {
      requestLogger.warn({ dmpId, jti: token?.jti }, "User does not have permission to download narrative");
      // We return 404 here so that we're not signaling which DMP ids are valid
      res.status(404).send("DMP not found");
      return;
    }

    // Determine which format the user requested and render it accordingly.
    const acceptedTypes = processAccept(accept);
    if (acceptedTypes.includes(CSV_TYPE)) {
      const csv = renderCSV(display, maDMP.dmp);
      requestLogger.debug({ dmpId, jti: token?.jti }, "Generating CSV");
      res.type("csv").send(csv);
      return;

    } else if (acceptedTypes.includes(DOCX_TYPE)) {
      const html = renderHTML(display, margin, font, maDMP.dmp);
      // Render the HTML first. This will be used to generate the DOCX
      const docx = await renderDOCX(
        requestLogger,
        maDMP.dmp?.title || "Data management plan",
        html,
        margin,
        font
      );
      requestLogger.debug({ dmpId, jti: token?.jti }, "Generating DOCX");
      res.setHeader("Content-Type", DOCX_TYPE);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(maDMP.dmp?.title || "document").replace(/\W+/g, "-")}.docx"`
      );
      res.send(docx);
      return;

    } else if (acceptedTypes.includes(HTML_TYPE)) {
      const html = renderHTML(display, margin, font, maDMP.dmp);
      requestLogger.debug({ dmpId, jti: token?.jti }, "Generating HTML");
      res.type("html").send(html);
      return;

    } else if (acceptedTypes.includes(JSON_TYPE)) {
      requestLogger.debug({ dmpId, jti: token?.jti }, "Generating JSON");
      res.type("json").send(maDMP.dmp);
      return;

    } else if (acceptedTypes.includes(PDF_TYPE)) {
      // Render the HTML which is then used to render the PDF
      const pdf = await renderPDF(
        renderHTML(display, margin, font, maDMP.dmp)
      );
      requestLogger.debug({ dmpId, jti: token?.jti }, "Generating PDF");
      res.setHeader("Content-Type", PDF_TYPE);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${(maDMP.dmp.title || "document").replace(/\W+/g, "-")}.pdf"`
      );
      res.send(pdf);
      return;

    } else if (acceptedTypes.includes(TXT_TYPE)) {
      // Render the HTML first which is then used to render the TXT
      const txt = await renderTXT(
        renderHTML(display, margin, font, maDMP.dmp)
      );
      requestLogger.debug({ dmpId, jti: token?.jti }, "Generating TXT");
      res.type("txt").send(txt);
      return;

    } else {
      requestLogger.debug({ dmpId, jti: token?.jti }, `Unsupported format requested: ${accept}`);
      // The format requested is not supported!
      res.status(406)
        .send("Not Acceptable: Supported formats are HTML, PDF, CSV, DOCX, TXT");
    }

    // If it ends up here somehow return a 500
    res.status(500)
      .send("Unable to process your request at this time.");
    return;
  } catch (e) {
    requestLogger.fatal({ dmpId, jti: token?.jti, err: e }, e.message);
    res.status(500)
      .send("Document generation failed");
    return;
  }
});

// ----------------- ALB Healthcheck -----------------
app.get("/narrative-health", (_: Request, res: Response) => res.send("ok"));

// ----------------- Startup the server  -----------------
const startServer = async () => {
  const PORT = process.env.PORT || 4030;
  app.listen(PORT, () => console.log(`${process.env.APP_NAME} listening on port ${PORT}`));
}

// Graceful shutdown
const shutdown = async () => {
  try {
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
