/**
 * Report Writer Service
 *
 * Writes report.json and report.md to .verified/
 *
 * After writing reports, attempts to hide the .verified folder on Windows and macOS.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MachineReport } from '../types/report';
import { hideVerifiedFolder } from '../utils/hideVerifiedFolder.js';

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
  private readonly hideEnabled: boolean;

  constructor(workspaceRoot: string, hideEnabled = true) {
    this.workspaceRoot = workspaceRoot;
    this.hideEnabled = hideEnabled;
  }

  async writeJsonReport(report: MachineReport): Promise<void> {
    const filePath = path.join(this.workspaceRoot, REPORT_JSON_PATH);
    await this.ensureVerifiedDir();
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
    await this.hideFolderIfEnabled();
  }

  async writeMdReport(markdown: string): Promise<void> {
    const filePath = path.join(this.workspaceRoot, REPORT_MD_PATH);
    await this.ensureVerifiedDir();
    await fs.writeFile(filePath, markdown, 'utf8');
    await this.hideFolderIfEnabled();
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

  private async hideFolderIfEnabled(): Promise<void> {
    const verifiedPath = path.join(this.workspaceRoot, '.verified');
    await hideVerifiedFolder(verifiedPath, this.workspaceRoot, this.hideEnabled);
  }
}
