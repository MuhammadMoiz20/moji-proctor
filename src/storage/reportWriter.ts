/**
 * Report Writer Service
 *
 * Writes report.json and report.md to .verified/
 *
 * To be fully implemented by another agent (reportGenerator).
 * This scaffold provides basic file writing capability.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MachineReport } from '../types/report';

/**
 * Report paths within .verified directory
 */
export const REPORT_JSON_PATH = '.verified/report.json';
export const REPORT_MD_PATH = '.verified/report.md';

/**
 * Report writer interface
 */
export interface IReportWriter {
  /** Write machine-readable JSON report */
  writeJsonReport(report: MachineReport): Promise<void>;
  /** Write human-readable markdown report */
  writeMdReport(markdown: string): Promise<void>;
  /** Check if reports exist */
  reportsExist(): Promise<boolean>;
}

/**
 * Report writer implementation
 */
export class ReportWriter implements IReportWriter {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async writeJsonReport(report: MachineReport): Promise<void> {
    const filePath = path.join(this.workspaceRoot, REPORT_JSON_PATH);
    await this.ensureVerifiedDir();
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  }

  async writeMdReport(markdown: string): Promise<void> {
    const filePath = path.join(this.workspaceRoot, REPORT_MD_PATH);
    await this.ensureVerifiedDir();
    await fs.writeFile(filePath, markdown, 'utf8');
  }

  async reportsExist(): Promise<boolean> {
    try {
      const jsonPath = path.join(this.workspaceRoot, REPORT_JSON_PATH);
      await fs.access(jsonPath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureVerifiedDir(): Promise<void> {
    const dir = path.join(this.workspaceRoot, '.verified');
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Ignore if already exists
    }
  }
}
