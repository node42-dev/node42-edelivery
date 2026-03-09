/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import fs   from 'fs';
import path from 'path';
import { getUserSchematronDir } from '../cli/paths.js';
import { SVRL_NS }              from '../core/constants.js';
import { c, C }                 from '../cli/color.js'

import { 
  N42Error, 
  N42ErrorCode
}  from '../core/error.js';

const LOCATION_RE = /Q\{[^}]+\}/g;

function getAllSchematronXsls(ruleSet) {
  const srcDir  = path.join(getUserSchematronDir(), ruleSet);
  if (!fs.existsSync(srcDir)) {
    throw new N42Error(N42ErrorCode.DIR_NOT_FOUND, { details: `: ${srcDir}` });
  }

  const xsls = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).map(f => path.join(srcDir, f));
  if (!xsls.length) {
    throw new N42Error(N42ErrorCode.FILE_NOT_FOUND, { details: `No schematron .json files found in ${srcDir}` });
  }
  return xsls.sort();
}

export async function checkSaxonJS(context) {
  try {
    const SaxonJS = (await import('saxon-js')).default;
    context.saxonAvailable = true;
    return SaxonJS;
  } catch {
    context.saxonAvailable = false;
    return null;
  }
}

export async function convertSchematronToXsl(context, inputFile) {
  if (!fs.existsSync(inputFile)) {
    throw new N42Error(N42ErrorCode.FILE_NOT_FOUND, { details: `: ${path.basename(inputFile)}` });
  }
  const inputText = fs.readFileSync(inputFile, 'utf-8').replace(/^\uFEFF/, '').trim();

  context.spinner.start('Loading SaxonJS');
  const SaxonJS = await checkSaxonJS(context);
  if (!SaxonJS) {
    context.spinner.fail('SaxonJS Not Available');
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "SaxonJS" });
  }
  context.spinner.done('Loaded SaxonJS');

  context.spinner.start(`Converting ${path.basename(inputFile)}`);
  const result = SaxonJS.transform({
    stylesheetFileName: path.join(getUserSchematronDir(), 'schxslt', '2.0', 'pipeline-for-svrl.sef.json'),
    sourceText:     inputText,
    destination:    'serialized',
  }, 'sync');
  context.spinner.done(`Converted ${path.basename(inputFile)}`);

  context.spinner.start("Writing XSL File");
  const xslFile = inputFile.replace('.sch', '.xsl');
  fs.writeFileSync(xslFile, result.principalResult, 'utf-8');
  context.spinner.done("Written XSL File");
  
  const linkXslFile = `\u001B]8;;file://${xslFile}\u0007View\u001B]8;;\u0007`;

  console.log();
  console.log(`  ${C.BOLD}RESULT${C.RESET}`);
  console.log(`  XSL file  ${c(C.BLUE, `[${linkXslFile}]`)}`);
  console.log();

  const jsonFile = xslFile.replace('.xsl', '.sef.json');
  console.log(`${c(C.BOLD, 'To generate the SEF file, run:')}\nnpx xslt3 -xsl:${xslFile} -export:${jsonFile} -nogo`);
}

export async function validateDocument(context, document, opts = {}) {
  const { simplifyLocations = true, includeWarnings = false, ruleSet = 'billing' } = opts;

  const xslPaths = context.schematron?.length
    ? context.schematron.map(p => path.resolve(p))
    : getAllSchematronXsls(ruleSet);

  const docStr = Buffer.isBuffer(document) ? document.toString('utf-8') : document;

  // Dynamically import SaxonJS (optional dep — skip validation if unavailable)
  const SaxonJS = await checkSaxonJS(context);
  if (!SaxonJS) {
     context.spinner?.fail?.('Validating Document (SaxonJS Not Available)');
    return [];
  }

  const { DOMParser } = await import('@xmldom/xmldom');
  const allErrors = [];

  for (const xslPath of xslPaths) {
    if (!fs.existsSync(xslPath)) {
      allErrors.push({ message: `Schematron file not found: ${xslPath}`, code: 'CONFIG', severity: 'fatal' });
      continue;
    }

    let svrlStr;
    try {
      const result = SaxonJS.transform({
        stylesheetFileName: xslPath,
        sourceText:         docStr,
        destination:        'serialized',
      }, 'sync');
      svrlStr = result.principalResult;
    } catch (e) {
      allErrors.push({ message: `Schematron transform failed: ${e.message}`, code: 'CONFIG', severity: 'fatal' });
      continue;
    }

    // Parse SVRL
    const svrl = new DOMParser().parseFromString(svrlStr, 'application/xml');
    const fails = svrl.getElementsByTagNameNS(SVRL_NS, 'failed-assert');

    for (let i = 0; i < fails.length; i++) {
      const e        = fails[i];
      const severity = e.getAttribute('flag') || 'fatal';
      if (severity === 'warning' && !includeWarnings) continue;

      let location = e.getAttribute('location') ?? '';
      if (simplifyLocations) location = location.replace(LOCATION_RE, '');

      const textEl  = e.getElementsByTagName('text')[0];
      const message = textEl?.textContent?.trim() ?? '(no message)';

      allErrors.push({
        message,
        code:       e.getAttribute('id') ?? 'unknown-rule',
        severity,
        test:       e.getAttribute('test'),
        location,
        schematron: path.basename(xslPath),
      });
    }
  }

  return allErrors;
}
