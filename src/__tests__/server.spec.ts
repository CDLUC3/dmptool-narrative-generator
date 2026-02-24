import request from 'supertest';
import { Logger } from 'pino';
import { DMPToolDMPType } from '@dmptool/types';

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

import app from '../server';

import * as dataAccess from '../dataAccess';
import * as csv from '../csv';
import * as html from '../html';
import * as pdf from '../pdf';
import * as docx from '../docx';
import * as txt from '../txt';
import { NextFunction } from "express";
import { PlanInterface, UserPlanInterface } from "../dataAccess";

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

jest.mock('express-jwt', () => ({
  expressjwt: jest.fn(() => (req: Request, res: Response, next: NextFunction) => {
    // Simulate a decoded token for testing purposes if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).auth = { id: 1, email: 'test@example.com' };
    next();
  })
}));

// Mock a few functions in @dmptool/utils but keep the rest of the function intact
jest.mock("@dmptool/utils", () => ({
  ...jest.requireActual("@dmptool/utils"),
  initializeLogger: jest.fn(() => mockLogger),
  convertMySQLDateTimeToRFC3339: jest.fn(() => '2024-01-01T00:00:00Z'),
}));

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
    (dataAccess.loadPlan as jest.Mock).mockResolvedValue(mockPlan);
    (dataAccess.loadPlansForUser as jest.Mock).mockResolvedValue(mockUserDMPs);
    (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(mockMaDMP);
    (dataAccess.hasPermissionToDownloadNarrative as jest.Mock).mockReturnValue(true);
    (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(mockMaDMP);
    (html.renderHTML as jest.Mock).mockReturnValue('<html>Test HTML</html>');
    (csv.renderCSV as jest.Mock).mockReturnValue('column1,column2\nvalue1,value2');
    (pdf.renderPDF as jest.Mock).mockResolvedValue(Buffer.from('PDF content'));
    (docx.renderDOCX as jest.Mock).mockResolvedValue(Buffer.from('DOCX content'));
    (txt.renderTXT as jest.Mock).mockResolvedValue('Plain text content');
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
      (dataAccess.loadPlan as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .get('/dmps/11.11111/NOTFOUND/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(404);
    });

    it('should return 500 when maDMP cannot be generated', async () => {
      (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(null);
      (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(null);

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
      (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(null);
      (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(mockMaDMP);

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
      (dataAccess.loadMaDMPFromDynamo as jest.Mock).mockResolvedValue(outdatedMaDMP);
      (dataAccess.handleMissingMaDMP as jest.Mock).mockResolvedValue(mockMaDMP);

      const response = await request(app)
        .get('/dmps/11.11111/A1B2C3/narrative')
        .set('Accept', 'text/html')
        .set('Cookie', 'dmspt=mock-token');

      expect(response.status).toBe(200);
      expect(dataAccess.handleMissingMaDMP).toHaveBeenCalled();
    });

    it('should return 500 when exception occurs', async () => {
      (dataAccess.loadPlan as jest.Mock).mockRejectedValue(new Error('Database error'));

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
