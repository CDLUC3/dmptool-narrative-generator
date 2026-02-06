import {
  getSSMParameter,
  queryTable,
  getDMPs,
  createDMP,
  updateDMP,
  planToDMPCommonStandard,
  EnvironmentEnum,
  DMP_LATEST_VERSION
} from "@dmptool/utils";
import { Logger } from "pino";
import {
  handleMissingMaDMP,
  hasPermissionToDownloadNarrative,
  loadMaDMPFromDynamo,
  loadPlan,
  loadPlansForUser,
  PlanInterface,
  UserPlanInterface,
} from "../dataAccess";
import { JWTAccessToken } from "../helper";
import { DMPToolDMPType } from "@dmptool/types";

// Mock all imported functions from @dmptool/utils
jest.mock("@dmptool/utils", () => ({
  getSSMParameter: jest.fn(),
  queryTable: jest.fn(),
  getDMPs: jest.fn(),
  createDMP: jest.fn(),
  updateDMP: jest.fn(),
  planToDMPCommonStandard: jest.fn(),
  EnvironmentEnum: {
    DEV: "dev",
    STAGE: "stage",
    PROD: "prod"
  },
  DMP_LATEST_VERSION: "latest"
}));

describe("dataAccess", () => {
  let mockLogger: Logger;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.ENV = 'tst';

    mockLogger = {
      fatal: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn()
    } as undefined as Logger;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("hasPermissionToDownloadNarrative", () => {
    const mockDMP: DMPToolDMPType = {
      dmp: {
        dmp_id: { identifier: "dmp123" },
        privacy: "private",
        contact: {
          affiliation: [{
            affiliation_id: { identifier: "aff123" }
          }]
        },
        contributor: [
          {
            affiliation: [{
              affiliation_id: { identifier: "aff456" }
            }]
          }
        ]
      }
    };

    const mockUserDMPs: UserPlanInterface[] = [
      {id: 1, dmpId: "dmp123", accessLevel: "read"}
    ];

    it("should return true for SUPERADMIN role", () => {
      const token: JWTAccessToken = {
        role: "SUPERADMIN",
        email: "admin@example.com",
        affiliationId: "aff789"
      } as undefined as JWTAccessToken;

      const result = hasPermissionToDownloadNarrative(mockDMP, mockUserDMPs, token);
      expect(result).toBe(true);
    });

    it("should return true for public DMPs", () => {
      const publicDMP = {
        ...mockDMP,
        dmp: {...mockDMP.dmp, privacy: "public"}
      };
      const token: JWTAccessToken = {
        role: "RESEARCHER",
        email: "user@example.com",
        affiliationId: "aff999"
      } as undefined as JWTAccessToken;

      const result = hasPermissionToDownloadNarrative(publicDMP, [], token);
      expect(result).toBe(true);
    });

    it("should return true for ADMIN with matching affiliation", () => {
      const token: JWTAccessToken = {
        role: "ADMIN",
        email: "admin@example.com",
        affiliationId: "aff123"
      } as undefined as JWTAccessToken;

      const result = hasPermissionToDownloadNarrative(mockDMP, [], token);
      expect(result).toBe(true);
    });

    it("should return true for ADMIN with matching contributor affiliation", () => {
      const token: JWTAccessToken = {
        role: "ADMIN",
        email: "admin@example.com",
        affiliationId: "aff456"
      } as undefined as JWTAccessToken;

      const result = hasPermissionToDownloadNarrative(mockDMP, [], token);
      expect(result).toBe(true);
    });

    it("should return true for user with matching DMP in userDMPs", () => {
      const token: JWTAccessToken = {
        role: "RESEARCHER",
        email: "user@example.com",
        affiliationId: "aff999"
      } as undefined as JWTAccessToken

      const result = hasPermissionToDownloadNarrative(mockDMP, mockUserDMPs, token);
      expect(result).toBe(true);
    });

    it("should return false for user without permissions", () => {
      const token: JWTAccessToken = {
        role: "RESEARCHER",
        email: "user@example.com",
        affiliationId: "aff999"
      } as undefined as JWTAccessToken

      const result = hasPermissionToDownloadNarrative(mockDMP, [], token);
      expect(result).toBe(false);
    });

    it("should return false for undefined token on private DMP", () => {
      const result = hasPermissionToDownloadNarrative(mockDMP, mockUserDMPs, undefined);
      expect(result).toBe(false);
    });

    it("should handle DMP without contributors", () => {
      const dmpWithoutContributors: DMPToolDMPType = {
        dmp: {
          dmp_id: { identifier: "dmp123" },
          privacy: "private",
          contact: {
            affiliation: [{
              affiliation_id: { identifier: "aff123" }
            }]
          }
        }
      };

      const token: JWTAccessToken = {
        role: "ADMIN",
        email: "admin@example.com",
        affiliationId: "aff123"
      } as undefined as JWTAccessToken;

      const result = hasPermissionToDownloadNarrative(dmpWithoutContributors, [], token);
      expect(result).toBe(true);
    });
  });

  describe("loadPlan", () => {
    const mockDmpId = "dmp123";

    beforeEach(() => {
      process.env.AWS_REGION = "us-west-2";
      process.env.RDS_HOST = "localhost";
      process.env.RDS_PORT = "3306";
      process.env.RDS_DATABASE = "dmp";
    });

    it("should load plan from RDS successfully", async () => {
      const mockPlan: PlanInterface = {
        id: 123,
        dmpId: mockDmpId,
        modified: "2024-01-01",
        visibility: "private"
      };

      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: [mockPlan],
        fields: []
      });

      const result = await loadPlan(mockLogger, mockDmpId, EnvironmentEnum.DEV);

      expect(result).toEqual(mockPlan);
      expect(getSSMParameter).toHaveBeenCalledTimes(2);
      expect(queryTable).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "localhost",
          port: 3306,
          database: "dmp"
        }),
        'SELECT id, dmpId, modified, visibility FROM plans WHERE dmpId = ?',
        [mockDmpId]
      );
    });

    it("should return undefined when no plan is found", async () => {
      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: [],
        fields: []
      });

      const result = await loadPlan(mockLogger, mockDmpId, EnvironmentEnum.DEV);

      expect(result).toBeUndefined();
    });

    it("should return undefined when queryTable returns non-array results", async () => {
      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: null,
        fields: []
      });

      const result = await loadPlan(mockLogger, mockDmpId, EnvironmentEnum.DEV);

      expect(result).toBeUndefined();
    });

    it("should use default environment when not provided", async () => {
      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: [],
        fields: []
      });

      await loadPlan(mockLogger, mockDmpId);

      expect(getSSMParameter).toHaveBeenCalledWith(
        expect.any(Object),
        "RdsUsername",
        EnvironmentEnum.DEV
      );
    });

    it("should handle multiple plans and return first one", async () => {
      const mockPlans: PlanInterface[] = [
        {
          id: 123,
          dmpId: mockDmpId,
          modified: "2024-01-01",
          visibility: "private"
        },
        {
          id: 456,
          dmpId: mockDmpId,
          modified: "2024-01-02",
          visibility: "public"
        }
      ];

      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: mockPlans,
        fields: []
      });

      const result = await loadPlan(mockLogger, mockDmpId, EnvironmentEnum.PRD);

      expect(result).toEqual(mockPlans[0]);
    });

  })

  describe("loadPlansFromRds", () => {
    const mockToken: JWTAccessToken = {
      email: "user@example.com",
      role: "RESEARCHER"
    } as undefined as JWTAccessToken;

    beforeEach(() => {
      process.env.AWS_REGION = "us-west-2";
      process.env.RDS_HOST = "localhost";
      process.env.RDS_PORT = "3306";
      process.env.RDS_DATABASE = "dmp";
    });

    it("should load plans from RDS successfully", async () => {
      const mockResults = [
        {dmpId: "dmp123", accessLevel: "read"},
        {dmpId: "dmp456", accessLevel: "write"}
      ];

      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: mockResults,
        fields: []
      });

      const result = await loadPlansForUser(mockLogger, mockToken, EnvironmentEnum.DEV);

      expect(result).toEqual(mockResults);
      expect(getSSMParameter).toHaveBeenCalledTimes(2);
      expect(queryTable).toHaveBeenCalledTimes(1);
    });

    it("should return empty array when queryTable returns non-array results", async () => {
      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: null,
        fields: []
      });

      const result = await loadPlansForUser(mockLogger, mockToken, EnvironmentEnum.DEV);

      expect(result).toEqual([]);
    });

    it("should use default environment when not provided", async () => {
      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (queryTable as jest.Mock).mockResolvedValue({
        results: [],
        fields: []
      });

      await loadPlansForUser(mockLogger, mockToken);

      expect(getSSMParameter).toHaveBeenCalledWith(
        expect.any(Object),
        "RdsUsername",
        EnvironmentEnum.DEV
      );
    });
  });

  describe("loadMaDMPFromDynamo", () => {
    const domainName = "https://example.com";
    const dmpId = "dmp123";

    beforeEach(() => {
      process.env.DYNAMODB_TABLE_NAME = "test-table";
      process.env.AWS_REGION = "us-west-2";
    });

    it("should load maDMP from DynamoDB successfully", async () => {
      const mockDMP: DMPToolDMPType = {
        dmp: {dmp_id: {identifier: dmpId}}
      } as DMPToolDMPType;

      (getDMPs as jest.Mock).mockResolvedValue([mockDMP]);

      const result = await loadMaDMPFromDynamo(mockLogger, domainName, dmpId);

      expect(result).toEqual(mockDMP);
      expect(getDMPs).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: mockLogger,
          tableName: "test-table"
        }),
        domainName,
        dmpId,
        DMP_LATEST_VERSION,
        true
      );
    });

    it("should return undefined when no DMPs found", async () => {
      (getDMPs as jest.Mock).mockResolvedValue([]);

      const result = await loadMaDMPFromDynamo(mockLogger, domainName, dmpId);

      expect(result).toBeUndefined();
    });

    it("should return undefined when getDMPs returns non-array", async () => {
      (getDMPs as jest.Mock).mockResolvedValue(null);

      const result = await loadMaDMPFromDynamo(mockLogger, domainName, dmpId);

      expect(result).toBeUndefined();
    });

    it("should log fatal error when DYNAMODB_TABLE_NAME is missing", async () => {
      delete process.env.DYNAMODB_TABLE_NAME;

      (getDMPs as jest.Mock).mockResolvedValue([]);

      await loadMaDMPFromDynamo(mockLogger, domainName, dmpId);

      expect(mockLogger.fatal).toHaveBeenCalledWith("Missing DYNAMODB_TABLE_NAME env variable!");
    });
  });

  describe("handleMissingMaDMP", () => {
    const domainName = "https://example.com";
    const applicationName = "test-app";
    const mockPlan: PlanInterface = {
      id: 123,
      dmpId: "dmp123",
      modified: "2024-01-01",
      visibility: "public"
    };

    beforeEach(() => {
      process.env.AWS_REGION = "us-west-2";
      process.env.RDS_HOST = "localhost";
      process.env.RDS_PORT = "3306";
      process.env.RDS_DATABASE = "dmp";
      process.env.DYNAMODB_TABLE_NAME = "test-table";
    });

    it("should handle missing maDMP and create new record", async () => {
      const mockMaDMP: DMPToolDMPType = {
        dmp: { dmp_id: { identifier: "dmp123" } }
      } as DMPToolDMPType;

      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (planToDMPCommonStandard as jest.Mock).mockResolvedValue(mockMaDMP);
      (createDMP as jest.Mock).mockResolvedValue(undefined);

      const result = await handleMissingMaDMP(
        mockLogger,
        EnvironmentEnum.DEV,
        applicationName,
        domainName,
        mockPlan,
        false
      );

      expect(result).toEqual(mockMaDMP);
      expect(planToDMPCommonStandard).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "localhost"
        }),
        applicationName,
        domainName,
        EnvironmentEnum.DEV,
        mockPlan.id,
        true
      );
      expect(createDMP).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "test-table"
        }),
        domainName,
        mockPlan.dmpId,
        mockMaDMP,
        DMP_LATEST_VERSION,
        false
      );
    });

    it("should handle missing maDMP and update existing record", async () => {
      const mockMaDMP: DMPToolDMPType = {
        dmp: { dmp_id: { identifier: "dmp123" } }
      } as DMPToolDMPType;

      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (planToDMPCommonStandard as jest.Mock).mockResolvedValue(mockMaDMP);
      (updateDMP as jest.Mock).mockResolvedValue(undefined);

      const result = await handleMissingMaDMP(
        mockLogger,
        EnvironmentEnum.DEV,
        applicationName,
        domainName,
        mockPlan,
        true
      );

      expect(result).toEqual(mockMaDMP);
      expect(updateDMP).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "test-table"
        }),
        domainName,
        mockPlan.dmpId,
        mockMaDMP,
        100,
        false
      );
      expect(createDMP).not.toHaveBeenCalled();
    });

    it("should not persist when maDMP has no dmp property", async () => {
      const mockMaDMP: DMPToolDMPType = undefined;

      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (planToDMPCommonStandard as jest.Mock).mockResolvedValue(mockMaDMP);

      const result = await handleMissingMaDMP(
        mockLogger,
        EnvironmentEnum.DEV,
        applicationName,
        domainName,
        mockPlan,
        false
      );

      expect(result).toEqual(mockMaDMP);
      expect(createDMP).not.toHaveBeenCalled();
      expect(updateDMP).not.toHaveBeenCalled();
    });

    it("should return maDMP when planToDMPCommonStandard returns undefined", async () => {
      (getSSMParameter as jest.Mock)
        .mockResolvedValueOnce("rdsUser")
        .mockResolvedValueOnce("rdsPassword");

      (planToDMPCommonStandard as jest.Mock).mockResolvedValue(undefined);

      const result = await handleMissingMaDMP(
        mockLogger,
        EnvironmentEnum.DEV,
        applicationName,
        domainName,
        mockPlan,
        false
      );

      expect(result).toBeUndefined();
      expect(createDMP).not.toHaveBeenCalled();
    });
  });
});
