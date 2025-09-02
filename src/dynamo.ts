import * as dotenv from 'dotenv';
import { Logger } from "pino";
import {
  DynamoDBClient,
  DynamoDBClientConfig,
  QueryCommand,
  QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { logger, prepareObjectForLogs } from "./logger";

dotenv.config();

const DMP_PK_PREFIX = 'DMP';
const DMP_SK_PREFIX = 'VERSION';
const DMP_LATEST_VERSION = 'latest';

const dynamoConfigParams: DynamoDBClientConfig = {
  region: process.env.AWS_REGION ?? "us-west-2",
  maxAttempts: process.env.DYNAMO_MAX_ATTEMPTS ? Number(process.env.DYNAMO_MAX_ATTEMPTS) : 3,
  // logger,
}

if (process.env.NODE_ENV === 'development') {
  dynamoConfigParams.endpoint = process.env.DYNAMO_ENDPOINT;
}

// Initialize AWS SDK clients (outside the handler function)
const dynamoDBClient = new DynamoDBClient(dynamoConfigParams);

const tableName = process.env.DYNAMO_TABLE_NAME;

// Fetch the specified DMP metadata record
//   - Version is optional, if not provided ALL versions of the DMP will be returned
//   - If you just want the latest version, use the DMP_LATEST_VERSION constant
export const getDMP = async (
  requestLogger: Logger,
  dmpId: string,
  version: string | null
  // TODO: Update the type here once the common standard is in @dmptool/types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | undefined> => {
  let params = {};

  if (version) {
    params = {
      KeyConditionExpression: "PK = :pk and SK = :sk",
      ExpressionAttributeValues: {
        ":pk": { S: dmpIdToPK(dmpId) },
        ":sk": { S: versionToSK(version) }
      }
    }
  } else {
    params = {
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: dmpIdToPK(dmpId) }
      }
    }
  }

  try {
    const response = await queryTable(requestLogger, tableName, params);
    if (response && response.Items.length > 0) {
      // sort the the results by the SK (version) descending
      const items = response.Items.sort((a, b) => b?.SK?.S?.toString().localeCompare(a?.SK?.S?.toString()));
      return items.map((item) => {
        // Unmarshall the item and remove the PK and SK because they're only important to DynamoDB
        const unmarshalled = unmarshall(item);
        delete unmarshalled.PK;
        delete unmarshalled.SK;
        return unmarshalled; // as DMPCommonStandard;
      })[0];
    }
  } catch (err) {
    requestLogger.error(prepareObjectForLogs({ dmpId, version }), 'Error getting DMP');
    throw(err);
  }
  return undefined;
}

// Query the specified DynamoDB table using the specified criteria
export const queryTable = async (
  requestLogger: Logger,
  table: string,
  params: object = {}
): Promise<QueryCommandOutput> => {
  try {
    // Query the DynamoDB index table for all DMP metadata (with pagination)
    const command = new QueryCommand({
      TableName: table,
      ConsistentRead: false,
      ReturnConsumedCapacity: logger?.level === 'debug' ? 'TOTAL' : 'NONE',
      ...params
    });

    requestLogger.debug(prepareObjectForLogs({ table, params }), 'Querying DynamoDB');
    return await dynamoDBClient.send(command);
  } catch (err) {
    logger.error({ table, err, params }, `Error querying DynamoDB table: ${table}`);
    throw new Error('Unable to query DynamoDB table');
  }
}

// Function to convert a DMP ID into a PK for the DynamoDB table
const dmpIdToPK = (dmpId: string): string => {
  // Remove the protocol and slashes from the DMP ID
  let id = dmpId?.replace(/(^\w+:|^)\/\//, '');
  // Make sure it starts with the `doi.org/` domain
  if (!id.startsWith("doi.org/")) {
    id = `doi.org/${id}`;
  }
  return `${DMP_PK_PREFIX}#${id}`;
}

// Function to convert a DMP ID version timestamp into a SK for the DynamoDB table
const versionToSK = (version = DMP_LATEST_VERSION): string => {
  return `${DMP_SK_PREFIX}#${version}`;
}
