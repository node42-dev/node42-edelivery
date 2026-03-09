/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import fs    from 'fs';
import path  from 'path';

import { N42Context }        from './model/context.js';
import { Spinner }           from './cli/spinner.js';
import { c, C }              from './cli/color.js';
import { buildDocument }     from './document/ubl.js';
import { sendDocument }      from './messaging/sender.js';
import { sendAs4Message }    from './messaging/as4.js';
import { generateReports }   from './report.js';

import { 
    checkRequired, 
    isValidDate,
    normalizeFilename 
} from './core/utils.js'

import { 
  validateDocument, 
  convertSchematronToXsl 
}  from './document/validator.js';

import { 
  getCertDetails, 
  getKeyDetails,
  getTruststoreDetails 
} from './security/pki.js';

import { 
  printHeader,
  printArtefacts,
  printSignalMessage,
  printCertInfo
} from './cli/output.js';

import {
  initWorkspace, 
  initUserCerts, 
  initUserSchematrons, 
  initUserTemplates, 
  destExists, 
  initShellCompletion,
  getUserTransactionsDir,
  getUserValidationsDir,
  getUserCertsDir,
  getUserHomeDir
} from './cli/paths.js';

import { 
  N42Error, 
  N42ErrorCode,
  handleError 
} from './core/error.js';


/**
 * Register CLI commands on the commander program instance.
 * @param {import('commander').Command} program
 */
export function registerCommands(program) {
    
    // ── initialize ──────────────────────────────────────────────────────────────

    program.command('init')
    .description('Initialize local Node42 workspace with certificates,\nschematrons, and JSON invoice control structure')
    .action(async () => {
        printHeader('Node42 — eDelivery');
        initWorkspace(true);
        console.log();
    });

    // ── completion ──────────────────────────────────────────────────────────────

    program
    .command("completion <shell>")
    .description("Install shell completion")
    .action((shell) => {
        if (shell !== "bash") {
            throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Only bash supported` });
        }
        initShellCompletion();
    });

    // ── creds ──────────────────────────────────────────────────────────────

    program
    .command("pki")
    .option('-v, --verbose', 'Enable detailed output')
    .description("Display PKI configuration — certificate, private key and truststore\nused for AS4 signing, encryption and peer validation")
    .action((opts) => {
        const spinner = new Spinner();
        const context = new N42Context({
            spinner, 
            verbose: opts.verbose   ?? false,
        });
        
        const certsDir = getUserCertsDir();
        try {

            context.cert = path.join(certsDir, 'cert.pem');
            if (!fs.existsSync(context.cert)) {
                throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Sender certificate not present in ${c(C.BOLD, certsDir)}` }, { retryable: false });
            }
            context.senderCert = fs.readFileSync(context.cert);

            context.key = path.join(certsDir, 'key.pem');
            if (!fs.existsSync(context.key)) {
                throw new N42Error(N42ErrorCode.KEY_NOT_FOUND, { details: `Sender key not present in ${c(C.BOLD, certsDir)}` }, { retryable: false });   
            }
            context.senderKey = fs.readFileSync(context.key);

            context.truststore = path.join(certsDir, 'truststore.pem');
            if (!fs.existsSync(context.truststore)) {
                throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Truststore bundle not present in ${c(C.BOLD, certsDir)}` }, { retryable: false });   
            }
           
            const certDetails = getCertDetails(context);
            const keyDetails = getKeyDetails(context);
            const truststoreDetails = getTruststoreDetails(context);

            printCertInfo(certDetails, keyDetails, truststoreDetails, context.verbose);
        }
        catch(e) {
           handleError(e);
        }
    });

    // ── replay ──────────────────────────────────────────────────────────────

    program
    .command("replay [transactionId]")
    .description("Re-send a previously sent transaction using stored artefacts")
    .action(async (id) => {
        const spinner = new Spinner();
        const srcDir = getUserTransactionsDir();
        try {

            const replayFile = path.join(getUserHomeDir(), `replay.txt`);
            if (!fs.existsSync(replayFile)) {
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND, 
                    { details: `: ${c(C.BOLD, replayFile)}` }, 
                    { retryable: false }
                );
            }
            const replayId = fs.readFileSync(replayFile, 'utf8').trim();
            const transactionId = id ? id : replayId;

            console.log(`${c(C.BOLD, "Replaying message")}: ${transactionId}\n`)

            spinner.start('Loading Context');
            const contextFile = path.join(srcDir, `${transactionId}_context.json`);
            if (!fs.existsSync(contextFile)) {
                spinner.fail('Loading Context Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Transaction context artefact: ${c(C.BOLD, contextFile)}` },
                    { retryable: false }
                );
            }
            const context = JSON.parse(fs.readFileSync(contextFile));
                    context.spinner = new Spinner();
                    context.persist = true;
            
            spinner.done('Loaded Context');

            spinner.start('Loading Message Headers');
            const headersFile = path.join(srcDir, `${transactionId}_message_headers.json`);
            if (!fs.existsSync(headersFile)) {
                spinner.fail('Loading Message Headers Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Message headers artefact: ${c(C.BOLD, headersFile)}` },
                    { retryable: false }
                );
            }
            const headers = JSON.parse(fs.readFileSync(headersFile));
            spinner.done('Loaded Message Headers');
            
            spinner.start('Loading Message Body');
            const bodyFile = path.join(srcDir, `${transactionId}_message_body.txt`);
            if (!fs.existsSync(bodyFile)) {
                spinner.fail('Loading Message Body Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Message body artefact: ${c(C.BOLD, bodyFile)}` },
                    { retryable: false }
                );
            }
            const body = fs.readFileSync(bodyFile);
            spinner.done('Loaded Message Body');

            await sendAs4Message(context, headers, body); 

            if (context.persist) {
                console.log();
                printArtefacts(context);
            }
        }
        catch(e) {
           handleError(e);
        }
    });

    // ── convert ──────────────────────────────────────────────────────────────

    const convertCmd = program.command('convert').description('Convert schematron files');
    const convertSch = convertCmd.command('sch').description('Convert .sch schematron to .xsl');

    convertSch
    .argument('<path>', 'Path to .sch schematron file')
    .action(async (schPath) => {
        const spinner = new Spinner();
        const context = new N42Context({
            spinner 
        });

        console.log(`${c(C.BOLD, "Convert schematron")}: ${path.basename(schPath)}\n`)

        try { 
            await convertSchematronToXsl(context, schPath);
            console.log(); 
        }
        catch(e) {
            handleError(e);
        }
    });

    // ── peppol reporting ──────────────────────────────────────────────────────────────

    const reportCmd = program.command('report').description('Generate reporting data');
    const peppolReport = reportCmd.command('peppol').description('Generate Peppol reporting data');

    peppolReport
    .option('--from <yyyy-mm-dd>', 'Start date of the reporting period')
    .option('--to <yyyy-mm-dd>', 'End date of the reporting period')
    .action(async (options) => {
        const spinner = new Spinner();
        const context = new N42Context({
            spinner 
        });

        try {

            if (!options.from || !options.to) {
                throw new N42Error(
                    N42ErrorCode.INVALID_INPUT,
                    { details: "--from and --to are required" }
                );
            }

            if (!isValidDate(options.from) || !isValidDate(options.to)) {
                throw new N42Error(
                N42ErrorCode.INVALID_INPUT,
                { details: "Dates must be valid ISO dates in format YYYY-MM-DD" }
                );
            }

            console.log(`${c(C.BOLD, "Peppol reporting")}: ${options.from} → ${options.to}\n`)

            const { endUserReportPath, transactionsReportPath } = await generateReports(context, options.from, options.to);

            const linkTransactionsReport = `\u001B]8;;file://${transactionsReportPath}\u0007View\u001B]8;;\u0007`;
            const linkEndUserReport = `\u001B]8;;file://${endUserReportPath}\u0007View\u001B]8;;\u0007`;

            console.log();
            console.log(`  ${C.BOLD}REPORTS${C.RESET}`);
            console.log(`  Transactions ${c(C.BLUE, `[${linkTransactionsReport}]`)}`);
            console.log(`  End-User     ${c(C.BLUE, `[${linkEndUserReport}]`)}`);
            console.log();
        }
        catch(e) {
            handleError(e);
        }
        
    });

    // ── send peppol ──────────────────────────────────────────────────────────────

    const sendCmd = program.command('send').description('Send a document');
    const peppolSend = sendCmd.command('peppol').description('Send a Peppol UBL document via AS4');

    peppolSend
    .option('-e, --env <env>',        'Target environment: prod or test', 'test')
    .option('-d, --document <path>',  'Path to UBL XML document')
    .option('--ubl <path>',           'Path to UBL document descriptor')
    .option('--schematron <xsl...>',  'Schematron XSL files for validation')
    .option('--cert-id <uuid>',       'Probe certificate ID')
    .option('--cert <path>',          'Certificate PEM path', 'cert.pem')
    .option('--key <path>',           'Private key PEM path', 'key.pem')
    .option('--key-pass <secret>',    'Private key passphrase', '')
    .option('--truststore <path>',    'Truststore PEM path', '')
    .option('--sender-id <id>',       'Sender participant ID')
    .option('--receiver-id <id>',     'Receiver participant ID')
    .option('--sender-country <cc>',  'Sender country code')
    .option('--endpoint-url <url>',   'Override SMP endpoint URL')
    .option('--hostname <host>',      'Hostname for message IDs')
    .option('--strip-sbdh',           'Strip and re-wrap existing SBDH')
    .option('--dryrun',               'Prepare but do not transmit')
    .option('-p, --persist',          'Persist transaction data to disk')
    .option('-v, --verbose',          'Enable detailed output')
    .action(async (opts) => {
        const spinner = new Spinner();
        const context = new N42Context({
            command:       'send',
            subcommand:    'peppol',
            env:           opts.env,
            document:      opts.document,
            ubl:           opts.ubl,
            schematron:    opts.schematron ?? [],
            certId:        opts.certId,
            cert:          opts.cert,
            key:           opts.key,
            keyPass:       opts.keyPass,
            truststore:    opts.truststore,
            senderId:      opts.senderId,
            receiverId:    opts.receiverId,
            senderCountry: opts.senderCountry,
            endpointUrl:   opts.endpointUrl,
            hostname:      opts.hostname,
            stripSbdh:     opts.stripSbdh ?? false,
            dryrun:        opts.dryrun    ?? false,
            persist:       opts.persist   ?? false,
            verbose:       opts.verbose   ?? false,
            spinner,
        });

        printHeader('Node42 — eDelivery');

        initUserCerts(context);
        initUserSchematrons(context);
        initUserTemplates(context);

        try {

            let document;
            if (context.document && destExists(context.document)) {
                spinner.start('Loading Document');
                document = fs.readFileSync(context.document);
                spinner.done('Loaded Document');
            } 
            else {

                const missing = checkRequired(context);
                if (missing.length) {
                    throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Missing required field(s): ${c(C.BOLD, missing.join(', '))}` });
                }

                const res = buildDocument(context);
                document  = res.xml;

                if (context.persist) {
                    const outDir = getUserTransactionsDir();
                    fs.writeFileSync(path.join(outDir, `${context.id}_document.xml`), document);
                }
            }

            await sendDocument(context, document);
            console.log();

            if (context.signalMessage) {
                printSignalMessage(context);
            }

            if (context.persist) {
                printArtefacts(context);
            }
        } 
        catch (e) {
            if (context.signalMessage) {
                printSignalMessage(context);
            } else {
                handleError(e);
                process.exit(1);
            }
        }
    });

    // ── validate peppol ──────────────────────────────────────────────────────────

    const validateCmd = program.command('validate').description('Validate a document');
    const peppolValidate = validateCmd.command('peppol').description('Validate a Peppol UBL document');

    peppolValidate
    .requiredOption('--document <path>', 'Path to UBL XML document')
    .option('--schematron <xsl...>',     'Schematron XSL files')
    .option('-p, --persist',             'Persist validation errors to disk')
    .option('-v, --verbose',             'Enable detailed output')
    .action(async (opts) => {
        const spinner = new Spinner();
        const context = new N42Context({
            command:    'validate',
            subcommand: 'peppol',
            document:   opts.document,
            schematron: opts.schematron ?? [],
            persist:    opts.persist ?? false,
            verbose:    opts.verbose ?? false,
            spinner,
        });

        const fileName = path.basename(context.document);
        printHeader(`Validating ${c(C.BOLD, fileName)}`);

        try {

            spinner.start('Loading Document');
            if (!fs.existsSync(context.document) || fs.statSync(context.document).isDirectory()) {
                spinner.fail('Loading Document Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Document: ${c(C.BOLD, context.document)}` },
                    { retryable: false }
                );
            }
            const document = fs.readFileSync(context.document);
            spinner.done('Loaded Document');

            initUserSchematrons(context);

            spinner.start('Validating Document');
            const errors   = await validateDocument(context, document);
            spinner.done('Validated Document', errors.length === 0);

            if (context.persist) {
                const valDir = getUserValidationsDir();
                const valPath = path.join(valDir, `${normalizeFilename(fileName)}_validation.json`)

                fs.writeFileSync(valPath, JSON.stringify(errors, null, 2));

                const linkValidation = `\u001B]8;;file://${valPath}\u0007View\u001B]8;;\u0007`;

                console.log();
                console.log(`  ${C.BOLD}RESULT${C.RESET}`);
                console.log(`  Found ${c(C.BOLD, errors.length)} error(s) ${c(C.BLUE, `[${linkValidation}]`)}`);
                console.log();
            } 
            else {
                console.log();
                console.log(`  ${C.BOLD}RESULT${C.RESET}`);
                console.log(`  Found ${c(C.BOLD, errors.length)} error(s)`);
                console.log(JSON.stringify(errors, null, 2));
                console.log();
            }
        }
        catch(e) {
            handleError(e);
        }
    });
}