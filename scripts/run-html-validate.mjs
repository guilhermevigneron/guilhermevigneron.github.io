import fs from 'node:fs';
import path from 'node:path';
import { HtmlValidate } from 'html-validate';
import { isEntrypoint, REPORTS_DIR, SITE_DIR } from './lib/paths.mjs';

export function collectHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export async function validateHtmlFiles(targetDir = SITE_DIR, reportsOutputDir = REPORTS_DIR) {
  if (!fs.existsSync(targetDir)) {
    throw new Error(
      `${path.basename(targetDir)} directory does not exist. Run "npm run build" first.`
    );
  }

  const htmlFiles = collectHtmlFiles(targetDir);
  if (htmlFiles.length === 0) {
    throw new Error(`No HTML files found in ${targetDir}`);
  }

  const htmlvalidate = new HtmlValidate({
    extends: ['html-validate:recommended'],
  });

  const fileReports = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let allValid = true;

  for (const filePath of htmlFiles) {
    const relPath = path.relative(targetDir, filePath).replace(/\\/g, '/');
    const report = await htmlvalidate.validateFile(filePath);
    totalErrors += report.errorCount;
    totalWarnings += report.warningCount;
    if (!report.valid) {
      allValid = false;
    }

    const messages = report.results.flatMap((res) =>
      res.messages.map((msg) => ({
        ruleId: msg.ruleId,
        severity: msg.severity === 2 ? 'error' : 'warning',
        message: msg.message,
        line: msg.line,
        column: msg.column,
      }))
    );

    fileReports.push({
      file: `/${relPath}`,
      valid: report.valid,
      errorCount: report.errorCount,
      warningCount: report.warningCount,
      messages,
    });

    if (messages.length > 0) {
      console.error(`\n[${relPath}]`);
      for (const msg of messages) {
        console.error(
          `  ${msg.severity.toUpperCase()} ${msg.line}:${msg.column} (${msg.ruleId}): ${msg.message}`
        );
      }
    } else {
      console.log(`PASS /${relPath} (0 errors, 0 warnings)`);
    }
  }

  const summary = {
    valid: allValid,
    fileCount: htmlFiles.length,
    errorCount: totalErrors,
    warningCount: totalWarnings,
    files: fileReports,
    timestamp: new Date().toISOString(),
  };

  if (reportsOutputDir) {
    fs.mkdirSync(reportsOutputDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsOutputDir, 'html-validate.json'),
      JSON.stringify(summary, null, 2)
    );
  }

  return summary;
}

if (isEntrypoint(import.meta.url)) {
  validateHtmlFiles()
    .then((summary) => {
      if (!summary.valid) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
