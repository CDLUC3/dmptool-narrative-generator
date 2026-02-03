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
import {
  safeNumber,
  safeBoolean,
  pointsToFontSize,
  getFontFamily
} from "./helper";
import { expressjwt, Request } from "express-jwt";
import { DMPToolDMPType } from "@dmptool/types";
import {
  ConnectionParams,
  convertMySQLDateTimeToRFC3339,
  createDMP,
  DMP_LATEST_VERSION,
  DynamoConnectionParams,
  EnvironmentEnum,
  getDMPs,
  getSSMParameter,
  initializeLogger,
  LogLevelEnum,
  planToDMPCommonStandard,
  queryTable,
  SsmConnectionParams,
  updateDMP
} from "@dmptool/utils";

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
  id: number,
  dmpId: string,
  modified: string,
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
  data: DMPToolDMPType,
  userDMPs: UserDMPInterface[],
  token: JWTAccessToken | null
): boolean {
  const affiliations = [data.dmp.contact?.dmproadmap_affiliation?.affiliation_id?.identifier];

  // Now collect all the contributors
  if (Array.isArray(data.dmp.contributor)) {
    affiliations.push(...data.dmp.contributor.map(c => c?.dmproadmap_affiliation?.affiliation_id?.identifier));
  }

  // Narrative downloads are always available for public DMPs
  return data.dmp.privacy === "public"
    // SuperAdmins can always access DMP narratives
    || token?.role === "SUPERADMIN"
    // Admins can always access DMP narratives for DMPs that belong to their affiliation
    || (token?.role === "ADMIN" && affiliations.includes(token?.affiliationId))
    // Researchers can access the narrative if the DMP is one associated with their token
    || userDMPs?.some(d => d.dmpId === data?.dmp.dmp_id?.identifier);
}

// ----------------- Process the incoming Accept types  -----------------
function processAccept(accept: string): string[] {
  // The accept header may contain a lot of info and several types
  //   e.g. text/html,application/xhtml+xml,application/xml;q=0.9,*/*;v=b3;q=0.7
  const rawTypes = accept ? accept.split(";")[0] : "";
  return rawTypes.split(",");
}

/**
 * Returns the SSM connection parameters
 *
 * @param logger The logger to use for logging
 * @returns The SSM connection parameters
 */
const getSSMConfig = async (
  logger: Logger,
): Promise<SsmConnectionParams | undefined> => {
  // If running locally, the SSM_ENDPOINT variable will be set
  return {
    logger,
    region: process.env.AWS_REGION,
    endpoint: process.env.SSM_ENDPOINT,
    useTLS: process.env.SSM_ENDPOINT === undefined
  };
}

/**
 * Helper function to get the DynamoDB connection parameters
 *
 * @param logger the logger to use for logging
 * @returns the DynamoDB connection parameters
 */
const getDynamoConfig = (
  logger: Logger
): DynamoConnectionParams | undefined => {
  if (!process.env.DYNAMODB_TABLE_NAME) {
    logger.fatal('Missing DYNAMODB_TABLE_NAME env variable!');
    return undefined;
  }

  return {
    logger,
    region: process.env.AWS_REGION || 'us-west-2',
    tableName: process.env.DYNAMODB_TABLE_NAME,
    endpoint: process.env.DYNAMODB_ENDPOINT,
    maxAttempts: Number(process.env.MAX_ATTEMPTS) || 3
  };
}

/**
 * Helper function to get the RDS connection parameters
 *
 * @param ssmConfig the configuration for fetching parameters from SSM
 * @param env the environment to use for fetching parameters from SSM
 * @returns the RDS connection parameters
 */
const getRDSConfig = async (
  ssmConfig: SsmConnectionParams,
  env: EnvironmentEnum = EnvironmentEnum.DEV
): Promise<ConnectionParams | undefined> => {
  const rdsUser = await getSSMParameter(ssmConfig, 'RdsUsername', env);
  const rdsPassword = await getSSMParameter(ssmConfig, 'RdsPassword', env);

  if (!process.env.RDS_HOST) {
    ssmConfig.logger.fatal('Missing RDS_HOST env variable!');
    return undefined;
  }
  if (!rdsUser) {
    ssmConfig.logger.fatal('Missing RdsUserName in SSM Parameter Store!');
    return undefined;
  }
  if (!rdsPassword) {
    ssmConfig.logger.fatal('Missing RdsPassword in SSM Parameter Store!');
    return undefined;
  }

  return {
    logger: ssmConfig.logger,
    host: process.env.RDS_HOST,
    port: Number(process.env.RDS_PORT) || 3306,
    user: rdsUser || 'root',
    password: rdsPassword,
    database: process.env.RDS_DATABASE || 'dmp'
  };
}

/**
 * Helper function to fetch a parameter from SSM
 *
 * @param rdsConfig the configuration for fetching parameters from RDS
 * @param token the user's JWT token
 * @returns the results from RDS
 */
async function loadPlansFromRds(
  rdsConfig: ConnectionParams,
  token: JWTAccessToken
): Promise<UserDMPInterface[]> {
  // Fetch the list of DMPs the user has access to
  const sql = `
      SELECT DISTINCT p.dmpId as dmpId, pcs.accessLevel as accessLevel
      FROM plans p
        INNER JOIN projects prj ON p.projectId = prj.id
          INNER JOIN projectCollaborators pcs ON prj.id = pcs.projectId
      WHERE pcs.email = ?
      ORDER BY p.dmpId;
    `;
  const userDMPs: { results: any[], fields: any[] } = await queryTable(
    rdsConfig,
    sql
      [token?.email || ""]
  );
  return Array.isArray(userDMPs.results) ? userDMPs.results : [];
}

/**
 * Helper function to fetch a parameter from SSM
 *
 * @param dynamoConfig the configuration for fetching parameters from DynamoDB
 * @param domainName the domain name to use for generating links
 * @param dmpId the DMP id to fetch
 * @returns the results from DynamoDB
 */
async function loadMaDMPFromDynamo(
  dynamoConfig: DynamoConnectionParams,
  domainName: string,
  dmpId: string
): Promise<DMPToolDMPType | undefined> {
  // Fetch the Plan's latest maDMP JSON from the DynamoDB Table
  const data: DMPToolDMPType[] = await getDMPs(
    dynamoConfig,
    domainName,
    dmpId,
    DMP_LATEST_VERSION,
    true
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : undefined;
}

/**
 * Helper function to persist the maDMP record in DynamoDB
 *
 * @param didExist Whether the record already existed in the DynamoDB table
 * @param dynamoConfig The DynamoDB connection parameters
 * @param domainName The domain name to use for generating links
 * @param dmpId The DMP id to fetch
 * @param maDMP The maDMP record to persist
 */
async function persistMaDMPRecord(
  didExist: boolean,
  dynamoConfig: DynamoConnectionParams,
  domainName: string,
  dmpId: string,
  maDMP: DMPToolDMPType
): Promise<void> {
  // If it didn't exist, create the initial maDMP record
  if (didExist) {
    // Otherwise it was a timestamp mismatch, so we need to update the record
    await updateDMP(
      dynamoConfig,
      domainName,
      dmpId,
      maDMP,
      100, // Use a short grace period since it was missing
      false // We don't need the extensions returned
    );
  } else {
    await createDMP(
      dynamoConfig,
      domainName,
      dmpId,
      maDMP,
      DMP_LATEST_VERSION,
      false // We don't need the extensions returned
    );
  }
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
  const logLevel: LogLevelEnum = LogLevelEnum[process.env.LOG_LEVEL?.toUpperCase()] || LogLevelEnum.INFO;
  const env: EnvironmentEnum = EnvironmentEnum[process.env.ENV?.toUpperCase()] || EnvironmentEnum.DEV;

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

  // Initialze the logger
  const requestLogger: Logger = initializeLogger('narrative-generator', logLevel);

  requestLogger.debug(
    {
      dmpId,
      version,
      format: accept,
      display,
      margin,
      font,
      allowedDMPs: token?.dmpIds ?? []
    },
    `Received request for DMP narrative`
  );

  try {
    const ssmConfig = await getSSMConfig(requestLogger);
    const dynamoConfig: DynamoConnectionParams = getDynamoConfig(requestLogger);
    const rdsConfig: ConnectionParams = await getRDSConfig(ssmConfig, env);
    const domainName = process.env.DOMAIN_NAME ?? "localhost:3000";
    const applicationName = process.env.APPLICATION_NAME ?? "dmptool";

    const userDMPs: UserDMPInterface[] = await loadPlansFromRds(rdsConfig, token);
    requestLogger.debug({ dmpId }, "Retrieved Plan data from RDS");

    // If the Plan doesn't exist at all we should bail out
    if (!Array.isArray(userDMPs) || userDMPs.length === 0) {
      requestLogger.info({ dmpId}, "DMP not found");
      res.status(404).send("DMP not found");
      return;
    }

    let maDMP: DMPToolDMPType = await loadMaDMPFromDynamo(dynamoConfig, domainName, dmpId);
    const maDMPExists = !!maDMP;
    requestLogger.debug({ dmpId }, "Retrieved maDMP metadata from DynamoDB");

    // Determine if the caller has permission to view the DMP's narrative
    const hasPermission = hasPermissionToDownloadNarrative(maDMP, userDMPs, token);
    if (!hasPermission) {
      requestLogger.warn("User does not have permission to download narrative");
      // We return 404 here so that we're not signaling which DMP ids are valid
      res.status(404).send("DMP not found");
      return;
    }

    // If the DynamoDB table did not have a maDMP record for the plan OR
    // the Plan's modified timestamp does not match the DynamoDB record's
    // modified timestamp, then we should generate the maDMP record
    const rdsDate: string = convertMySQLDateTimeToRFC3339(userDMPs[0].modified);
    if (!maDMP || rdsDate !== maDMP.dmp.modified) {
      maDMP = await planToDMPCommonStandard(
        rdsConfig,
        applicationName,
        domainName,
        env,
        userDMPs[0].id,
        true
      );

      if (!maDMP || !maDMP.dmp) {
        requestLogger.error({dmpId}, "Unable to generate the maDMP record");
        // We return 404 here so that we're not signaling which DMP ids are valid
        res.status(500).send("Unable to generate the narrative at this time.");
        return;
      }

      // Persist the maDMP record to the DynamoDB table
      await persistMaDMPRecord(
        maDMPExists,
        dynamoConfig,
        domainName,
        dmpId,
        maDMP
      );
    }

    const acceptedTypes = processAccept(accept);
    if (acceptedTypes.includes(CSV_TYPE)) {
      const csv = renderCSV(display, maDMP.dmp);
      requestLogger.debug("Generating CSV");
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
      requestLogger.debug("Generating DOCX");
      res.setHeader("Content-Type", DOCX_TYPE);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(maDMP.dmp?.title || "document").replace(/\W+/g, "-")}.docx"`
      );
      res.send(docx);
      return;

    } else if (acceptedTypes.includes(HTML_TYPE)) {
      const html = renderHTML(display, margin, font, maDMP.dmp);
      requestLogger.debug("Generating HTML");
      res.type("html").send(html);
      return;

    } else if (acceptedTypes.includes(JSON_TYPE)) {
      requestLogger.debug("Generating JSON");
      res.type("json").send(maDMP.dmp);
      return;

    } else if (acceptedTypes.includes(PDF_TYPE)) {
      // Render the HTML which is then used to render the PDF
      const pdf = await renderPDF(
        renderHTML(display, margin, font, maDMP.dmp)
      );
      requestLogger.debug("Generating PDF");
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
      requestLogger.debug("Generating TXT");
      res.type("txt").send(txt);
      return;

    } else {
      requestLogger.debug(`Unsupported format requested: ${accept}`);
      // The format requested is not supported!
      res.status(406)
        .send("Not Acceptable: Supported formats are HTML, PDF, CSV, DOCX, TXT");
    }

    // If it ends up here somehow return a 500
    res.status(500)
      .send("Unable to process your request at this time.");
  } catch (e) {
    requestLogger.error(e);
    res.status(500)
      .send("Document generation failed");
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
