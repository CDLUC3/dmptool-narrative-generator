import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from 'supertest';
import type { Logger } from 'pino';
import type { DMPToolDMPType } from '@dmptool/types';

process.env.APPLICATION_NAME = 'test-app';
process.env.DOMAIN_NAME = 'example.com';
process.env.DYNAMODB_TABLE_NAME = 'test-table';
process.env.DYNAMODB_ENDPOINT = 'test-endpoint';
process.env.ENV = 'tst';
process.env.EZID_BASE_URL = 'test-ezid';
process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL = 'debug';
process.env.RDS_HOST = 'test-rds';
process.env.SSM_ENDPOINT = 'test-ssm';

import type { NextFunction } from "express";
import type { PlanInterface, UserPlanInterface } from "../dataAccess.js";

// Mock all imported modules
jest.mock('dotenv');
jest.mock('../csv');
jest.mock('../html');
jest.mock('../pdf');
jest.mock('../docx');
jest.mock('../txt');
jest.mock('../helper');
jest.mock('@dmptool/utils');
jest.mock('../dataAccess');

const mockLaunch = jest.fn();
jest.unstable_mockModule("puppeteer", () => ({
  default: {
    launch: mockLaunch,
  },
  launch: mockLaunch,
}));

const mockExpressJWT = jest.fn(() => (req: Request, res: Response, next: NextFunction) => {
  // Simulate a decoded token for testing purposes if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).auth = { id: 1, email: 'test@example.com' };
  next();
});
jest.unstable_mockModule('express-jwt', () => ({
  expressjwt: mockExpressJWT,
}));

const mockRenderHTML = jest.fn();
jest.unstable_mockModule('../html.js', () => ({
  renderHTML: mockRenderHTML,
}));
const mockRenderPdf = jest.fn();
jest.unstable_mockModule('../pdf.js', () => ({
  renderPDF: mockRenderPdf,
}));
const mockRenderCSV = jest.fn();
jest.unstable_mockModule('../csv.js', () => ({
  renderCSV: mockRenderCSV,
}));
const mockRenderDOCX = jest.fn();
jest.unstable_mockModule('../docx.js', () => ({
  renderDOCX: mockRenderDOCX,
}));
const mockRenderTXT = jest.fn();
jest.unstable_mockModule('../txt.js', () => ({
  renderTXT: mockRenderTXT,
}));

const mockLoadDMPFromDynamo = jest.fn();
const mockLoadPlan = jest.fn();
const mockLoadPlansForUser = jest.fn();
const mockHandleMissingMaDMP = jest.fn();
const mockHasPermissionToDownloadNarrative = jest.fn();
jest.unstable_mockModule('../dataAccess.js', () => ({
  loadMaDMPFromDynamo: mockLoadDMPFromDynamo,
  loadPlan: mockLoadPlan,
  loadPlansForUser: mockLoadPlansForUser,
  handleMissingMaDMP: mockHandleMissingMaDMP,
  hasPermissionToDownloadNarrative: mockHasPermissionToDownloadNarrative,
}));

const mockInitializeLogger = jest.fn(() => mockLogger);
const mockConvertMySQL = jest.fn();
const mockToErrorMessage = jest.fn();
jest.unstable_mockModule('@dmptool/utils', () => ({
  initializeLogger: mockInitializeLogger,
  convertMySQLDateTimeToRFC3339: mockConvertMySQL,
  toErrorMessage: mockToErrorMessage,
  EnvironmentEnum: {
    DEV: "dev",
    STAGE: "stage",
    PROD: "prod"
  },
  LogLevelEnum: {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal"
  },
  DMP_LATEST_VERSION: "latest"
}));

const html = await import('../html.js');
const csv = await import('../csv.js');
const pdf = await import('../pdf.js');
const docx = await import('../docx.js');
const txt = await import('../txt.js');
const dataAccess= await import('../dataAccess.js');
const app = (await import('../server.js')).default;

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
} as unknown as Logger;

describe('Server', () => {
  let mockPlan: PlanInterface;
  let mockMaDMP: DMPToolDMPType;
  let mockUserDMPs: UserPlanInterface[];

  beforeEach(() => {
    jest.clearAllMocks();

    mockPlan = {
      id: 123,
      dmpId: '11.11111/A1B2C3',
      modified: '2024-01-01 00:00:00',
      visibility: 'private',
    };

    mockMaDMP = {
      dmp: {
        title: 'Test DMP',
        modified: '2024-01-01T00:00:00Z',
        dmp_id: {
          identifier: '11.11111/A1B2C3',
          type: 'doi',
        },
      },
    };

    mockUserDMPs = [
      {
        id: 123,
        dmpId: '11.11111/A1B2C3',
        accessLevel: 'public',
      },
    ];

    // Setup default mocks
    (dataAccess.loadPlan as jest.Mock).mockResolvedValue(mockPlan as never);
    (dataAccess.loadPlansForUser as jest.Mock).mockResolvedValue(mockUserDMPs as never);
    (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(mockMaDMP as never);
    (dataAccess.hasPermissionToDownloadNarrative as jest.Mock).mockReturnValue(true as never);
    (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(mockMaDMP as never);
    (html.renderHTML as jest.Mock).mockReturnValue('<html>Test HTML</html>');
    (csv.renderCSV as jest.Mock).mockReturnValue('column1,column2\nvalue1,value2');
    (pdf.renderPDF as jest.Mock).mockResolvedValue(Buffer.from('PDF content') as never);
    (docx.renderDOCX as jest.Mock).mockResolvedValue(Buffer.from('DOCX content') as never);
    (txt.renderTXT as jest.Mock).mockResolvedValue('Plain text content' as never);
  });

  describe('GET /dmps/{*splat}/narrative{.:ext}', () => {
    it.only('should return HTML narrative with valid token and permissions', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toBe('<html>Test HTML</html>');
      expect(html.renderHTML).toHaveBeenCalled();
    });

    it('should return PDF narrative', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'application/pdf')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('application/pdf');
      expect(pdf.renderPDF).toHaveBeenCalled();
    });

    it('should return CSV narrative', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/csv')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/csv');
      expect(csv.renderCSV).toHaveBeenCalled();
    });

    it('should return DOCX narrative', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(docx.renderDOCX).toHaveBeenCalled();
    });

    it('should return TXT narrative', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/plain')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/plain');
      expect(txt.renderTXT).toHaveBeenCalled();
    });

    it('should return JSON narrative', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'application/json')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('application/json');
      expect(response.body).toEqual(mockMaDMP.dmp);
    });

    it('should detect format from .csv extension', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative.csv')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/csv');
      expect(csv.renderCSV).toHaveBeenCalled();
    });

    it('should detect format from .docx extension', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative.docx')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(docx.renderDOCX).toHaveBeenCalled();
    });

    it('should detect format from .json extension', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative.json')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('application/json');
    });

    it('should detect format from .pdf extension', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative.pdf')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('application/pdf');
      expect(pdf.renderPDF).toHaveBeenCalled();
    });

    it('should detect format from .txt extension', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative.txt')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/plain');
      expect(txt.renderTXT).toHaveBeenCalled();
    });

    it('should default to HTML for unknown extension', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative.xyz')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(html.renderHTML).toHaveBeenCalled();
    });

    it('should parse multiple Accept header types', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
    });

    it('should return 404 when user lacks permission', async () => {
      (dataAccess.hasPermissionToDownloadNarrative as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(404);
      expect(response.text).toBe('DMP not found');
    });

    it('should return 404 when DMP not found in user DMPs', async () => {
      (dataAccess.loadPlan as jest.Mock).mockResolvedValue(undefined as never);

      const response = await request(app)
        .get('/dmps/11.11111/NOTFOUND/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(404);
    });

    it('should return 500 when maDMP cannot be generated', async () => {
      (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(null as never);
      (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(null as never);

      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Unable to generate a narrative at this time');
    });

    it('should return 406 for unsupported format', async () => {
      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'application/unsupported')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(406);
      expect(response.text).toBe('Not Acceptable: Supported formats are HTML, PDF, CSV, DOCX, TXT');
    });

    it('should handle missing maDMP and regenerate', async () => {
      (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(null as never);
      (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(mockMaDMP as never);

      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(dataAccess.handleMissingMaDMP).toHaveBeenCalled();
    });

    it('should handle out-of-date maDMP and regenerate', async () => {
      const outdatedMaDMP = {
        ...mockMaDMP,
        dmp: {
          ...mockMaDMP.dmp,
          modified: '2023-01-01T00:00:00Z',
        },
      };
      (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(outdatedMaDMP as never);
      (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(mockMaDMP as never);

      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(dataAccess.handleMissingMaDMP).toHaveBeenCalled();
    });

    it('should return 500 when exception occurs', async () => {
      (dataAccess.loadPlan as jest.Mock).mockRejectedValue(new Error('Database error') as never);

      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Document generation failed');
    });
  });

  describe('GET /narrative-health', () => {
    it('should return ok for health check', async () => {
      const response = await request(app).get('/narrative-health');

      expect(response.status).toBe(200);
      expect(response.text).toBe('ok');
    });
  });
});
