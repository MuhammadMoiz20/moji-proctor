/**
 * Main entry point for the Verified Coursework GitHub Action
 *
 * This action:
 * 1. Reads .verified/report.json and .verified/log.jsonl
 * 2. Validates report schema using ajv
 * 3. Verifies hash chain matches extension canonicalization
 * 4. Posts a Check Run summary
 * 5. Uploads .verified/ as artifact
 * 6. Writes to remote DB if validation passed (Action-only, no extension writes)
 * 7. Optionally posts PR comment with report.md
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { existsSync } from 'fs';
import { Validator } from './validator.js';
import { buildRecord, writeRecord, loadDbConfig } from './db.js';
import type { GitHubContext } from './types.js';

interface Context {
  repo: { owner: string; repo: string };
  sha: string;
  issue: { number: number };
}

/**
 * Find comment with existing marker and return its ID
 */
async function findExistingComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<number | null> {
  const octokit = github.getOctokit(token);
  const marker = '<!-- verified-coursework-report -->';

  try {
    const comments = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber
    });

    for (const comment of comments.data) {
      if (comment.body?.includes(marker)) {
        return comment.id;
      }
    }
  } catch (error) {
    core.warning(`Failed to find existing comment: ${(error as Error).message}`);
  }

  return null;
}

/**
 * Create or update PR comment with report
 */
async function postPrComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  reportMd: string
): Promise<void> {
  const octokit = github.getOctokit(token);
  const marker = '<!-- verified-coursework-report -->';
  const body = `${marker}\n\n# Verified Coursework Report\n\n${reportMd}`;

  try {
    const existingId = await findExistingComment(owner, repo, prNumber, token);

    if (existingId) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingId,
        body
      });
      core.info('Updated existing PR comment');
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
      });
      core.info('Created new PR comment');
    }
  } catch (error) {
    core.warning(`Failed to post PR comment: ${(error as Error).message}`);
  }
}

/**
 * Create a check run with the validation results
 */
async function createCheckRun(
  owner: string,
  repo: string,
  token: string,
  sha: string,
  title: string,
  summary: string,
  conclusion: 'success' | 'failure'
): Promise<void> {
  const octokit = github.getOctokit(token);

  try {
    await octokit.rest.checks.create({
      owner,
      repo,
      name: 'Verified Coursework',
      head_sha: sha,
      status: 'completed',
      conclusion,
      output: {
        title,
        summary
      }
    });
    core.info(`Created check run with conclusion: ${conclusion}`);
  } catch (error) {
    core.warning(`Failed to create check run: ${(error as Error).message}`);
  }
}

/**
 * Upload .verified directory as artifact
 */
async function uploadArtifact(
  verifiedPath: string
): Promise<string | null> {
  const { create } = require('@actions/artifact');
  const artifact = create();

  try {
    const { artifactId, size } = await artifact.uploadArtifact(
      'verified-coursework-data',
      [verifiedPath],
      process.cwd(),
      { continueOnError: false }
    );

    core.info(`Uploaded artifact: ${artifactId} (${size} bytes)`);
    return artifactId.toString();
  } catch (error) {
    core.warning(`Failed to upload artifact: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Main action function
 */
async function run(): Promise<void> {
  try {
    // Get inputs
    const verifiedPath = core.getInput('verified-path', { required: false }) || '.verified';
    const failOnIntegrityIssues = core.getInput('fail-on-integrity-issues', { required: false }) !== 'false';
    const shouldPostPrComment = core.getInput('post-pr-comment', { required: false }) !== 'false';
    const token = core.getInput('token', { required: true });

    // Get GitHub context
    const ctx = github.context as unknown as Context;
    const { owner, repo } = ctx.repo;
    const actualSha = ctx.sha;
    const actualPrNumber = ctx.issue.number;

    core.info(`Validating Verified Coursework data from: ${verifiedPath}`);
    core.info(`Repository: ${owner}/${repo}`);
    core.info(`SHA: ${actualSha}`);

    // Check if .verified directory exists
    if (!existsSync(verifiedPath)) {
      core.setFailed(`Verified data directory not found: ${verifiedPath}`);
      return;
    }

    // Create validator and load data
    const validator = new Validator(verifiedPath);
    const loadResult = validator.loadData();

    if (!loadResult.success) {
      core.error('Failed to load verification data:');
      for (const error of loadResult.errors) {
        core.error(`  - ${error}`);
      }
    }

    for (const warning of loadResult.warnings) {
      core.warning(warning);
    }

    // Validate schemas
    const schemaResult = validator.validateSchemas();
    if (!schemaResult.success) {
      core.error('Schema validation failed:');
      for (const error of schemaResult.errors) {
        core.error(`  - ${error}`);
      }
    }

    // Verify hash chain
    const hashResult = validator.verifyHashChain();
    core.info(`Hash chain verification: ${hashResult.valid ? 'PASSED' : 'FAILED'}`);
    core.info(`  Events processed: ${hashResult.totalEvents}`);

    if (!hashResult.valid) {
      core.error(`  Broken at event ${hashResult.brokenAt}`);
      if (hashResult.expectedHash) {
        core.error(`  Expected: ${hashResult.expectedHash}`);
      }
      if (hashResult.actualHash) {
        core.error(`  Actual: ${hashResult.actualHash}`);
      }
    }

    // Verify report consistency
    const consistencyResult = validator.verifyReportConsistency();
    if (!consistencyResult.success) {
      core.error('Report consistency check failed:');
      for (const error of consistencyResult.errors) {
        core.error(`  - ${error}`);
      }
    }

    // Generate summary
    const checkSummary = validator.generateSummary();
    const integrityPassed = hashResult.valid && schemaResult.success;

    // Set outputs
    core.setOutput('status', integrityPassed ? 'passed' : 'failed');
    core.setOutput('integrity_passed', integrityPassed.toString());

    // Upload artifact (needed for DB record)
    const artifactUrl = await uploadArtifact(verifiedPath);
    if (artifactUrl) {
      core.setOutput('report-url', artifactUrl);
    }

    // DB write (Action-only, only after validation passes) - must be done before check run
    let dbWriteStatus = '';
    let dbWriteSuccess = true;

    if (integrityPassed) {
      const dbConfig = loadDbConfig();
      if (dbConfig.mode !== 'disabled') {
        core.info(`Writing to remote DB (mode: ${dbConfig.mode})...`);

        const data = validator.getData();
        if (data.report) {
          const ghContext: GitHubContext = {
            repo: { owner, repo },
            sha: actualSha,
            prNumber: actualPrNumber || null,
            baseBranch: github.context.ref?.replace('refs/heads/', '') || null,
            actor: github.context.actor || 'unknown',
            workflowRunUrl: `${github.context.serverUrl}/${owner}/${repo}/actions/runs/${github.context.runId}`,
          };

          const record = buildRecord(
            data.report,
            ghContext,
            validator.getLastLogHash(),
            artifactUrl,
            hashResult.valid
          );

          const dbWriteResult = await writeRecord(record, dbConfig);

          if (dbWriteResult.success) {
            core.info(`✅ DB write successful: record ID = ${dbWriteResult.recordId}`);
            core.setOutput('db-record-id', dbWriteResult.recordId || '');

            // Mode-specific success message
            const modeLabel = dbConfig.mode === 'firebase'
              ? `firebase success (doc: \`${dbWriteResult.recordId}\`)`
              : `success (record ID: \`${dbWriteResult.recordId}\`)`;

            dbWriteStatus = `\n## Database Write\n\n✅ DB write: ${modeLabel}\n`;
          } else {
            dbWriteSuccess = false;
            const warning = `DB write failed: ${dbWriteResult.error}`;
            core.warning(warning);
            core.setOutput('db-write-error', dbWriteResult.error || '');

            // Mode-specific error message
            const errorPrefix = dbConfig.mode === 'firebase'
              ? `firebase failed`
              : `failed`;

            dbWriteStatus = `\n## Database Write\n\n❌ DB write: ${errorPrefix} - ${dbWriteResult.error}\n`;

            if (dbConfig.strictMode) {
              core.setFailed(warning);
              return;
            }
          }
        }
      } else {
        dbWriteStatus = `\n## Database Write\n\nℹ️ DB write disabled\n`;
      }
    } else {
      dbWriteStatus = `\n## Database Write\n\n⏭️ Skipped due to validation failure\n`;
    }

    // Append DB write status to summary before creating check run
    const summaryWithDbStatus = checkSummary.summary + dbWriteStatus;

    // Post check run (now includes DB write status)
    await createCheckRun(
      owner,
      repo,
      token,
      actualSha,
      checkSummary.title,
      summaryWithDbStatus,
      checkSummary.conclusions
    );

    // Post PR comment if requested and we're in a PR
    if (shouldPostPrComment && actualPrNumber) {
      const data = validator.getData();
      if (data.reportMd) {
        await postPrComment(owner, repo, actualPrNumber, token, data.reportMd);
      } else {
        // Use the generated summary if report.md is not available
        await postPrComment(owner, repo, actualPrNumber, token, summaryWithDbStatus);
      }
    }

    // Fail if integrity checks failed and fail-on-integrity-issues is true
    if (!integrityPassed && failOnIntegrityIssues) {
      core.setFailed('Integrity verification failed');
    } else if (!integrityPassed) {
      core.warning('Integrity verification failed but workflow continues (fail-on-integrity-issues=false)');
    } else {
      core.info('✅ All integrity checks passed');
    }

  } catch (error) {
    core.error(`Unhandled error: ${(error as Error).message}`);
    core.setFailed((error as Error).message);
  }
}

// Run the action
run();
