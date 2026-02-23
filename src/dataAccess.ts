import {
  ConnectionParams,
  createDMP,
  DMP_LATEST_VERSION,
  DynamoConnectionParams,
  EnvironmentEnum,
  getDMPs,
  getSSMParameter,
  planToDMPCommonStandard,
  queryTable,
  SsmConnectionParams,
  updateDMP
} from "@dmptool/utils";
import { JWTAccessToken } from "./helper";
import { Logger } from "pino";
import { DMPToolDMPType } from "@dmptool/types";

/**
 * A Plan the User has access to
 */
export interface UserPlanInterface {
  id: number,
  dmpId: string,
  accessLevel: string,
}

/**
 * A snippet of a Plan's data
 */
export interface PlanInterface {
  id: number,
  dmpId: string,
  modified: string,
  visibility: string,
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
 * Determines if the user has permission to download the narrative
 *
 * @param data The maDMP record for the DMP
 * @param userDMPs The list of DMPs the user has access to
 * @param token The user's JWT token
 * @returns true if the user has permission to download the narrative
 */
export function hasPermissionToDownloadNarrative(
  data: DMPToolDMPType,
  userDMPs: UserPlanInterface[],
  token: JWTAccessToken | undefined
): boolean {
  // Public plans are always available for download
  if (data?.dmp?.privacy === "public") return true;

  // Otherwise a token is required so bail out if it's not present
  if (!token) return false;

  // SuperAdmins can always access DMP narratives
  if (token?.role === "SUPERADMIN") return true;

  const affiliations = [data.dmp.contact?.affiliation[0]?.affiliation_id?.identifier];

  // Now collect all the contributors
  if (Array.isArray(data.dmp.contributor)) {
    affiliations.push(...data.dmp.contributor.map(c => c?.affiliation[0]?.affiliation_id?.identifier));
  }

  // Admins can always access DMP narratives for DMPs that belong to their affiliation
  return (token?.role === "ADMIN" && affiliations.includes(token?.affiliationId))
    // Researchers can access the narrative if the DMP is one associated with their token
    || userDMPs?.some(d => d.dmpId === data?.dmp.dmp_id?.identifier);
}

/**
 * Load all of the Plan ids and access levels from RDS for the user's email.'
 *
 * @param logger the logger to use for logging
 * @param token the user's JWT token
 * @param env the environment to use for fetching parameters from SSM
 * @returns the results from RDS
 */
export async function loadPlansForUser(
  logger: Logger,
  token: JWTAccessToken,
  env: EnvironmentEnum = EnvironmentEnum.DEV
): Promise<UserPlanInterface[]> {
  const ssmConfig = await getSSMConfig(logger);
  const rdsConfig: ConnectionParams = await getRDSConfig(ssmConfig, env);

  // Fetch the list of DMPs the user has access to
  const sql = `
      SELECT DISTINCT p.id, p.dmpId, pcs.accessLevel
      FROM plans p
        INNER JOIN projects prj ON p.projectId = prj.id
          INNER JOIN projectCollaborators pcs ON prj.id = pcs.projectId
      WHERE pcs.email = ?
      ORDER BY p.id;
    `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans: { results: any[], fields: any[] } = await queryTable(
    rdsConfig,
    sql,
    [token?.email || ""]
  );
  return Array.isArray(plans.results) ? plans.results : [];
}

/**
 * Load the Plan based on its dmpId from RDS.
 *
 * @param logger the logger to use for logging
 * @param dmpId the Plan's dmpId
 * @param env the environment to use for fetching parameters from SSM
 * @returns the results from RDS
 */
export async function loadPlan(
  logger: Logger,
  dmpId: string,
  env: EnvironmentEnum = EnvironmentEnum.DEV
): Promise<PlanInterface | undefined> {
  const ssmConfig = await getSSMConfig(logger);
  const rdsConfig: ConnectionParams = await getRDSConfig(ssmConfig, env);

  // Fetch the list of DMPs the user has access to
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans: { results: any[], fields: any[] } = await queryTable(
    rdsConfig,
    'SELECT id, dmpId, modified, visibility FROM plans WHERE dmpId = ?',
    [dmpId]
  );
  return Array.isArray(plans.results) ? plans.results[0] : undefined;
}

/**
 * Helper function to fetch a parameter from SSM
 *
 * @param logger the logger to use for logging
 * @param domainName the domain name to use for generating links
 * @param dmpId the DMP id to fetch
 * @returns the results from DynamoDB
 */
export async function loadMaDMPFromDynamo(
  logger: Logger,
  domainName: string,
  dmpId: string
): Promise<DMPToolDMPType | undefined> {
  const dynamoConfig: DynamoConnectionParams = getDynamoConfig(logger);

  logger.debug(`Fetching maDMP record for ${dmpId} from DynamoDB`);
  // Fetch the Plan's latest maDMP JSON from the DynamoDB Table
  const data: DMPToolDMPType[] = await getDMPs(
    dynamoConfig,
    domainName,
    dmpId,
    DMP_LATEST_VERSION,
    true
  );
  const hasNarrative = Array.isArray(data) && data[0]?.dmp?.narrative !== undefined;
  logger.debug(`Fetched maDMP record for ${dmpId}. Has narrative? ${hasNarrative}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : undefined;
}

/**
 * Helper function to persist the maDMP record in DynamoDB
 *
 * @param logger The logger to use for logging
 * @param domainName The domain name to use for generating links
 * @param dmpId The DMP id to fetch
 * @param maDMP The maDMP record to persist
 * @param wasJustOutdated Whether the record already existed in the DynamoDB table
 */
async function persistMaDMPRecord(
  logger: Logger,
  domainName: string,
  dmpId: string,
  maDMP: DMPToolDMPType,
  wasJustOutdated = false
): Promise<void> {
  const dynamoConfig: DynamoConnectionParams = getDynamoConfig(logger);

  // If the DynamoDB did have a maDMP record for the plan, then we need to update it
  if (wasJustOutdated) {
    await updateDMP(
      dynamoConfig,
      domainName,
      dmpId,
      maDMP,
      100, // Use a short grace period since it was missing
      false // We don't need the extensions returned
    );

  // Otherwise, we need to create the initial maDMP record for the plan
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

/**
 * If the DynamoDB table did not have a maDMP record for the plan OR
 * the Plan's modified timestamp does not match the DynamoDB record's
 * modified timestamp, then we should generate the maDMP record
 *
 * @param logger The logger to use for logging
 * @param env The environment to use for fetching parameters from SSM
 * @param applicationName The name of the application
 * @param domainName The domain name to use for generating links
 * @param plan The Plan to generate the maDMP record for
 * @param wasJustOutdated Whether the Plan was just updated and is now outdated
 * @returns The maDMP record generated from the Plan's data'
 */
export async function handleMissingMaDMP(
  logger: Logger,
  env: EnvironmentEnum,
  applicationName: string,
  domainName: string,
  plan: PlanInterface,
  wasJustOutdated: boolean
): Promise<DMPToolDMPType> {
  const ssmConfig: SsmConnectionParams = await getSSMConfig(logger);
  const rdsConfig: ConnectionParams = await getRDSConfig(ssmConfig, env);

  // Generate the maDMP record from the Plan's data
  const maDMP = await planToDMPCommonStandard(
    rdsConfig,
    applicationName,
    domainName,
    env,
    plan.id,
    true
  );

  if (maDMP && maDMP.dmp) {
    // Persist the maDMP record to the DynamoDB table
    await persistMaDMPRecord(
      logger,
      domainName,
      plan.dmpId,
      maDMP,
      wasJustOutdated,
    );
  }
  return maDMP;
}
